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
import { hasWikilinkHint } from '../lib/editorPerf'
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
import {
  buildWikilinkDraftToken,
  buildWikilinkToken,
  parseWikilinkTarget,
  normalizeBlockId,
  normalizeHeadingAnchor,
  slugifyHeading,
  type WikilinkAnchor
} from '../lib/wikilinks'

const LARGE_DOC_LOAD_THRESHOLD = 50_000
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

type EditableLinkToken =
  | { kind: 'wikilink'; target: string; label: string }
  | { kind: 'hyperlink'; href: string; label: string }

type EditableLinkRange = {
  start: number
  end: number
}

type ArrowLinkContext = {
  textNode: Text
  range: EditableLinkRange
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
const wikilinkMenuRef = ref<HTMLDivElement | null>(null)
const checklistDebugOn = ref(false)
const editorZoom = ref(1)
let editor: EditorJS | null = null
let outlineTimer: ReturnType<typeof setTimeout> | null = null
let titleLockTimer: ReturnType<typeof setTimeout> | null = null
let suppressOnChange = false
let activeLoadSequence = 0
let suppressCollapseOnNextArrowKeyup = false
let expandedLinkContext: ArrowLinkContext | null = null

const slashOpen = ref(false)
const slashIndex = ref(0)
const slashLeft = ref(0)
const slashTop = ref(0)
const wikilinkOpen = ref(false)
const wikilinkIndex = ref(0)
const wikilinkLeft = ref(0)
const wikilinkTop = ref(0)
const wikilinkQuery = ref('')
const wikilinkTargets = ref<string[]>([])
const wikilinkHeadingResults = ref<Array<{ id: string; label: string; target: string; isCreate: boolean }>>([])
const wikilinkHeadingCache = ref<Record<string, string[]>>({})
let wikilinkLoadToken = 0
let wikilinkHeadingLoadToken = 0

const wikilinkResults = computed(() => {
  if (wikilinkHeadingResults.value.length > 0) {
    return wikilinkHeadingResults.value
  }
  const query = wikilinkQuery.value.trim().toLowerCase()
  const base = wikilinkTargets.value
    .filter((path) => !query || path.toLowerCase().includes(query))
    .slice(0, 12)
    .map((path) => ({ id: `existing:${path}`, label: path, target: path, isCreate: false }))

  const exact = base.some((item) => item.target.toLowerCase() === query)
  if (query && !exact) {
    base.unshift({
      id: `create:${query}`,
      label: `Create "${wikilinkQuery.value.trim()}"`,
      target: wikilinkQuery.value.trim(),
      isCreate: true
    })
  }

  return base
})

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
const isLoadingLargeDocument = ref(false)
const loadStageLabel = ref('')
const loadProgressPercent = ref(0)
const loadProgressIndeterminate = ref(false)
const loadDocumentStats = ref<{ chars: number; lines: number } | null>(null)
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

function closeWikilinkMenu() {
  wikilinkOpen.value = false
  wikilinkIndex.value = 0
  wikilinkQuery.value = ''
  wikilinkHeadingResults.value = []
  wikilinkLoadToken += 1
  wikilinkHeadingLoadToken += 1
}

async function refreshWikilinkTargets() {
  const token = ++wikilinkLoadToken
  try {
    const paths = await props.loadLinkTargets()
    if (token !== wikilinkLoadToken) {
      return
    }
    wikilinkTargets.value = paths
  } catch (error) {
    if (token !== wikilinkLoadToken) {
      return
    }
    wikilinkTargets.value = []
  }
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

function shouldSyncWikilinkFromSelection() {
  if (wikilinkOpen.value) return true
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false
  const node = selection.focusNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return false
  return hasWikilinkHint((node as Text).data)
}

function isWikilinkRelevantKey(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (event.key === 'Backspace' || event.key === 'Delete') return true
  return event.key.length === 1
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

function openWikilinkMenuAtCaret(query: string, keepSelection = false) {
  if (!holder.value) return
  const holderEl = holder.value
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  const caretRect = range?.getBoundingClientRect()
  const holderRect = holderEl.getBoundingClientRect()
  const padding = 8
  const baseLeft = (caretRect?.left ?? holderRect.left) - holderRect.left + holderEl.scrollLeft
  const baseTop = (caretRect?.bottom ?? holderRect.top) - holderRect.top + holderEl.scrollTop + padding

  wikilinkLeft.value = Math.max(holderEl.scrollLeft + padding, baseLeft)
  wikilinkTop.value = Math.max(holderEl.scrollTop + padding, baseTop)
  const previousCount = wikilinkResults.value.length
  const previousIndex = wikilinkIndex.value
  wikilinkQuery.value = query
  if (keepSelection && previousCount > 0) {
    const nextCount = wikilinkResults.value.length
    wikilinkIndex.value = nextCount > 0 ? Math.min(previousIndex, nextCount - 1) : 0
  } else {
    wikilinkIndex.value = 0
  }
  wikilinkOpen.value = true
  void nextTick().then(() => repositionWikilinkMenu())
  void refreshWikilinkHeadingResults(query)
}

function repositionWikilinkMenu() {
  if (!holder.value || !wikilinkMenuRef.value) return
  const holderEl = holder.value
  const menuRect = wikilinkMenuRef.value.getBoundingClientRect()
  const padding = 8

  const minLeft = holderEl.scrollLeft + padding
  const maxLeft = Math.max(minLeft, holderEl.scrollLeft + holderEl.clientWidth - menuRect.width - padding)
  wikilinkLeft.value = Math.min(Math.max(minLeft, wikilinkLeft.value), maxLeft)

  const minTop = holderEl.scrollTop + padding
  const maxTop = Math.max(minTop, holderEl.scrollTop + holderEl.clientHeight - menuRect.height - padding)
  wikilinkTop.value = Math.min(Math.max(minTop, wikilinkTop.value), maxTop)
}

function parseWikilinkQuery(raw: string): { notePart: string; headingPart: string | null } {
  const targetPart = raw.split('|', 1)[0]?.trim() ?? ''
  if (!targetPart) return { notePart: '', headingPart: null }
  if (targetPart.startsWith('#')) {
    return { notePart: '', headingPart: targetPart.slice(1).trim() }
  }
  const hashIndex = targetPart.indexOf('#')
  if (hashIndex < 0) return { notePart: targetPart, headingPart: null }
  return {
    notePart: targetPart.slice(0, hashIndex).trim(),
    headingPart: targetPart.slice(hashIndex + 1).trim()
  }
}

function uniqueHeadings(headings: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const heading of headings) {
    const text = heading.trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

function headingResultsFor(baseTarget: string, headingQuery: string, headings: string[]) {
  const query = headingQuery.toLowerCase()
  return uniqueHeadings(headings)
    .filter((heading) => !query || heading.toLowerCase().includes(query))
    .slice(0, 24)
    .map((heading) => {
      const target = baseTarget ? `${baseTarget}#${heading}` : `#${heading}`
      return {
        id: `heading:${target}`,
        label: `#${heading}`,
        target,
        isCreate: false
      }
    })
}

async function refreshWikilinkHeadingResults(rawQuery: string) {
  if (!wikilinkOpen.value) return
  const parsed = parseWikilinkQuery(rawQuery)
  if (parsed.headingPart === null) {
    wikilinkHeadingResults.value = []
    return
  }

  if (!parsed.notePart) {
    const headings = parseOutlineFromDom().map((item) => item.text)
    wikilinkHeadingResults.value = headingResultsFor('', parsed.headingPart, headings)
    return
  }

  const cacheKey = parsed.notePart.toLowerCase()
  if (wikilinkHeadingCache.value[cacheKey]) {
    wikilinkHeadingResults.value = headingResultsFor(parsed.notePart, parsed.headingPart, wikilinkHeadingCache.value[cacheKey])
    return
  }

  const token = ++wikilinkHeadingLoadToken
  const headings = await props.loadLinkHeadings(parsed.notePart)
  if (token !== wikilinkHeadingLoadToken) {
    return
  }
  wikilinkHeadingCache.value = {
    ...wikilinkHeadingCache.value,
    [cacheKey]: headings
  }
  wikilinkHeadingResults.value = headingResultsFor(parsed.notePart, parsed.headingPart, headings)
}

function readWikilinkQueryAtCaret(): string | null {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return null
  const node = selection.focusNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent ?? ''
  const offset = selection.focusOffset
  if (offset < 2) return null

  const uptoCaret = text.slice(0, offset)
  const start = uptoCaret.lastIndexOf('[[')
  if (start < 0) return null
  const closeFromStart = text.indexOf(']]', start + 2)
  if (closeFromStart >= 0 && offset >= closeFromStart + 2) return null
  if (uptoCaret.slice(start + 2).includes(']]')) return null
  const queryEnd = closeFromStart >= 0 ? Math.min(offset, closeFromStart) : offset
  const query = text.slice(start + 2, queryEnd)
  if (query.includes('\n')) return null
  if (query.includes('[') || query.includes(']')) return null
  return query
}

function parseWikilinkToken(token: string): { target: string; label: string } | null {
  if (!token.startsWith('[[') || !token.endsWith(']]')) return null
  const inner = token.slice(2, -2).trim()
  if (!inner) return null
  const [targetRaw, aliasRaw] = inner.split('|', 2)
  const target = targetRaw.trim()
  if (!target || target.includes('\n')) return null
  const defaultLabel = (() => {
    const parsed = parseWikilinkTarget(target)
    if (parsed.anchor?.heading && !parsed.notePath) return parsed.anchor.heading
    return target
  })()
  const label = (aliasRaw ?? '').trim() || defaultLabel
  return { target, label }
}

function parseHyperlinkToken(token: string): { href: string; label: string } | null {
  // Detects markdown links, e.g. "[OpenAI](https://openai.com)".
  const match = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
  if (!match) return null
  const label = match[1].trim()
  const href = match[2].trim()
  if (!label || !href || label.includes('\n') || href.includes('\n')) return null
  return { href, label }
}

function parseEditableLinkToken(token: string): EditableLinkToken | null {
  const wikilink = parseWikilinkToken(token)
  if (wikilink) {
    return { kind: 'wikilink', target: wikilink.target, label: wikilink.label }
  }

  const hyperlink = parseHyperlinkToken(token)
  if (hyperlink) {
    return { kind: 'hyperlink', href: hyperlink.href, label: hyperlink.label }
  }

  return null
}

function createWikilinkAnchor(target: string, label = target): HTMLAnchorElement {
  const anchor = document.createElement('a')
  anchor.href = `wikilink:${encodeURIComponent(target)}`
  anchor.dataset.wikilinkTarget = target
  anchor.textContent = label
  anchor.className = 'md-wikilink'
  return anchor
}

function createHyperlinkAnchor(href: string, label: string): HTMLAnchorElement {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.textContent = label
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  return anchor
}

function createAnchorFromToken(token: EditableLinkToken): HTMLAnchorElement {
  if (token.kind === 'wikilink') {
    return createWikilinkAnchor(token.target, token.label)
  }
  return createHyperlinkAnchor(token.href, token.label)
}

function readWikilinkTargetFromAnchor(anchor: HTMLAnchorElement): string {
  const dataTarget = anchor.dataset.wikilinkTarget?.trim()
  if (dataTarget) return dataTarget

  const href = anchor.getAttribute('href')?.trim() ?? ''
  if (href.toLowerCase().startsWith('wikilink:')) {
    try {
      const decoded = decodeURIComponent(href.slice('wikilink:'.length)).trim()
      if (decoded) return decoded
    } catch {
      return ''
    }
  }

  if (href === '#') {
    return anchor.textContent?.trim() ?? ''
  }

  return ''
}

function replaceActiveWikilinkQuery(target: string, mode: 'final' | 'draft' = 'final') {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false
  const node = selection.focusNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return false
  const textNode = node as Text
  const text = textNode.data
  const offset = selection.focusOffset

  const start = text.slice(0, offset).lastIndexOf('[[')
  if (start < 0) return false
  const close = text.indexOf(']]', start + 2)
  const end = close >= 0 ? close + 2 : offset
  const currentQueryEnd = close >= 0 ? close : offset
  const currentQuery = text.slice(start + 2, currentQueryEnd)
  const explicitAlias = (currentQuery.split('|', 2)[1] ?? '').trim()

  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  range.deleteContents()

  const rawToken = mode === 'final'
    ? buildWikilinkToken(target, explicitAlias || null)
    : buildWikilinkDraftToken(target)
  const insertedText = document.createTextNode(rawToken)
  range.insertNode(insertedText)
  expandedLinkContext = { textNode: insertedText, range: { start: 0, end: rawToken.length } }

  const nextRange = document.createRange()
  // Place caret after the token so Enter/Tab continue normal editor flow (for example, lists).
  nextRange.setStart(insertedText, rawToken.length)
  nextRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(nextRange)
  return true
}

function defaultWikilinkLabel(target: string): string {
  const parsed = parseWikilinkTarget(target)
  if (parsed.anchor?.heading && !parsed.notePath) return parsed.anchor.heading
  return target
}

function tokenForAnchor(anchor: HTMLAnchorElement): string {
  const target = readWikilinkTargetFromAnchor(anchor)
  if (target) {
    const label = anchor.textContent?.trim() ?? ''
    const defaultLabel = defaultWikilinkLabel(target)
    if (label && label !== defaultLabel) {
      return `[[${target}|${label}]]`
    }
    return `[[${target}]]`
  }

  const href = anchor.getAttribute('href')?.trim() ?? ''
  if (!href) return ''
  const label = anchor.textContent?.trim() ?? ''
  return `[${label || href}](${href})`
}

function nodeToEditableLinkAnchor(node: Node | null): HTMLAnchorElement | null {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return null
  const element = node as HTMLElement
  if (element.tagName.toLowerCase() !== 'a') return null
  const anchor = element as HTMLAnchorElement
  return tokenForAnchor(anchor) ? anchor : null
}

function adjacentEditableLinkAnchor(selection: Selection, direction: 'left' | 'right'): HTMLAnchorElement | null {
  const node = selection.focusNode
  if (!node) return null
  const ownerElement =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : (node.parentElement as HTMLElement | null)
  const ownerAnchor = ownerElement?.closest('a') as HTMLAnchorElement | null
  if (ownerAnchor) {
    return tokenForAnchor(ownerAnchor) ? ownerAnchor : null
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text
    if (direction === 'left' && selection.focusOffset === 0) {
      return nodeToEditableLinkAnchor(textNode.previousSibling)
    }
    if (direction === 'right' && selection.focusOffset === textNode.length) {
      return nodeToEditableLinkAnchor(textNode.nextSibling)
    }
    return null
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement
    const childIndex = selection.focusOffset
    if (direction === 'left' && childIndex > 0) {
      return nodeToEditableLinkAnchor(element.childNodes.item(childIndex - 1))
    }
    if (direction === 'right' && childIndex < element.childNodes.length) {
      return nodeToEditableLinkAnchor(element.childNodes.item(childIndex))
    }
  }

  return null
}

function expandAdjacentLinkForEditing(direction: 'left' | 'right'): boolean {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false

  const anchor = adjacentEditableLinkAnchor(selection, direction)
  if (!anchor || !anchor.parentNode) return false

  const token = tokenForAnchor(anchor)
  if (!token) return false

  const textNode = document.createTextNode(token)
  anchor.parentNode.replaceChild(textNode, anchor)

  const range = document.createRange()
  const nextOffset = direction === 'left' ? Math.max(0, token.length - 1) : Math.min(token.length, 1)
  range.setStart(textNode, nextOffset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  expandedLinkContext = { textNode, range: { start: 0, end: token.length } }
  suppressCollapseOnNextArrowKeyup = true
  return true
}

function placeCaretAdjacentToAnchor(anchor: HTMLAnchorElement, place: 'before' | 'after', selection: Selection) {
  const parent = anchor.parentNode
  if (!parent) return false

  let textNode: Text | null = null
  let offset = 0

  if (place === 'after') {
    const next = anchor.nextSibling
    if (next && next.nodeType === Node.TEXT_NODE) {
      textNode = next as Text
      if ((textNode.textContent ?? '').length === 0) {
        textNode.textContent = ' '
        offset = 1
      } else {
        offset = 0
      }
    } else {
      textNode = document.createTextNode(' ')
      parent.insertBefore(textNode, next)
      offset = 1
    }
  } else {
    const prev = anchor.previousSibling
    if (prev && prev.nodeType === Node.TEXT_NODE) {
      textNode = prev as Text
      if ((textNode.textContent ?? '').length === 0) {
        textNode.textContent = ' '
      }
      offset = (textNode.textContent ?? '').length
    } else {
      textNode = document.createTextNode(' ')
      parent.insertBefore(textNode, anchor)
      offset = 1
    }
  }

  const range = document.createRange()
  range.setStart(textNode, offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

function replaceTokenRangeWithAnchor(textNode: Text, start: number, end: number, place: 'before' | 'after'): boolean {
  if (!textNode.parentNode) {
    return false
  }
  if (start < 0 || end <= start || end > textNode.data.length) {
    return false
  }
  const token = textNode.data.slice(start, end)
  const parsed = parseEditableLinkToken(token)
  if (!parsed) {
    return false
  }

  const selection = window.getSelection()
  if (!selection) {
    return false
  }

  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  range.deleteContents()

  const anchor = createAnchorFromToken(parsed)
  range.insertNode(anchor)

  if (!placeCaretAdjacentToAnchor(anchor, place, selection)) {
    return false
  }
  if (expandedLinkContext) {
    expandedLinkContext = null
  }
  return true
}

function caretRelationToTokenRange(selection: Selection, context: ArrowLinkContext): 'before' | 'inside' | 'after' {
  if (!selection.rangeCount || !selection.isCollapsed) return 'after'
  if (!context.textNode.isConnected) return 'after'
  if (context.range.start < 0 || context.range.end < context.range.start || context.range.end > context.textNode.data.length) {
    return 'after'
  }
  if (!selection.focusNode) return 'after'
  if (selection.focusNode.ownerDocument !== context.textNode.ownerDocument) return 'after'

  const tokenRange = context.textNode.ownerDocument.createRange()
  tokenRange.setStart(context.textNode, context.range.start)
  tokenRange.setEnd(context.textNode, context.range.end)

  // Fast path: same text node, compare offsets directly.
  if (selection.focusNode === context.textNode) {
    const offset = selection.focusOffset
    if (offset < context.range.start) return 'before'
    if (offset > context.range.end) return 'after'
    return 'inside'
  }

  // Fallback for cross-node caret points.
  try {
    const position = tokenRange.comparePoint(selection.focusNode as Node, selection.focusOffset)
    if (position < 0) return 'before'
    if (position > 0) return 'after'
    return 'inside'
  } catch {
    return 'after'
  }
}

function collapseExpandedLinkIfCaretOutside(): boolean {
  if (!expandedLinkContext) return false

  const context = expandedLinkContext
  if (!context.textNode.isConnected) {
    expandedLinkContext = null
    return false
  }
  if (context.range.start < 0 || context.range.end < context.range.start || context.range.end > context.textNode.data.length) {
    expandedLinkContext = null
    return false
  }

  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) {
    expandedLinkContext = null
    return false
  }

  let relation: 'before' | 'inside' | 'after' = 'after'
  try {
    relation = caretRelationToTokenRange(selection, context)
  } catch (error) {
    expandedLinkContext = null
    return false
  }
  if (relation === 'inside') return false

  const place = relation === 'before' ? 'before' : 'after'
  const collapsed = replaceTokenRangeWithAnchor(context.textNode, context.range.start, context.range.end, place)
  if (!collapsed) {
    expandedLinkContext = null
  }
  return collapsed
}

function findMarkdownLinkRangeEndingAt(
  text: string,
  offset: number
): { start: number; end: number } | null {
  if (offset < 1 || text[offset - 1] !== ')') return null
  const openParen = text.lastIndexOf('(', offset - 1)
  if (openParen < 0) return null
  const closeBracket = openParen - 1
  if (closeBracket < 0 || text[closeBracket] !== ']') return null
  const openBracket = text.lastIndexOf('[', closeBracket)
  if (openBracket < 0) return null
  if (openBracket > 0 && text[openBracket - 1] === '!') return null
  const token = text.slice(openBracket, offset)
  return parseHyperlinkToken(token) ? { start: openBracket, end: offset } : null
}

function findMarkdownLinkRangeStartingAt(
  text: string,
  offset: number
): { start: number; end: number } | null {
  if (text[offset] !== '[' || text[offset + 1] === '[') return null
  if (offset > 0 && text[offset - 1] === '!') return null
  const closeBracket = text.indexOf('](', offset + 1)
  if (closeBracket < 0) return null
  const closeParen = text.indexOf(')', closeBracket + 2)
  if (closeParen < 0) return null
  const token = text.slice(offset, closeParen + 1)
  return parseHyperlinkToken(token) ? { start: offset, end: closeParen + 1 } : null
}

function collapseClosedLinkNearCaret(): boolean {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false

  const node = selection.focusNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return false
  const textNode = node as Text
  const text = textNode.data
  const offset = selection.focusOffset

  if (offset >= 2 && text.slice(offset - 2, offset) === ']]') {
    const start = text.lastIndexOf('[[', offset - 2)
    if (start >= 0) {
      const close = text.indexOf(']]', start + 2)
      if (close >= 0 && close + 2 === offset) {
        const collapsed = replaceTokenRangeWithAnchor(textNode, start, offset, 'after')
        return collapsed
      }
    }
  }

  if (text.slice(offset, offset + 2) === '[[') {
    const close = text.indexOf(']]', offset + 2)
    if (close >= 0) {
      const collapsed = replaceTokenRangeWithAnchor(textNode, offset, close + 2, 'before')
      return collapsed
    }
  }

  const endingMarkdown = findMarkdownLinkRangeEndingAt(text, offset)
  if (endingMarkdown) {
    const collapsed = replaceTokenRangeWithAnchor(textNode, endingMarkdown.start, endingMarkdown.end, 'after')
    return collapsed
  }

  const startingMarkdown = findMarkdownLinkRangeStartingAt(text, offset)
  if (startingMarkdown) {
    const collapsed = replaceTokenRangeWithAnchor(textNode, startingMarkdown.start, startingMarkdown.end, 'before')
    return collapsed
  }

  return false
}

async function applyWikilinkSelection(target: string) {
  const replaced = replaceActiveWikilinkQuery(target, 'final')
  closeWikilinkMenu()
  if (!replaced) {
    return
  }

  const path = currentPath.value
  if (path) {
    setDirty(path, true)
    setSaveError(path, '')
    scheduleAutosave()
  }
  await nextTick()
  collapseClosedLinkNearCaret()
}

async function applyWikilinkDraftSelection(target: string) {
  const replaced = replaceActiveWikilinkQuery(target, 'draft')
  closeWikilinkMenu()
  if (!replaced) {
    return
  }

  const path = currentPath.value
  if (path) {
    setDirty(path, true)
    setSaveError(path, '')
    scheduleAutosave()
  }
}

function extractTokenAtCaret(): string {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return ''
  const node = selection.focusNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return ''

  const text = node.textContent ?? ''
  const offset = selection.focusOffset
  // Detects token boundaries for wikilink/date navigation.
  // Example boundary chars: space, comma, ".", ":".
  const isBoundary = (value: string) => /[^\w\-\[\]\/|#]/.test(value)

  let start = offset
  while (start > 0 && !isBoundary(text[start - 1])) {
    start -= 1
  }

  let end = offset
  while (end < text.length && !isBoundary(text[end])) {
    end += 1
  }

  return text.slice(start, end).trim()
}

async function openLinkedTokenAtCaret() {
  const token = extractTokenAtCaret()
  if (!token) return

  const wikilink = parseWikilinkToken(token)
  if (wikilink) {
    await openLinkTargetWithAutosave(wikilink.target)
    return
  }

  // Detects date-link tokens, e.g. "2026-02-25".
  const dateMatch = token.match(/^\d{4}-\d{2}-\d{2}$/)
  if (!dateMatch) return
  await openLinkTargetWithAutosave(dateMatch[0])
}

function isDateLinkModifierPressed(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'> | Pick<MouseEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return isMacOs ? Boolean(event.metaKey) : Boolean(event.ctrlKey)
}

async function openLinkTargetWithAutosave(target: string) {
  const path = currentPath.value
  if (path && dirtyByPath.value[path]) {
    clearAutosaveTimer()
    await saveCurrentFile(false)
    if (dirtyByPath.value[path]) return
  }
  await props.openLinkTarget(target)
}

async function syncWikilinkMenuFromCaret() {
  const query = readWikilinkQueryAtCaret()
  if (query === null) {
    closeWikilinkMenu()
    return
  }
  if (!wikilinkOpen.value) {
    await refreshWikilinkTargets()
  }
  openWikilinkMenuAtCaret(query, true)
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

function applyMarkdownShortcut(marker: string) {
  // Detects checklist markers, e.g. "[ ]", "[x]", "- [x]".
  const checklistMatch = marker.match(/^(-\s*)?\[([ xX]?)\]$/)
  if (checklistMatch) {
    return {
      type: 'list',
      data: emptyListData('checklist', checklistMatch[2].toLowerCase() === 'x')
    }
  }

  switch (marker) {
    case '-':
    case '*':
    case '+':
      return { type: 'list', data: emptyListData('unordered') }
    case '1.':
      return { type: 'list', data: emptyListData('ordered') }
    case '>':
      return { type: 'quote', data: { text: '' } }
    case '```':
      return { type: 'code', data: { code: '' } }
    default:
      break
  }

  // Detects ATX heading markers, e.g. "#", "##", "######".
  if (/^#{1,6}$/.test(marker)) {
    return {
      type: 'header',
      data: { text: '', level: marker.length }
    }
  }

  return null
}

function isEditorZoomModifier(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey
}

function isZoomInShortcut(event: KeyboardEvent): boolean {
  return (
    event.key === '=' ||
    event.key === '+' ||
    event.code === 'Equal' ||
    event.code === 'NumpadAdd'
  )
}

function isZoomOutShortcut(event: KeyboardEvent): boolean {
  return (
    event.key === '-' ||
    event.key === '_' ||
    event.code === 'Minus' ||
    event.code === 'NumpadSubtract'
  )
}

function isZoomResetShortcut(event: KeyboardEvent): boolean {
  return event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0'
}

function onEditorKeydown(event: KeyboardEvent) {
  if (!editor) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.meditor-mermaid')) {
    return
  }

  if (isEditorZoomModifier(event)) {
    if (isZoomInShortcut(event)) {
      event.preventDefault()
      zoomEditorBy(0.1)
      return
    }
    if (isZoomOutShortcut(event)) {
      event.preventDefault()
      zoomEditorBy(-0.1)
      return
    }
    if (isZoomResetShortcut(event)) {
      event.preventDefault()
      resetEditorZoom()
      return
    }
  }

  if (wikilinkOpen.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      if (wikilinkResults.value.length) {
        wikilinkIndex.value = (wikilinkIndex.value + 1) % wikilinkResults.value.length
      }
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      if (wikilinkResults.value.length) {
        wikilinkIndex.value = (wikilinkIndex.value - 1 + wikilinkResults.value.length) % wikilinkResults.value.length
      }
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const selected = wikilinkResults.value[wikilinkIndex.value]
      if (!selected) return
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      if (event.key === 'Tab') {
        void applyWikilinkDraftSelection(selected.target)
      } else {
        void applyWikilinkSelection(selected.target)
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      closeWikilinkMenu()
      return
    }
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const direction = event.key === 'ArrowLeft' ? 'left' : 'right'
    if (expandAdjacentLinkForEditing(direction)) {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      return
    }
  }

  if (slashOpen.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      slashIndex.value = (slashIndex.value + 1) % SLASH_COMMANDS.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      slashIndex.value = (slashIndex.value - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const command = SLASH_COMMANDS[slashIndex.value]
      closeSlashMenu()
      replaceCurrentBlock(command.type, command.data)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSlashMenu()
      return
    }
  }

  const block = getCurrentBlock()
  if (!block) return

  if (block.id === VIRTUAL_TITLE_BLOCK_ID) {
    if (event.key === 'Backspace' && getCurrentBlockText(block).length === 0) {
      event.preventDefault()
      return
    }
  }

  if (event.key === '[' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    window.setTimeout(() => {
      void syncWikilinkMenuFromCaret()
    }, 0)
  }

  if (event.key === '/' && block.name === 'paragraph' && isCurrentBlockEmpty()) {
    // Let EditorJS handle the native slash menu to avoid duplicate popovers.
    closeSlashMenu()
    return
  }

  if ((event.key === ' ' || event.code === 'Space') && block.name === 'paragraph') {
    const marker = getCurrentBlockText(block)
    const transform = applyMarkdownShortcut(marker)
    if (transform) {
      if (replaceCurrentBlock(transform.type, transform.data)) {
        event.preventDefault()
        closeSlashMenu()
        return
      }
    }
  }

  if (event.key === 'Enter' && block.name === 'paragraph') {
    const marker = getCurrentBlockText(block)
    if (marker === '```') {
      event.preventDefault()
      closeSlashMenu()
      replaceCurrentBlock('code', { code: '' })
      return
    }
  }

  if (event.key === 'Backspace' && block.name === 'header' && getCurrentBlockText(block).length === 0) {
    const index = editor.blocks.getCurrentBlockIndex()
    if (index === 0) {
      event.preventDefault()
      closeSlashMenu()
      return
    }
    event.preventDefault()
    closeSlashMenu()
    replaceCurrentBlock('paragraph', { text: '' })
  }
}

function onEditorKeyup(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.meditor-mermaid')) {
    return
  }
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && suppressCollapseOnNextArrowKeyup) {
    suppressCollapseOnNextArrowKeyup = false
    return
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (collapseExpandedLinkIfCaretOutside()) {
      return
    }
    collapseClosedLinkNearCaret()
    return
  }

  if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
    return
  }

  collapseClosedLinkNearCaret()
  captureCaret(currentPath.value)
  if (!wikilinkOpen.value && !isWikilinkRelevantKey(event) && !shouldSyncWikilinkFromSelection()) {
    return
  }
  void syncWikilinkMenuFromCaret()
}

function onEditorClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.ce-block')) {
    return
  }
  if (target.closest('.meditor-mermaid')) {
    return
  }
  collapseExpandedLinkIfCaretOutside()
  const anchor = target.closest('a') as HTMLAnchorElement | null
  const wikilinkTarget = anchor ? readWikilinkTargetFromAnchor(anchor) : ''
  if (anchor && wikilinkTarget) {
    event.preventDefault()
    event.stopPropagation()
    void openLinkTargetWithAutosave(wikilinkTarget)
    return
  }
  if (anchor) {
    const href = anchor.getAttribute('href')?.trim() ?? ''
    const safeHref = sanitizeExternalHref(href)
    if (safeHref) {
      event.preventDefault()
      event.stopPropagation()
      void openExternalUrl(safeHref)
      return
    }
  }
  collapseClosedLinkNearCaret()
  captureCaret(currentPath.value)
  void syncWikilinkMenuFromCaret()
  if (isDateLinkModifierPressed(event)) {
    void openLinkedTokenAtCaret()
  }
}

function onEditorContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return
  const block = target.closest('.ce-block') as HTMLElement | null
  if (!block || block.dataset.id !== VIRTUAL_TITLE_BLOCK_ID) return
  event.preventDefault()
  event.stopPropagation()
}

function looksLikeMarkdown(text: string): boolean {
  // Detects common markdown starters, e.g. "# h1", "- item", "1. item", "> quote", "```", "[a](b)".
  return /(^#{1,6}\s)|(^\s*[-*+]\s)|(^\s*[-*+]\s+\[[ xX]?\])|(^\s*\d+\.\s)|(^>\s)|(```)|(\[[^\]]+\]\([^)]+\))/m.test(text)
}

function isLikelyMarkdownPaste(plain: string, html: string): boolean {
  if (!plain.trim()) return false
  if (!looksLikeMarkdown(plain)) return false
  if (!html) return true
  return true
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

function onEditorPaste(event: ClipboardEvent) {
  if (!editor) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.meditor-mermaid')) {
    return
  }

  const plain = event.clipboardData?.getData('text/plain') ?? ''
  const html = event.clipboardData?.getData('text/html') ?? ''

  if (!isLikelyMarkdownPaste(plain, html)) {
    return
  }

  const parsed = markdownToEditorData(plain)
  if (!parsed.blocks.length) return

  event.preventDefault()
  event.stopPropagation()
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation()
  }
  insertParsedMarkdownBlocks(parsed.blocks as OutputBlockData[])
}

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

async function flushUiFrame() {
  await nextTick()
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function countLines(input: string): number {
  if (!input) return 0
  return input.replace(/\r\n?/g, '\n').split('\n').length
}

function startLargeDocumentLoadOverlay() {
  isLoadingLargeDocument.value = true
  loadDocumentStats.value = null
  loadStageLabel.value = 'Reading file...'
  loadProgressPercent.value = 5
  loadProgressIndeterminate.value = true
}

function setLargeDocumentLoadStats(body: string) {
  if (!isLoadingLargeDocument.value) return
  loadDocumentStats.value = { chars: body.length, lines: countLines(body) }
}

async function setLargeDocumentLoadStage(stage: string, percent: number) {
  if (!isLoadingLargeDocument.value) return
  loadStageLabel.value = stage
  loadProgressPercent.value = Math.max(0, Math.min(100, Math.round(percent)))
  loadProgressIndeterminate.value = false
  await flushUiFrame()
}

function finishLargeDocumentLoadOverlay() {
  isLoadingLargeDocument.value = false
  loadStageLabel.value = ''
  loadProgressPercent.value = 0
  loadProgressIndeterminate.value = false
  loadDocumentStats.value = null
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

async function loadCurrentFile(path: string) {
  if (!path) return

  const loadSequence = ++activeLoadSequence
  const isStaleLoad = () => loadSequence !== activeLoadSequence

  await ensureEditor()
  await ensurePropertySchemaLoaded()
  if (!editor || isStaleLoad()) return

  clearAutosaveTimer()
  closeSlashMenu()
  closeWikilinkMenu()
  setSaveError(path, '')

  let shouldShowLargeDocOverlay = false

  try {
    startLargeDocumentLoadOverlay()
    await flushUiFrame()
    if (isStaleLoad()) return

    const txt = await props.openFile(path)
    if (isStaleLoad()) return
    parseAndStoreFrontmatter(path, txt)
    const body = frontmatterByPath.value[path]?.body ?? txt
    shouldShowLargeDocOverlay = txt.length >= LARGE_DOC_LOAD_THRESHOLD
    if (!shouldShowLargeDocOverlay) {
      if (!isStaleLoad()) finishLargeDocumentLoadOverlay()
    } else {
      setLargeDocumentLoadStats(body)
      await setLargeDocumentLoadStage('Parsing markdown blocks...', 35)
      if (isStaleLoad()) return
    }

    const parsed = markdownToEditorData(body)
    if (isStaleLoad()) return
    const normalized = withVirtualTitle(parsed.blocks as OutputBlockData[], noteTitleFromPath(path))
    suppressOnChange = true
    loadedTextByPath.value = {
      ...loadedTextByPath.value,
      [path]: txt
    }
    if (shouldShowLargeDocOverlay) {
      await setLargeDocumentLoadStage('Rendering blocks in editor...', 70)
    }
    await editor.render({
      time: Date.now(),
      version: parsed.version,
      blocks: normalized.blocks
    })
    if (isStaleLoad()) return
    if (shouldShowLargeDocOverlay) {
      await setLargeDocumentLoadStage('Finalizing view...', 95)
    }
    setDirty(path, false)
    ensureCodeBlockUi()

    await nextTick()
    const remembered = scrollTopByPath.value[path]
    const hasRememberedScroll = typeof remembered === 'number'
    const targetScrollTop = remembered ?? 0
    if (holder.value) {
      holder.value.scrollTop = targetScrollTop
    }
    const restoredCaret = restoreCaret(path)
    if (!restoredCaret && (!hasRememberedScroll || targetScrollTop <= 1)) {
      await focusFirstContentBlock()
    }
    emitOutlineSoon()
    if (shouldShowLargeDocOverlay) {
      loadProgressPercent.value = 100
    }
  } catch (err) {
    if (!isStaleLoad()) {
      setSaveError(path, err instanceof Error ? err.message : 'Could not read file.')
    }
  } finally {
    if (!isStaleLoad()) {
      suppressOnChange = false
      finishLargeDocumentLoadOverlay()
    }
  }
}

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
            @menu-el="wikilinkMenuRef = $event"
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
