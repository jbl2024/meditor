<script setup lang="ts">
/**
 * EditorView
 *
 * Purpose:
 * - Orchestrates the note editing experience around an EditorJS instance.
 *
 * Responsibilities:
 * - Wire editor lifecycle (mount, destroy, load, save, autosave triggers).
 * - Coordinate domain behaviors (wikilinks, shortcuts, code-block UI, outline).
 * - Bind UI sections (properties panel, slash menu, wikilink menu, load overlay).
 *
 * Boundaries:
 * - Business/state behaviors are delegated to composables where possible.
 * - This component remains the integration layer between EditorJS, UI events, and app APIs.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorJS, { type OutputBlockData } from '@editorjs/editorjs'
import CodeTool from '@editorjs/code'
import Delimiter from '@editorjs/delimiter'
import Header from '@editorjs/header'
import InlineCode from '@editorjs/inline-code'
import List from '@editorjs/list'
import Paragraph from '@editorjs/paragraph'
import Table from '@editorjs/table'
import CalloutTool from '../lib/editorjs/CalloutTool'
import MermaidTool from '../lib/editorjs/MermaidTool'
import QuoteTool from '../lib/editorjs/QuoteTool'
import {
  editorDataToMarkdown,
  markdownToEditorData,
  sanitizeExternalHref,
  type EditorBlock
} from '../lib/markdownBlocks'
import { openExternalUrl } from '../lib/api'
import EditorPropertiesPanel from './editor/EditorPropertiesPanel.vue'
import EditorSlashMenu from './editor/EditorSlashMenu.vue'
import EditorWikilinkMenu from './editor/EditorWikilinkMenu.vue'
import EditorLargeDocOverlay from './editor/EditorLargeDocOverlay.vue'
import EditorMermaidReplaceDialog from './editor/EditorMermaidReplaceDialog.vue'
import { composeMarkdownDocument, serializeFrontmatter } from '../lib/frontmatter'
import { useEditorPersistence } from '../composables/useEditorPersistence'
import { useFrontmatterProperties } from '../composables/useFrontmatterProperties'
import { useCodeBlockUi } from '../composables/useCodeBlockUi'
import { useWikilinkBehavior } from '../composables/useWikilinkBehavior'
import { useEditorInteraction } from '../composables/useEditorInteraction'
import { useEditorDocumentLifecycle } from '../composables/useEditorDocumentLifecycle'
import {
  normalizeBlockId,
  normalizeHeadingAnchor,
  slugifyHeading,
  type WikilinkAnchor
} from '../lib/wikilinks'

const VIRTUAL_TITLE_BLOCK_ID = '__virtual_title__'
type CorePropertyOption = {
  key: string
  label?: string
  description?: string
}
const CORE_PROPERTY_OPTIONS: CorePropertyOption[] = [
  { key: 'tags', label: 'tags', description: 'Tag list' },
  { key: 'aliases', label: 'aliases', description: 'Alternative names' },
  { key: 'cssclasses', label: 'cssclasses', description: 'Note CSS classes' },
  { key: 'date', label: 'date', description: 'Primary date (YYYY-MM-DD)' },
  { key: 'deadline', label: 'deadline', description: 'Due date (YYYY-MM-DD)' },
  { key: 'archive', label: 'archive', description: 'Archive flag' },
  { key: 'published', label: 'published', description: 'Publish flag' }
]

type SlashCommand = {
  id: string
  label: string
  type: string
  data: Record<string, unknown>
}

type HeadingNode = {
  level: 1 | 2 | 3
  text: string
}

type CaretSnapshot =
  | { kind: 'contenteditable'; blockIndex: number; offset: number }
  | { kind: 'text-input'; blockIndex: number; offset: number }

type ListStyle = 'unordered' | 'ordered' | 'checklist'

function emptyListData(style: ListStyle, checked = false) {
  return {
    style,
    meta: {},
    items: [
      {
        content: '',
        meta: style === 'checklist' ? { checked } : {},
        items: []
      }
    ]
  }
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'heading', label: 'Heading', type: 'header', data: { text: '', level: 2 } },
  { id: 'bullet', label: 'List', type: 'list', data: emptyListData('unordered') },
  { id: 'checklist', label: 'Checklist', type: 'list', data: emptyListData('checklist') },
  { id: 'table', label: 'Table', type: 'table', data: { withHeadings: true, content: [['', ''], ['', '']] } },
  { id: 'callout', label: 'Callout', type: 'callout', data: { kind: 'NOTE', message: '' } },
  { id: 'mermaid', label: 'Mermaid', type: 'mermaid', data: { code: 'flowchart TD\n  A[Start] --> B[End]' } },
  { id: 'code', label: 'Code', type: 'code', data: { code: '' } },
  { id: 'quote', label: 'Quote', type: 'quote', data: { text: '' } },
  { id: 'divider', label: 'Divider', type: 'delimiter', data: {} }
]

const props = defineProps<{
  path: string
  openFile: (path: string) => Promise<string>
  saveFile: (path: string, text: string, options: { explicit: boolean }) => Promise<{ persisted: boolean }>
  renameFileFromTitle: (path: string, title: string) => Promise<{ path: string; title: string }>
  loadLinkTargets: () => Promise<string[]>
  loadLinkHeadings: (target: string) => Promise<string[]>
  loadPropertyTypeSchema: () => Promise<Record<string, string>>
  savePropertyTypeSchema: (schema: Record<string, string>) => Promise<void>
  openLinkTarget: (target: string) => Promise<boolean>
}>()

const emit = defineEmits<{
  status: [payload: { path: string; dirty: boolean; saving: boolean; saveError: string }]
  'path-renamed': [payload: { from: string; to: string; manual: boolean }]
  outline: [payload: HeadingNode[]]
  properties: [payload: { path: string; items: Array<{ key: string; value: string }>; parseErrorCount: number }]
}>()

const holder = ref<HTMLDivElement | null>(null)
const checklistDebugOn = ref(false)
const editorZoom = ref(1)
let editor: EditorJS | null = null
let outlineTimer: ReturnType<typeof setTimeout> | null = null
let titleLockTimer: ReturnType<typeof setTimeout> | null = null
let suppressOnChange = false

const slashOpen = ref(false)
const slashIndex = ref(0)
const slashLeft = ref(0)
const slashTop = ref(0)

const currentPath = computed(() => props.path?.trim() || '')
const editorZoomStyle = computed(() => ({ '--editor-zoom': String(editorZoom.value) }))
const isMacOs = typeof navigator !== 'undefined' && /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform || navigator.userAgent)
const {
  loadedTextByPath,
  dirtyByPath,
  scrollTopByPath,
  caretByPath,
  savingByPath,
  setDirty,
  setSaving,
  setSaveError,
  clearAutosaveTimer,
  scheduleAutosave,
  movePathState: movePersistencePathState
} = useEditorPersistence<CaretSnapshot>({
  emitStatus: (payload) => emit('status', payload),
  isEditingVirtualTitle,
  saveCurrentFile
})
const {
  propertyEditorMode,
  frontmatterByPath,
  rawYamlByPath,
  activeParseErrors,
  activeRawYaml,
  canUseStructuredProperties,
  structuredPropertyFields,
  structuredPropertyKeys,
  ensurePropertySchemaLoaded,
  resetPropertySchemaState,
  parseAndStoreFrontmatter,
  serializableFrontmatterFields,
  addPropertyField,
  removePropertyField,
  onPropertyTypeChange,
  onPropertyKeyInput,
  onPropertyValueInput,
  onPropertyCheckboxInput,
  onPropertyTokensChange,
  effectiveTypeForField,
  isPropertyTypeLocked,
  propertiesExpanded,
  togglePropertiesVisibility,
  onRawYamlInput,
  movePathState: moveFrontmatterPathState
} = useFrontmatterProperties({
  currentPath,
  loadPropertyTypeSchema: props.loadPropertyTypeSchema,
  savePropertyTypeSchema: props.savePropertyTypeSchema,
  onDirty: (path) => {
    setDirty(path, true)
    setSaveError(path, '')
    scheduleAutosave()
  },
  emitProperties: (payload) => emit('properties', payload)
})
const {
  initFromStorage: initCodeUiFromStorage,
  ensureCodeBlockUi,
  startObservers: startCodeUiObservers,
  stopObservers: stopCodeUiObservers
} = useCodeBlockUi({ holder })
const {
  wikilinkOpen,
  wikilinkIndex,
  wikilinkLeft,
  wikilinkTop,
  wikilinkResults,
  closeWikilinkMenu,
  applyWikilinkSelection,
  applyWikilinkDraftSelection,
  expandAdjacentLinkForEditing,
  collapseExpandedLinkIfCaretOutside,
  consumeSuppressCollapseOnArrowKeyup,
  collapseClosedLinkNearCaret,
  shouldSyncWikilinkFromSelection,
  isWikilinkRelevantKey,
  syncWikilinkMenuFromCaret,
  readWikilinkTargetFromAnchor,
  openLinkTargetWithAutosave,
  isDateLinkModifierPressed,
  openLinkedTokenAtCaret,
  setMenuElement: setWikilinkMenuElement
} = useWikilinkBehavior({
  holder,
  currentPath,
  dirtyByPath,
  isMacOs,
  loadLinkTargets: props.loadLinkTargets,
  loadLinkHeadings: props.loadLinkHeadings,
  openLinkTarget: props.openLinkTarget,
  saveCurrentFile,
  clearAutosaveTimer,
  setDirty,
  setSaveError,
  scheduleAutosave,
  parseOutlineFromDom
})
const mermaidReplaceDialog = ref<{
  visible: boolean
  templateLabel: string
  resolve: ((approved: boolean) => void) | null
}>({
  visible: false,
  templateLabel: '',
  resolve: null
})

function noteTitleFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  const name = parts[parts.length - 1] || normalized
  const stem = name.replace(/\.(md|markdown)$/i, '').trim()
  return stem || 'Untitled'
}

function extractPlainText(value: unknown): string {
  const html = String(value ?? '')
  if (!html.trim()) return ''
  const container = document.createElement('div')
  container.innerHTML = html
  return container.innerText.replace(/\u200B/g, ' ').replace(/\s+/g, ' ').trim()
}

function blockTextCandidate(block: OutputBlockData | undefined): string {
  if (!block) return ''
  const data = (block.data as Record<string, unknown>) ?? {}
  if (typeof data.text !== 'undefined') return extractPlainText(data.text)
  if (typeof data.code === 'string') return data.code.trim()
  return ''
}

function virtualTitleBlock(title: string): OutputBlockData {
  return {
    id: VIRTUAL_TITLE_BLOCK_ID,
    type: 'header',
    data: { level: 1, text: title.trim() || 'Untitled' }
  } as OutputBlockData
}

function stripVirtualTitle(blocks: OutputBlockData[]): OutputBlockData[] {
  return blocks.filter((block) => block.id !== VIRTUAL_TITLE_BLOCK_ID)
}

function readVirtualTitle(blocks: OutputBlockData[]): string {
  const virtual = blocks.find((block) => block.id === VIRTUAL_TITLE_BLOCK_ID)
  return blockTextCandidate(virtual)
}

function withVirtualTitle(blocks: OutputBlockData[], title: string): { blocks: OutputBlockData[]; changed: boolean } {
  const content = stripVirtualTitle(
    blocks.map((block) => ({
      ...block,
      data: { ...(block.data as Record<string, unknown>) }
    }))
  )
  const desired = title.trim() || 'Untitled'
  const next = [virtualTitleBlock(desired), ...content]

  const first = blocks[0]
  const firstLevel = Number(((first?.data as Record<string, unknown>)?.level ?? 0))
  const firstText = blockTextCandidate(first)
  const hasSingleLeadingVirtual =
    Boolean(first) &&
    first.id === VIRTUAL_TITLE_BLOCK_ID &&
    first.type === 'header' &&
    firstLevel === 1 &&
    firstText === desired &&
    !blocks.slice(1).some((block) => block.id === VIRTUAL_TITLE_BLOCK_ID)

  const changed = !hasSingleLeadingVirtual || blocks.length !== next.length
  return { blocks: next, changed }
}

function textOffsetWithinRoot(selection: Selection, root: HTMLElement): number | null {
  if (!selection.rangeCount || !selection.isCollapsed) return null
  const node = selection.focusNode
  if (!node || !root.contains(node)) return null

  const range = document.createRange()
  range.selectNodeContents(root)
  range.setEnd(node, selection.focusOffset)
  return range.toString().length
}

function resolveTextPosition(root: HTMLElement, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let current = walker.nextNode() as Text | null

  while (current) {
    const length = current.data.length
    if (remaining <= length) {
      return { node: current, offset: remaining }
    }
    remaining -= length
    current = walker.nextNode() as Text | null
  }

  if (!root.lastChild || root.lastChild.nodeType !== Node.TEXT_NODE) {
    root.appendChild(document.createTextNode(''))
  }
  const tail = root.lastChild as Text
  return { node: tail, offset: tail.data.length }
}

function isTextEntryElement(element: HTMLElement): element is HTMLTextAreaElement | HTMLInputElement {
  if (element instanceof HTMLTextAreaElement) return true
  if (!(element instanceof HTMLInputElement)) return false
  const type = (element.type || 'text').toLowerCase()
  return ['text', 'search', 'url', 'tel', 'password', 'email', 'number'].includes(type)
}

function captureCaret(path: string) {
  if (!path || !holder.value) return
  const blocks = Array.from(holder.value.querySelectorAll('.ce-block')) as HTMLElement[]

  const activeElement = document.activeElement as HTMLElement | null
  if (activeElement && holder.value.contains(activeElement)) {
    if (isTextEntryElement(activeElement)) {
      const block = activeElement.closest('.ce-block') as HTMLElement | null
      if (!block) return
      const blockIndex = blocks.indexOf(block)
      if (blockIndex < 0) return
      caretByPath.value = {
        ...caretByPath.value,
        [path]: {
          kind: 'text-input',
          blockIndex,
          offset: activeElement.selectionStart ?? 0
        }
      }
      return
    }
  }

  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return
  const node = selection.focusNode
  if (!node) return
  const parent = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  const block = parent?.closest('.ce-block') as HTMLElement | null
  if (!block) return
  const blockIndex = blocks.indexOf(block)
  if (blockIndex < 0) return
  const editable = block.querySelector('[contenteditable="true"]') as HTMLElement | null
  if (!editable) return
  const offset = textOffsetWithinRoot(selection, editable)
  if (offset === null) return

  caretByPath.value = {
    ...caretByPath.value,
    [path]: {
      kind: 'contenteditable',
      blockIndex,
      offset
    }
  }
}

function restoreCaret(path: string): boolean {
  if (!path || !holder.value) return false
  const snapshot = caretByPath.value[path]
  if (!snapshot) return false
  const blocks = Array.from(holder.value.querySelectorAll('.ce-block')) as HTMLElement[]
  const block = blocks[snapshot.blockIndex]
  if (!block) return false

  if (snapshot.kind === 'text-input') {
    const input = Array.from(block.querySelectorAll('textarea, input'))
      .find((element) => isTextEntryElement(element as HTMLElement)) as HTMLTextAreaElement | HTMLInputElement | undefined
    if (!input) return false
    const max = input.value.length
    const offset = Math.max(0, Math.min(snapshot.offset, max))
    input.focus()
    input.setSelectionRange(offset, offset)
    return true
  }

  const editable = block.querySelector('[contenteditable="true"]') as HTMLElement | null
  if (!editable) return false
  const resolved = resolveTextPosition(editable, snapshot.offset)
  if (!resolved) return false

  editable.focus()
  const selection = window.getSelection()
  if (!selection) return false
  const range = document.createRange()
  range.setStart(resolved.node, resolved.offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

async function renderBlocks(blocks: OutputBlockData[]) {
  if (!editor) return
  const rememberedScroll = holder.value?.scrollTop ?? 0
  suppressOnChange = true
  try {
    await editor.render({
      time: Date.now(),
      version: '2.0.0',
      blocks
    })
  } finally {
    suppressOnChange = false
  }
  await nextTick()
  if (holder.value) {
    holder.value.scrollTop = rememberedScroll
  }
}

function clearOutlineTimer() {
  if (!outlineTimer) return
  clearTimeout(outlineTimer)
  outlineTimer = null
}

function clearTitleLockTimer() {
  if (!titleLockTimer) return
  clearTimeout(titleLockTimer)
  titleLockTimer = null
}

function resolveMermaidReplaceDialog(approved: boolean) {
  const resolver = mermaidReplaceDialog.value.resolve
  mermaidReplaceDialog.value = {
    visible: false,
    templateLabel: '',
    resolve: null
  }
  resolver?.(approved)
}

function requestMermaidReplaceConfirm(payload: { templateLabel: string }): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (mermaidReplaceDialog.value.resolve) {
      mermaidReplaceDialog.value.resolve(false)
    }
    mermaidReplaceDialog.value = {
      visible: true,
      templateLabel: payload.templateLabel,
      resolve
    }
  })
}

function isEditingVirtualTitle(): boolean {
  if (!holder.value) return false
  const selection = window.getSelection()
  if (!selection?.focusNode) return false

  const focusedElement =
    selection.focusNode.nodeType === Node.ELEMENT_NODE
      ? (selection.focusNode as Element)
      : selection.focusNode.parentElement
  if (!focusedElement) return false

  const block = focusedElement.closest('.ce-block') as HTMLElement | null
  return block?.dataset.id === VIRTUAL_TITLE_BLOCK_ID
}

function isVirtualTitleDomValid(): boolean {
  if (!holder.value) return true
  const firstBlock = holder.value.querySelector('.ce-block') as HTMLElement | null
  if (!firstBlock) return false
  if (firstBlock.dataset.id !== VIRTUAL_TITLE_BLOCK_ID) return false
  const header = firstBlock.querySelector('.ce-header') as HTMLElement | null
  return Boolean(header && header.tagName.toLowerCase() === 'h1')
}

async function enforceVirtualTitleStructure() {
  if (!editor || suppressOnChange) return
  const path = currentPath.value
  if (!path) return

  const data = await editor.save()
  const rawBlocks = (data.blocks ?? []) as OutputBlockData[]
  const title = readVirtualTitle(rawBlocks) || blockTextCandidate(rawBlocks[0]) || noteTitleFromPath(path)
  const normalized = withVirtualTitle(rawBlocks, title)
  if (!normalized.changed) return
  await renderBlocks(normalized.blocks)
}

function scheduleVirtualTitleLock() {
  clearTitleLockTimer()
  titleLockTimer = setTimeout(() => {
    if (isVirtualTitleDomValid()) return
    void enforceVirtualTitleStructure()
  }, 80)
}

function closeSlashMenu() {
  slashOpen.value = false
  slashIndex.value = 0
}

function getCurrentBlock() {
  if (!editor) return null
  const index = editor.blocks.getCurrentBlockIndex()
  if (index < 0) return null
  return editor.blocks.getBlockByIndex(index) ?? null
}

function getEditableElement(block: { holder: HTMLElement }) {
  return block.holder.querySelector('[contenteditable="true"]') as HTMLElement | null
}

function getCurrentBlockText(block: { holder: HTMLElement }) {
  const editable = getEditableElement(block)
  return (editable?.innerText ?? '').replace(/\u200B/g, '').trim()
}

function isCurrentBlockEmpty() {
  const block = getCurrentBlock()
  if (!block) return false
  return getCurrentBlockText(block).length === 0
}

function placeCaretInBlock(blockId: string) {
  if (!editor) return
  const block = editor.blocks.getById(blockId)
  if (!block) return

  const editable = getEditableElement(block)
  if (!editable) return

  editable.focus()
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  range.selectNodeContents(editable)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function firstEditableNonVirtualBlockId(): string | null {
  if (!holder.value) return null
  const blocks = Array.from(holder.value.querySelectorAll('.ce-block')) as HTMLElement[]
  for (const block of blocks) {
    const id = block.dataset.id ?? ''
    if (!id || id === VIRTUAL_TITLE_BLOCK_ID) continue
    const editable = block.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (editable) return id
  }
  return null
}

function focusEditor() {
  if (!holder.value) return
  const editable = holder.value.querySelector('[contenteditable="true"]') as HTMLElement | null
  editable?.focus()
}

function clampEditorZoom(value: number): number {
  return Math.max(0.8, Math.min(1.6, Number(value.toFixed(2))))
}

function setEditorZoom(next: number) {
  editorZoom.value = clampEditorZoom(next)
  window.localStorage.setItem('meditor:editor:zoom', String(editorZoom.value))
}

function zoomEditorBy(delta: number) {
  setEditorZoom(editorZoom.value + delta)
}

function resetEditorZoom() {
  setEditorZoom(1)
}

async function focusFirstContentBlock() {
  if (!editor) return

  const existing = firstEditableNonVirtualBlockId()
  if (existing) {
    placeCaretInBlock(existing)
    return
  }

  // New/empty notes have only the virtual title block. Create one real paragraph
  // block for typing, but don't mark the document dirty until the user edits.
  suppressOnChange = true
  try {
    const inserted = editor.blocks.insert('paragraph', { text: '' }, undefined, 1, true, false)
    await nextTick()
    placeCaretInBlock(inserted.id)
  } finally {
    suppressOnChange = false
  }
}

function replaceCurrentBlock(type: string, data: Record<string, unknown>): boolean {
  if (!editor) return false
  const index = editor.blocks.getCurrentBlockIndex()
  if (index < 0) return false

  try {
    const inserted = editor.blocks.insert(type, data, undefined, index, true, true)
    const blockId = inserted?.id ?? editor.blocks.getBlockByIndex(index)?.id ?? null
    if (blockId) {
      if (!editor.caret.setToBlock(blockId, 'start')) {
        placeCaretInBlock(blockId)
      }
    } else {
      editor.caret.focus()
    }
    return true
  } catch (error) {
    console.error('Failed to replace current block', error)
    return false
  }
}

function insertParsedMarkdownBlocks(parsedBlocks: OutputBlockData[]) {
  if (!editor || parsedBlocks.length === 0) return

  const index = editor.blocks.getCurrentBlockIndex()
  if (index < 0) return

  const current = editor.blocks.getBlockByIndex(index)
  const currentIsEmptyParagraph =
    Boolean(current) && current?.name === 'paragraph' && getCurrentBlockText(current).length === 0

  const [first, ...rest] = parsedBlocks

  if (currentIsEmptyParagraph) {
    const inserted = editor.blocks.insert(first.type, first.data, undefined, index, true, true)
    if (rest.length > 0) {
      editor.blocks.insertMany(rest, index + 1)
    }
    placeCaretInBlock(inserted.id)
    return
  }

  const insertionIndex = index + 1
  const inserted = editor.blocks.insert(first.type, first.data, undefined, insertionIndex, true, false)
  if (rest.length > 0) {
    editor.blocks.insertMany(rest, insertionIndex + 1)
  }
  placeCaretInBlock(inserted.id)
}
const { onEditorKeydown, onEditorKeyup, onEditorClick, onEditorContextMenu, onEditorPaste } = useEditorInteraction({
  getEditor: () => editor,
  currentPath,
  wikilinkOpen,
  wikilinkIndex,
  wikilinkResults,
  slashOpen,
  slashIndex,
  slashCommands: SLASH_COMMANDS,
  virtualTitleBlockId: VIRTUAL_TITLE_BLOCK_ID,
  getCurrentBlock,
  getCurrentBlockText,
  isCurrentBlockEmpty,
  replaceCurrentBlock,
  insertParsedMarkdownBlocks,
  closeSlashMenu,
  closeWikilinkMenu,
  applyWikilinkSelection,
  applyWikilinkDraftSelection,
  expandAdjacentLinkForEditing,
  consumeSuppressCollapseOnArrowKeyup,
  collapseExpandedLinkIfCaretOutside,
  collapseClosedLinkNearCaret,
  shouldSyncWikilinkFromSelection,
  isWikilinkRelevantKey,
  syncWikilinkMenuFromCaret,
  readWikilinkTargetFromAnchor,
  openLinkTargetWithAutosave,
  isDateLinkModifierPressed,
  openLinkedTokenAtCaret,
  zoomEditorBy,
  resetEditorZoom,
  sanitizeExternalHref,
  openExternalUrl,
  markdownToEditorData,
  captureCaret
})

function parseOutlineFromDom(): HeadingNode[] {
  if (!holder.value) return []
  const headers = Array.from(holder.value.querySelectorAll('.ce-header')) as HTMLElement[]
  const out: HeadingNode[] = []

  for (const header of headers) {
    const block = header.closest('.ce-block') as HTMLElement | null
    if (block?.dataset.id === VIRTUAL_TITLE_BLOCK_ID) continue
    const text = header.innerText.trim()
    if (!text) continue
    const tag = header.tagName.toLowerCase()
    const levelRaw = Number.parseInt(tag.replace('h', ''), 10)
    const level = (levelRaw >= 1 && levelRaw <= 3 ? levelRaw : 3) as 1 | 2 | 3
    out.push({ level, text })
  }

  return out
}

function getOutlineHeaderByIndex(index: number): HTMLElement | null {
  if (!holder.value || index < 0) return null
  const headers = Array.from(holder.value.querySelectorAll('.ce-header')) as HTMLElement[]
  let visibleIndex = 0

  for (const header of headers) {
    const block = header.closest('.ce-block') as HTMLElement | null
    if (block?.dataset.id === VIRTUAL_TITLE_BLOCK_ID) continue
    const text = header.innerText.trim()
    if (!text) continue
    if (visibleIndex === index) return header
    visibleIndex += 1
  }

  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function headingMatchesAnchor(headerText: string, anchorHeading: string): boolean {
  const wanted = normalizeHeadingAnchor(anchorHeading)
  if (!wanted) return false
  const actual = normalizeHeadingAnchor(headerText)
  if (actual === wanted) return true

  const wantedSlug = slugifyHeading(anchorHeading)
  const actualSlug = slugifyHeading(headerText)
  return Boolean(wantedSlug && actualSlug && wantedSlug === actualSlug)
}

function getHeaderByAnchor(heading: string): HTMLElement | null {
  if (!holder.value) return null
  const headers = Array.from(holder.value.querySelectorAll('.ce-header')) as HTMLElement[]
  for (const header of headers) {
    const block = header.closest('.ce-block') as HTMLElement | null
    if (block?.dataset.id === VIRTUAL_TITLE_BLOCK_ID) continue
    const text = header.innerText.trim()
    if (!text) continue
    if (headingMatchesAnchor(text, heading)) return header
  }
  return null
}

function getBlockByAnchor(blockIdRaw: string): HTMLElement | null {
  if (!holder.value) return null
  const blockId = normalizeBlockId(blockIdRaw)
  if (!blockId) return null
  const matcher = new RegExp(`(^|\\s)\\^${escapeRegExp(blockId)}(\\s|$)`, 'i')
  const blocks = Array.from(holder.value.querySelectorAll('.ce-block')) as HTMLElement[]
  for (const block of blocks) {
    if (block.dataset.id === VIRTUAL_TITLE_BLOCK_ID) continue
    const text = (block.innerText ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (matcher.test(text)) return block
  }
  return null
}

async function revealAnchor(anchor: WikilinkAnchor): Promise<boolean> {
  if (!holder.value) return false
  if (!anchor.heading && !anchor.blockId) return false

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await nextTick()
    const target = anchor.blockId
      ? getBlockByAnchor(anchor.blockId)
      : anchor.heading
        ? getHeaderByAnchor(anchor.heading)
        : null
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      const focusTarget = target.matches('.ce-header')
        ? target
        : (target.querySelector('[contenteditable="true"], .ce-code__textarea') as HTMLElement | null)
      focusTarget?.focus()
      return true
    }
    await new Promise((resolve) => window.setTimeout(resolve, 35))
  }

  return false
}

async function revealOutlineHeading(index: number) {
  if (!holder.value) return
  await nextTick()
  const target = getOutlineHeaderByIndex(index)
  if (!target) return
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function emitOutlineSoon() {
  clearOutlineTimer()
  outlineTimer = setTimeout(() => {
    emit('outline', parseOutlineFromDom())
  }, 120)
}

function getVisibleText(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function revealSnippet(snippet: string) {
  if (!holder.value || !snippet) return
  await nextTick()

  const targetSnippet = getVisibleText(snippet).toLowerCase()
  if (!targetSnippet) return

  const nodes = Array.from(holder.value.querySelectorAll('[contenteditable="true"], .ce-code__textarea')) as HTMLElement[]
  const match = nodes.find((node) => getVisibleText(node.innerText).toLowerCase().includes(targetSnippet))
  if (!match) return

  match.scrollIntoView({ block: 'center', behavior: 'smooth' })
  match.focus()
}

async function ensureEditor() {
  if (!holder.value || editor) return

  editor = new EditorJS({
    holder: holder.value,
    autofocus: false,
    defaultBlock: 'paragraph',
    inlineToolbar: ['bold', 'italic', 'link', 'inlineCode'],
    placeholder: 'Write here...',
    tools: {
      paragraph: {
        class: Paragraph as unknown as never,
        inlineToolbar: true,
        config: { preserveBlank: false }
      },
      header: {
        class: Header as unknown as never,
        inlineToolbar: ['bold', 'italic', 'link', 'inlineCode'],
        config: {
          levels: [1, 2, 3, 4, 5, 6],
          defaultLevel: 2
        }
      },
      list: {
        class: List,
        inlineToolbar: ['bold', 'italic', 'link', 'inlineCode'],
        config: {
          defaultStyle: 'unordered'
        }
      },
      quote: {
        class: QuoteTool as unknown as never,
        inlineToolbar: ['bold', 'italic', 'link', 'inlineCode']
      },
      table: {
        class: Table as unknown as never,
        config: {
          rows: 2,
          cols: 2,
          withHeadings: true
        }
      },
      callout: {
        class: CalloutTool as unknown as never
      },
      mermaid: {
        class: MermaidTool as unknown as never,
        config: {
          confirmReplace: requestMermaidReplaceConfirm
        }
      },
      code: CodeTool,
      delimiter: Delimiter,
      inlineCode: InlineCode
    },
    async onChange() {
      const path = currentPath.value
      if (suppressOnChange || !path) return
      setDirty(path, true)
      setSaveError(path, '')
      scheduleAutosave()
      scheduleVirtualTitleLock()
      emitOutlineSoon()
    }
  })

  await editor.isReady
  holder.value.addEventListener('keydown', onEditorKeydown, true)
  holder.value.addEventListener('keyup', onEditorKeyup, true)
  holder.value.addEventListener('click', onEditorClick, true)
  holder.value.addEventListener('contextmenu', onEditorContextMenu, true)
  holder.value.addEventListener('paste', onEditorPaste, true)
  startCodeUiObservers()
}

async function destroyEditor() {
  clearAutosaveTimer()
  clearTitleLockTimer()
  closeSlashMenu()
  closeWikilinkMenu()

  if (holder.value) {
    holder.value.removeEventListener('keydown', onEditorKeydown, true)
    holder.value.removeEventListener('keyup', onEditorKeyup, true)
    holder.value.removeEventListener('click', onEditorClick, true)
    holder.value.removeEventListener('contextmenu', onEditorContextMenu, true)
    holder.value.removeEventListener('paste', onEditorPaste, true)
  }
  stopCodeUiObservers()

  if (!editor) return
  await editor.destroy()
  editor = null
}

const {
  isLoadingLargeDocument,
  loadStageLabel,
  loadProgressPercent,
  loadProgressIndeterminate,
  loadDocumentStats,
  loadCurrentFile
} = useEditorDocumentLifecycle({
  ensureEditor,
  ensurePropertySchemaLoaded,
  hasActiveEditor: () => Boolean(editor),
  clearAutosaveTimer,
  closeSlashMenu,
  closeWikilinkMenu,
  setSaveError,
  openFile: props.openFile,
  parseAndStoreFrontmatter,
  resolveEditorBody: (path, rawMarkdown) => frontmatterByPath.value[path]?.body ?? rawMarkdown,
  markdownToEditorData,
  normalizeLoadedBlocks: (blocks, path) => withVirtualTitle(blocks, noteTitleFromPath(path)).blocks,
  setLoadedText: (path, markdown) => {
    loadedTextByPath.value = {
      ...loadedTextByPath.value,
      [path]: markdown
    }
  },
  setSuppressOnChange: (value) => {
    suppressOnChange = value
  },
  renderEditor: async ({ version, blocks }) => {
    if (!editor) return
    await editor.render({
      time: Date.now(),
      version,
      blocks
    })
  },
  setDirty,
  ensureCodeBlockUi,
  nextUiTick: nextTick,
  getRememberedScrollTop: (path) => scrollTopByPath.value[path],
  setEditorScrollTop: (value) => {
    if (holder.value) {
      holder.value.scrollTop = value
    }
  },
  restoreCaret,
  focusFirstContentBlock,
  emitOutlineSoon,
  flushUiFrame: async () => {
    await nextTick()
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
  }
})

async function saveCurrentFile(manual = true) {
  const initialPath = currentPath.value
  if (!initialPath || !editor || savingByPath.value[initialPath]) return

  let savePath = initialPath
  setSaving(savePath, true)
  if (manual) setSaveError(savePath, '')

  try {
    const data = await editor.save()
    const rawBlocks = (data.blocks ?? []) as OutputBlockData[]
    const requestedTitle = readVirtualTitle(rawBlocks) || blockTextCandidate(rawBlocks[0]) || noteTitleFromPath(initialPath)
    const lastLoaded = loadedTextByPath.value[initialPath] ?? ''

    const latestOnDisk = await props.openFile(initialPath)
    if (latestOnDisk !== lastLoaded) {
      throw new Error('File changed on disk. Reload before saving to avoid overwrite.')
    }

    const renameResult = await props.renameFileFromTitle(initialPath, requestedTitle)
    savePath = renameResult.path
    const normalized = withVirtualTitle(rawBlocks, renameResult.title)
    const markdownBlocks = stripVirtualTitle(normalized.blocks)
    const bodyMarkdown = editorDataToMarkdown({ blocks: markdownBlocks as unknown as EditorBlock[] })
    const frontmatterState = frontmatterByPath.value[savePath] ?? frontmatterByPath.value[initialPath]
    const frontmatterYaml = propertyEditorMode.value === 'raw'
      ? (rawYamlByPath.value[savePath] ?? rawYamlByPath.value[initialPath] ?? '')
      : serializeFrontmatter(serializableFrontmatterFields(frontmatterState?.fields ?? []))
    const markdown = composeMarkdownDocument(bodyMarkdown, frontmatterYaml)

    if (!manual && savePath === initialPath && markdown === lastLoaded) {
      setDirty(savePath, false)
      return
    }

    if (savePath !== initialPath) {
      movePersistencePathState(initialPath, savePath)
      moveFrontmatterPathState(initialPath, savePath)
      emit('path-renamed', { from: initialPath, to: savePath, manual })
    }

    if (normalized.changed) {
      await renderBlocks(normalized.blocks)
    }

    const result = await props.saveFile(savePath, markdown, { explicit: manual })
    if (!result.persisted) {
      setDirty(savePath, true)
      return
    }

    loadedTextByPath.value = {
      ...loadedTextByPath.value,
      [savePath]: markdown
    }
    parseAndStoreFrontmatter(savePath, markdown)
    if (savePath !== initialPath) {
      const nextLoaded = { ...loadedTextByPath.value }
      delete nextLoaded[initialPath]
      loadedTextByPath.value = nextLoaded
    }
    setDirty(savePath, false)
  } catch (err) {
    setSaveError(savePath, err instanceof Error ? err.message : 'Could not save file.')
  } finally {
    setSaving(savePath, false)
    emitOutlineSoon()
  }
}

watch(
  () => props.path,
  async (next, prev) => {
    if (prev && holder.value) {
      captureCaret(prev)
      scrollTopByPath.value = {
        ...scrollTopByPath.value,
        [prev]: holder.value.scrollTop
      }
    }

    const nextPath = next?.trim()
    if (!nextPath) {
      resetPropertySchemaState()
      emit('properties', { path: '', items: [], parseErrorCount: 0 })
      await destroyEditor()
      emit('outline', [])
      return
    }

    await nextTick()
    await ensureEditor()
    if (!editor) return
    await loadCurrentFile(nextPath)
  }
)

onMounted(async () => {
  const debugFlag = window.localStorage.getItem('meditor:debug:checklist')
  checklistDebugOn.value = debugFlag === '1'
  initCodeUiFromStorage()
  const savedZoom = Number.parseFloat(window.localStorage.getItem('meditor:editor:zoom') ?? '1')
  if (Number.isFinite(savedZoom)) {
    editorZoom.value = clampEditorZoom(savedZoom)
  }

  if (currentPath.value) {
    await ensureEditor()
    await loadCurrentFile(currentPath.value)
  }
})

onBeforeUnmount(async () => {
  clearOutlineTimer()
  clearTitleLockTimer()
  if (mermaidReplaceDialog.value.resolve) {
    mermaidReplaceDialog.value.resolve(false)
  }
  await destroyEditor()
})

defineExpose({
  saveNow: async () => {
    await saveCurrentFile(true)
  },
  reloadCurrent: async () => {
    if (!currentPath.value) return
    await loadCurrentFile(currentPath.value)
  },
  focusEditor,
  focusFirstContentBlock,
  revealSnippet,
  revealOutlineHeading,
  revealAnchor,
  zoomIn: () => {
    zoomEditorBy(0.1)
    return editorZoom.value
  },
  zoomOut: () => {
    zoomEditorBy(-0.1)
    return editorZoom.value
  },
  resetZoom: () => {
    resetEditorZoom()
    return editorZoom.value
  },
  getZoom: () => editorZoom.value
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      v-if="!path"
      class="flex min-h-0 flex-1 items-center justify-center bg-white px-8 py-6 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400"
    >
      Open a file to start editing
    </div>

    <div v-else class="editor-shell flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-slate-950">
      <EditorPropertiesPanel
        :expanded="propertiesExpanded(path)"
        :mode="propertyEditorMode"
        :can-use-structured-properties="canUseStructuredProperties"
        :structured-property-fields="structuredPropertyFields"
        :structured-property-keys="structuredPropertyKeys"
        :active-raw-yaml="activeRawYaml"
        :active-parse-errors="activeParseErrors"
        :core-property-options="CORE_PROPERTY_OPTIONS"
        :effective-type-for-field="effectiveTypeForField"
        :is-property-type-locked="isPropertyTypeLocked"
        @toggle-visibility="togglePropertiesVisibility"
        @set-mode="propertyEditorMode = $event"
        @property-key-input="void onPropertyKeyInput($event.index, $event.value)"
        @property-type-change="void onPropertyTypeChange($event.index, $event.value)"
        @property-value-input="onPropertyValueInput($event.index, $event.value)"
        @property-checkbox-input="onPropertyCheckboxInput($event.index, $event.checked)"
        @property-tokens-change="onPropertyTokensChange($event.index, $event.tokens)"
        @remove-property="removePropertyField($event)"
        @add-property="addPropertyField($event)"
        @raw-yaml-input="onRawYamlInput($event)"
      />

      <div class="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref="holder"
          class="editor-holder relative h-full min-h-0 overflow-y-auto px-8 py-6"
          :class="{ 'meditor-debug-checklist': checklistDebugOn }"
          :style="editorZoomStyle"
          @click="closeSlashMenu(); closeWikilinkMenu()"
        >
          <EditorSlashMenu
            :open="slashOpen"
            :index="slashIndex"
            :left="slashLeft"
            :top="slashTop"
            :commands="SLASH_COMMANDS"
            @update:index="slashIndex = $event"
            @select="closeSlashMenu(); replaceCurrentBlock($event.type, $event.data)"
          />

          <EditorWikilinkMenu
            :open="wikilinkOpen"
            :index="wikilinkIndex"
            :left="wikilinkLeft"
            :top="wikilinkTop"
            :results="wikilinkResults"
            @menu-el="setWikilinkMenuElement($event)"
            @update:index="wikilinkIndex = $event"
            @select="applyWikilinkSelection($event)"
          />
        </div>
        <EditorLargeDocOverlay
          :visible="isLoadingLargeDocument"
          :stage-label="loadStageLabel"
          :progress-percent="loadProgressPercent"
          :progress-indeterminate="loadProgressIndeterminate"
          :stats="loadDocumentStats"
        />
      </div>
    </div>

    <EditorMermaidReplaceDialog
      :visible="mermaidReplaceDialog.visible"
      :template-label="mermaidReplaceDialog.templateLabel"
      @cancel="resolveMermaidReplaceDialog(false)"
      @confirm="resolveMermaidReplaceDialog(true)"
    />

  </div>
</template>

<style scoped>
.editor-holder {
  --meditor-link-color: #2563eb;
}

.dark .editor-holder {
  --meditor-link-color: #60a5fa;
}

.editor-holder :deep(a.md-wikilink) {
  color: var(--meditor-link-color);
  text-decoration: underline;
}

.dark .editor-holder :deep(a.md-wikilink) {
  color: var(--meditor-link-color);
}

</style>
