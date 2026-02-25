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
import { useEditorSaveLifecycle } from '../composables/useEditorSaveLifecycle'
import { useVirtualTitleBehavior } from '../composables/useVirtualTitleBehavior'
import { useEditorCaret, type EditorCaretSnapshot } from '../composables/useEditorCaret'
import { useEditorOutlineNavigation } from '../composables/useEditorOutlineNavigation'
import { useEditorZoom } from '../composables/useEditorZoom'
import {
  normalizeBlockId,
  normalizeHeadingAnchor,
  slugifyHeading
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
let editor: EditorJS | null = null
let suppressOnChange = false

const slashOpen = ref(false)
const slashIndex = ref(0)
const slashLeft = ref(0)
const slashTop = ref(0)

const currentPath = computed(() => props.path?.trim() || '')
const isMacOs = typeof navigator !== 'undefined' && /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform || navigator.userAgent)
const { editorZoomStyle, initFromStorage: initEditorZoomFromStorage, zoomBy: zoomEditorBy, resetZoom: resetEditorZoom, getZoom } = useEditorZoom()
const {
  parseOutlineFromDom,
  revealAnchor,
  revealOutlineHeading,
  emitOutlineSoon,
  clearOutlineTimer,
  revealSnippet
} = useEditorOutlineNavigation({
  holder,
  virtualTitleBlockId: VIRTUAL_TITLE_BLOCK_ID,
  emitOutline: (headings) => emit('outline', headings),
  normalizeHeadingAnchor,
  slugifyHeading,
  normalizeBlockId,
  nextUiTick: nextTick
})
const {
  noteTitleFromPath,
  blockTextCandidate,
  stripVirtualTitle,
  readVirtualTitle,
  withVirtualTitle,
  isEditingVirtualTitle,
  scheduleVirtualTitleLock,
  clearVirtualTitleLock
} = useVirtualTitleBehavior({
  virtualTitleBlockId: VIRTUAL_TITLE_BLOCK_ID,
  holder,
  currentPath,
  hasActiveEditor: () => Boolean(editor),
  isSuppressOnChange: () => suppressOnChange,
  saveEditorData: async () => {
    if (!editor) return { blocks: [] as OutputBlockData[] }
    const data = await editor.save()
    return { blocks: (data.blocks ?? []) as OutputBlockData[] }
  },
  renderBlocks
})
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
} = useEditorPersistence<EditorCaretSnapshot>({
  emitStatus: (payload) => emit('status', payload),
  isEditingVirtualTitle,
  saveCurrentFile
})
const { captureCaret, restoreCaret } = useEditorCaret({
  holder,
  caretByPath
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
  clearVirtualTitleLock()
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

const saveLifecycle = useEditorSaveLifecycle({
  getCurrentPath: () => currentPath.value,
  hasActiveEditor: () => Boolean(editor),
  isSavingPath: (path) => Boolean(savingByPath.value[path]),
  setSaving,
  setSaveError,
  setDirty,
  saveEditorData: async () => {
    if (!editor) return { blocks: [] as OutputBlockData[] }
    const data = await editor.save()
    return { blocks: (data.blocks ?? []) as OutputBlockData[] }
  },
  resolveRequestedTitle: (blocks, initialPath) => readVirtualTitle(blocks) || blockTextCandidate(blocks[0]) || noteTitleFromPath(initialPath),
  getLoadedText: (path) => loadedTextByPath.value[path] ?? '',
  openFile: props.openFile,
  renameFileFromTitle: props.renameFileFromTitle,
  normalizeBlocksForTitle: withVirtualTitle,
  stripVirtualTitle,
  editorBlocksToMarkdown: (blocks) => editorDataToMarkdown({ blocks: blocks as unknown as EditorBlock[] }),
  resolveFrontmatterYaml: (savePath, initialPath) => {
    const frontmatterState = frontmatterByPath.value[savePath] ?? frontmatterByPath.value[initialPath]
    if (propertyEditorMode.value === 'raw') {
      return rawYamlByPath.value[savePath] ?? rawYamlByPath.value[initialPath] ?? ''
    }
    return serializeFrontmatter(serializableFrontmatterFields(frontmatterState?.fields ?? []))
  },
  composeMarkdownDocument,
  movePersistencePathState,
  moveFrontmatterPathState,
  emitPathRenamed: (payload) => emit('path-renamed', payload),
  renderBlocks,
  saveFile: props.saveFile,
  setLoadedText: (path, markdown) => {
    loadedTextByPath.value = {
      ...loadedTextByPath.value,
      [path]: markdown
    }
  },
  deleteLoadedText: (path) => {
    if (!(path in loadedTextByPath.value)) return
    const nextLoaded = { ...loadedTextByPath.value }
    delete nextLoaded[path]
    loadedTextByPath.value = nextLoaded
  },
  parseAndStoreFrontmatter,
  emitOutlineSoon
})

async function saveCurrentFile(manual = true) {
  await saveLifecycle.saveCurrentFile(manual)
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
  initEditorZoomFromStorage()

  if (currentPath.value) {
    await ensureEditor()
    await loadCurrentFile(currentPath.value)
  }
})

onBeforeUnmount(async () => {
  clearOutlineTimer()
  clearVirtualTitleLock()
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
    return zoomEditorBy(0.1)
  },
  zoomOut: () => {
    return zoomEditorBy(-0.1)
  },
  resetZoom: () => {
    return resetEditorZoom()
  },
  getZoom
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
