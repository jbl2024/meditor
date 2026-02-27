<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Editor, EditorContent, Extension } from '@tiptap/vue-3'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { ListKit, TaskItem } from '@tiptap/extension-list'
import Placeholder from '@tiptap/extension-placeholder'
import type { JSONContent } from '@tiptap/vue-3'
import {
  editorDataToMarkdown,
  markdownToEditorData,
  sanitizeExternalHref,
  type EditorBlock
} from '../lib/markdownBlocks'
import { EDITOR_SLASH_COMMANDS } from '../lib/editorSlashCommands'
import { openExternalUrl } from '../lib/api'
import EditorPropertiesPanel from './editor/EditorPropertiesPanel.vue'
import EditorSlashMenu from './editor/EditorSlashMenu.vue'
import EditorWikilinkMenu from './editor/EditorWikilinkMenu.vue'
import EditorLargeDocOverlay from './editor/EditorLargeDocOverlay.vue'
import EditorMermaidReplaceDialog from './editor/EditorMermaidReplaceDialog.vue'
import { composeMarkdownDocument, serializeFrontmatter } from '../lib/frontmatter'
import { useFrontmatterProperties } from '../composables/useFrontmatterProperties'
import { useEditorZoom } from '../composables/useEditorZoom'
import { useMermaidReplaceDialog } from '../composables/useMermaidReplaceDialog'
import { applyMarkdownShortcut, isEditorZoomModifier, isLikelyMarkdownPaste, isZoomInShortcut, isZoomOutShortcut, isZoomResetShortcut } from '../lib/editorInteractions'
import { normalizeBlockId, normalizeHeadingAnchor, parseWikilinkTarget, slugifyHeading } from '../lib/wikilinks'
import { toTiptapDoc } from '../lib/tiptap/editorBlocksToTiptapDoc'
import { fromTiptapDoc } from '../lib/tiptap/tiptapDocToEditorBlocks'
import { TIPTAP_NODE_TYPES } from '../lib/tiptap/types'
import { useTiptapInstance } from '../composables/useTiptapInstance'
import { CalloutNode } from '../lib/tiptap/extensions/CalloutNode'
import { MermaidNode } from '../lib/tiptap/extensions/MermaidNode'
import { QuoteNode } from '../lib/tiptap/extensions/QuoteNode'
import { WikilinkNode } from '../lib/tiptap/extensions/WikilinkNode'
import { VirtualTitleGuard } from '../lib/tiptap/extensions/VirtualTitleGuard'
import { CodeBlockNode } from '../lib/tiptap/extensions/CodeBlockNode'
import { WIKILINK_STATE_KEY, getWikilinkPluginState, type WikilinkCandidate } from '../lib/tiptap/plugins/wikilinkState'
import { buildWikilinkCandidates } from '../lib/tiptap/wikilinkCandidates'
import { enterWikilinkEditFromNode, parseWikilinkToken, type WikilinkEditingRange } from '../lib/tiptap/extensions/wikilinkCommands'

const VIRTUAL_TITLE_BLOCK_ID = '__virtual_title__'

type HeadingNode = { level: 1 | 2 | 3; text: string }
type CorePropertyOption = { key: string; label?: string; description?: string }
const CORE_PROPERTY_OPTIONS: CorePropertyOption[] = [
  { key: 'tags', label: 'tags', description: 'Tag list' },
  { key: 'aliases', label: 'aliases', description: 'Alternative names' },
  { key: 'cssclasses', label: 'cssclasses', description: 'Note CSS classes' },
  { key: 'date', label: 'date', description: 'Primary date (YYYY-MM-DD)' },
  { key: 'deadline', label: 'deadline', description: 'Due date (YYYY-MM-DD)' },
  { key: 'archive', label: 'archive', description: 'Archive flag' },
  { key: 'published', label: 'published', description: 'Publish flag' }
]

const SLASH_COMMANDS = EDITOR_SLASH_COMMANDS

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
let editor: Editor | null = null
let suppressOnChange = false

const loadedTextByPath = ref<Record<string, string>>({})
const dirtyByPath = ref<Record<string, boolean>>({})
const savingByPath = ref<Record<string, boolean>>({})
const saveErrorByPath = ref<Record<string, string>>({})
const scrollTopByPath = ref<Record<string, number>>({})
const caretByPath = ref<Record<string, { kind: 'pm-selection'; from: number; to: number }>>({})
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let outlineTimer: ReturnType<typeof setTimeout> | null = null
const isLoadingLargeDocument = ref(false)
const loadStageLabel = ref('')
const loadProgressPercent = ref(0)
const loadProgressIndeterminate = ref(false)
const loadDocumentStats = ref<{ chars: number; lines: number } | null>(null)
const LARGE_DOC_THRESHOLD = 50_000

const slashOpen = ref(false)
const slashIndex = ref(0)
const slashLeft = ref(0)
const slashTop = ref(0)
const slashQuery = ref('')

const wikilinkOpen = ref(false)
const wikilinkIndex = ref(0)
const wikilinkLeft = ref(0)
const wikilinkTop = ref(0)
const wikilinkResults = ref<Array<{ id: string; label: string; target: string; isCreate: boolean }>>([])
const wikilinkEditingRange = ref<WikilinkEditingRange | null>(null)
const currentPath = computed(() => props.path?.trim() || '')
const visibleSlashCommands = computed(() => {
  const query = slashQuery.value.trim().toLowerCase()
  if (!query) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((command) => command.label.toLowerCase().includes(query) || command.id.toLowerCase().includes(query))
})

const formatToolbarOpen = ref(false)
const formatToolbarLeft = ref(0)
const formatToolbarTop = ref(0)
const cachedLinkTargets = ref<string[]>([])
const cachedLinkTargetsAt = ref(0)
const cachedHeadingsByTarget = ref<Record<string, string[]>>({})
const cachedHeadingsAt = ref<Record<string, number>>({})
const WIKILINK_TARGETS_TTL_MS = 15_000
const WIKILINK_HEADINGS_TTL_MS = 30_000

const { editorZoomStyle, initFromStorage: initEditorZoomFromStorage, zoomBy: zoomEditorBy, resetZoom: resetEditorZoom, getZoom } = useEditorZoom()
const { mermaidReplaceDialog, resolveMermaidReplaceDialog, requestMermaidReplaceConfirm } = useMermaidReplaceDialog()

function emitStatus(path: string) {
  emit('status', {
    path,
    dirty: Boolean(dirtyByPath.value[path]),
    saving: Boolean(savingByPath.value[path]),
    saveError: saveErrorByPath.value[path] ?? ''
  })
}

function setDirty(path: string, dirty: boolean) {
  dirtyByPath.value = { ...dirtyByPath.value, [path]: dirty }
  emitStatus(path)
}

function setSaving(path: string, saving: boolean) {
  savingByPath.value = { ...savingByPath.value, [path]: saving }
  emitStatus(path)
}

function setSaveError(path: string, message: string) {
  saveErrorByPath.value = { ...saveErrorByPath.value, [path]: message }
  emitStatus(path)
}

function clearAutosaveTimer() {
  if (!autosaveTimer) return
  clearTimeout(autosaveTimer)
  autosaveTimer = null
}

function countLines(input: string): number {
  if (!input) return 0
  return input.replace(/\r\n?/g, '\n').split('\n').length
}

async function flushUiFrame() {
  await nextTick()
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

function scheduleAutosave() {
  clearAutosaveTimer()
  autosaveTimer = setTimeout(() => {
    void saveCurrentFile(false)
  }, 1800)
}

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
  return (container.textContent ?? '').replace(/\u200B/g, ' ').replace(/\s+/g, ' ').trim()
}

function blockTextCandidate(block: EditorBlock | undefined): string {
  if (!block) return ''
  if (typeof block.data?.text !== 'undefined') return extractPlainText(block.data.text)
  if (typeof block.data?.code === 'string') return block.data.code.trim()
  return ''
}

function virtualTitleBlock(title: string): EditorBlock {
  return {
    id: VIRTUAL_TITLE_BLOCK_ID,
    type: 'header',
    data: { level: 1, text: title.trim() || 'Untitled' }
  }
}

function stripVirtualTitle(blocks: EditorBlock[]): EditorBlock[] {
  return blocks.filter((block) => block.id !== VIRTUAL_TITLE_BLOCK_ID)
}

function readVirtualTitle(blocks: EditorBlock[]): string {
  const virtual = blocks.find((block) => block.id === VIRTUAL_TITLE_BLOCK_ID)
  return blockTextCandidate(virtual)
}

function withVirtualTitle(blocks: EditorBlock[], title: string): { blocks: EditorBlock[]; changed: boolean } {
  const content = stripVirtualTitle(blocks.map((block) => ({ ...block, data: { ...(block.data ?? {}) } })))
  const desired = title.trim() || 'Untitled'
  const next = [virtualTitleBlock(desired), ...content]
  const first = blocks[0]
  const firstLevel = Number(first?.data?.level ?? 0)
  const firstText = blockTextCandidate(first)
  const hasSingleLeadingVirtual = Boolean(first) &&
    first.id === VIRTUAL_TITLE_BLOCK_ID &&
    first.type === 'header' &&
    firstLevel === 1 &&
    firstText === desired &&
    !blocks.slice(1).some((block) => block.id === VIRTUAL_TITLE_BLOCK_ID)

  return { blocks: next, changed: !hasSingleLeadingVirtual || blocks.length !== next.length }
}

function serializeCurrentDocBlocks(): EditorBlock[] {
  if (!editor) return []
  return fromTiptapDoc(editor.getJSON())
}

async function renderBlocks(blocks: EditorBlock[]) {
  if (!editor) return
  const doc = toTiptapDoc(blocks)
  const rememberedScroll = holder.value?.scrollTop ?? 0
  suppressOnChange = true
  editor.commands.setContent(doc, { emitUpdate: false })
  suppressOnChange = false
  await nextTick()
  if (holder.value) holder.value.scrollTop = rememberedScroll
}

function captureCaret(path: string) {
  if (!editor || !path) return
  const { from, to } = editor.state.selection
  caretByPath.value = {
    ...caretByPath.value,
    [path]: { kind: 'pm-selection', from, to }
  }
}

function restoreCaret(path: string) {
  if (!editor || !path) return false
  const snapshot = caretByPath.value[path]
  if (!snapshot) return false
  const max = Math.max(1, editor.state.doc.content.size)
  const from = Math.max(1, Math.min(snapshot.from, max))
  const to = Math.max(1, Math.min(snapshot.to, max))
  editor.commands.setTextSelection({ from, to })
  return true
}

function parseOutlineFromDoc(): HeadingNode[] {
  if (!editor) return []
  const headings: HeadingNode[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'heading') return
    if (node.attrs.isVirtualTitle) return
    const levelRaw = Number(node.attrs.level ?? 2)
    const level = (levelRaw >= 1 && levelRaw <= 3 ? levelRaw : 3) as 1 | 2 | 3
    const text = node.textContent.trim()
    if (!text) return
    headings.push({ level, text })
  })
  return headings
}

function clearOutlineTimer() {
  if (!outlineTimer) return
  clearTimeout(outlineTimer)
  outlineTimer = null
}

function emitOutlineSoon() {
  clearOutlineTimer()
  outlineTimer = setTimeout(() => {
    emit('outline', parseOutlineFromDoc())
  }, 120)
}

function closeSlashMenu() {
  slashOpen.value = false
  slashIndex.value = 0
  slashQuery.value = ''
}

function closeWikilinkMenu() {
  wikilinkOpen.value = false
  wikilinkIndex.value = 0
  wikilinkResults.value = []
  wikilinkEditingRange.value = null
}

function updateFormattingToolbar() {
  if (!editor || !holder.value) {
    formatToolbarOpen.value = false
    return
  }
  if (editor.state.selection instanceof NodeSelection) {
    formatToolbarOpen.value = false
    return
  }
  const { from, to, empty } = editor.state.selection
  if (empty || from === to) {
    formatToolbarOpen.value = false
    return
  }
  const start = editor.view.coordsAtPos(from)
  const end = editor.view.coordsAtPos(to)
  const holderRect = holder.value.getBoundingClientRect()
  const centerX = (start.left + end.right) / 2
  formatToolbarLeft.value = centerX - holderRect.left + holder.value.scrollLeft
  formatToolbarTop.value = Math.min(start.top, end.top) - holderRect.top + holder.value.scrollTop - 10
  formatToolbarOpen.value = true
}

function closestAnchorFromEventTarget(target: EventTarget | null): HTMLAnchorElement | null {
  const element = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null
  return element?.closest('a') as HTMLAnchorElement | null
}

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

const HeadingMeta = Extension.create({
  name: 'headingMeta',
  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          isVirtualTitle: {
            default: false
          }
        }
      }
    ]
  }
})

const { ensureEditor, destroyEditor } = useTiptapInstance({
  holder,
  getEditor: () => editor,
  setEditor: (instance) => {
    editor = instance
  },
  createOptions: (_holderEl, onEditorChange) => ({
    autofocus: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        codeBlock: false
      }),
      HeadingMeta,
      Link.configure({ openOnClick: false }),
      Underline,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ListKit,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Write here...' }),
      CalloutNode,
      MermaidNode.configure({ confirmReplace: requestMermaidReplaceConfirm }),
      QuoteNode,
      CodeBlockNode,
      WikilinkNode.configure({
        getCandidates: (query: string) => getWikilinkCandidates(query),
        onNavigate: (target: string) => openLinkTargetWithAutosave(target),
        onCreate: async (_target: string) => {},
        resolve: (target: string) => resolveWikilinkTarget(target)
      }),
      VirtualTitleGuard
    ],
    editorProps: {
      attributes: {
        class: 'ProseMirror meditor-prosemirror'
      },
      handleClick: (_view, _pos, event) => {
        const anchor = closestAnchorFromEventTarget(event.target)
        if (!anchor) return false

        const wikilinkTarget = (
          anchor.getAttribute('data-target') ??
          anchor.getAttribute('data-wikilink-target') ??
          ''
        ).trim()
        if (wikilinkTarget) {
          if (event.metaKey || event.ctrlKey) {
            event.preventDefault()
            event.stopPropagation()
            const view = _view
            let pos = 0
            try {
              pos = view.posAtDOM(anchor, 0)
            } catch {
              pos = 0
            }
            const candidates = [pos, pos - 1, pos + 1]
            for (const candidate of candidates) {
              if (candidate < 0 || candidate > view.state.doc.content.size) continue
              const range = enterWikilinkEditFromNode(editor!, candidate)
              if (!range) continue
              view.dispatch(view.state.tr.setMeta(WIKILINK_STATE_KEY, { type: 'startEditing', range }))
              return true
            }
            return true
          }
          event.preventDefault()
          event.stopPropagation()
          void openLinkTargetWithAutosave(wikilinkTarget)
          return true
        }

        const href = anchor.getAttribute('href')?.trim() ?? ''
        const safe = sanitizeExternalHref(href)
        if (!safe) return false
        event.preventDefault()
        event.stopPropagation()
        void openExternalUrl(safe)
        return true
      }
    },
    onUpdate: () => {
      onEditorChange()
      syncWikilinkUiFromPluginState()
    },
    onSelectionUpdate: () => {
      const path = currentPath.value
      if (path) captureCaret(path)
      updateFormattingToolbar()
      syncWikilinkUiFromPluginState()
    },
    onTransaction: () => {
      syncWikilinkUiFromPluginState()
    }
  }),
  onEditorChange: () => {
    const path = currentPath.value
    if (suppressOnChange || !path) return
    setDirty(path, true)
    setSaveError(path, '')
    scheduleAutosave()
    emitOutlineSoon()
  },
  beforeDestroy: () => {
    clearAutosaveTimer()
    clearOutlineTimer()
    closeSlashMenu()
    closeWikilinkMenu()
  }
})

async function loadCurrentFile(path: string) {
  if (!path) return
  await ensureEditor()
  await ensurePropertySchemaLoaded()
  if (!editor) return

  setSaveError(path, '')
  clearAutosaveTimer()
  closeSlashMenu()
  closeWikilinkMenu()
  formatToolbarOpen.value = false
  isLoadingLargeDocument.value = false
  loadStageLabel.value = ''
  loadProgressPercent.value = 0
  loadProgressIndeterminate.value = false
  loadDocumentStats.value = null
  cachedLinkTargetsAt.value = 0
  cachedHeadingsByTarget.value = {}
  cachedHeadingsAt.value = {}

  try {
    const txt = await props.openFile(path)
    parseAndStoreFrontmatter(path, txt)
    const body = frontmatterByPath.value[path]?.body ?? txt
    const isLargeDocument = txt.length >= LARGE_DOC_THRESHOLD
    if (isLargeDocument) {
      isLoadingLargeDocument.value = true
      loadDocumentStats.value = { chars: body.length, lines: countLines(body) }
      loadStageLabel.value = 'Parsing markdown blocks...'
      loadProgressPercent.value = 35
      loadProgressIndeterminate.value = false
      await flushUiFrame()
    }
    const parsed = markdownToEditorData(body)
    const normalized = withVirtualTitle(parsed.blocks as EditorBlock[], noteTitleFromPath(path)).blocks

    suppressOnChange = true
    if (isLargeDocument) {
      loadStageLabel.value = 'Rendering blocks in editor...'
      loadProgressPercent.value = 70
      await flushUiFrame()
    }
    editor.commands.setContent(toTiptapDoc(normalized), { emitUpdate: false })
    suppressOnChange = false

    loadedTextByPath.value = { ...loadedTextByPath.value, [path]: txt }
    setDirty(path, false)

    await nextTick()
    const remembered = scrollTopByPath.value[path]
    if (holder.value && typeof remembered === 'number') {
      holder.value.scrollTop = remembered
    }
    if (!restoreCaret(path)) {
      editor.commands.focus('end')
    }

    emitOutlineSoon()
    syncWikilinkUiFromPluginState()
  } catch (error) {
    setSaveError(path, error instanceof Error ? error.message : 'Could not read file.')
  } finally {
    isLoadingLargeDocument.value = false
    loadStageLabel.value = ''
    loadProgressPercent.value = 0
    loadProgressIndeterminate.value = false
    loadDocumentStats.value = null
  }
}

function movePathState(from: string, to: string) {
  if (!from || !to || from === to) return
  const move = <T,>(record: Record<string, T>) => {
    if (!(from in record)) return record
    const next = { ...record }
    next[to] = next[from]
    delete next[from]
    return next
  }
  loadedTextByPath.value = move(loadedTextByPath.value)
  dirtyByPath.value = move(dirtyByPath.value)
  savingByPath.value = move(savingByPath.value)
  saveErrorByPath.value = move(saveErrorByPath.value)
  scrollTopByPath.value = move(scrollTopByPath.value)
  caretByPath.value = move(caretByPath.value)
}

async function saveCurrentFile(manual = true) {
  const initialPath = currentPath.value
  if (!initialPath || !editor || savingByPath.value[initialPath]) return

  let savePath = initialPath
  setSaving(savePath, true)
  if (manual) setSaveError(savePath, '')

  try {
    const rawBlocks = serializeCurrentDocBlocks()
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
    const bodyMarkdown = editorDataToMarkdown({ blocks: markdownBlocks })
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
      movePathState(initialPath, savePath)
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
    if (savePath !== initialPath) {
      const next = { ...loadedTextByPath.value }
      delete next[initialPath]
      loadedTextByPath.value = next
    }

    parseAndStoreFrontmatter(savePath, markdown)
    setDirty(savePath, false)
  } catch (error) {
    setSaveError(savePath, error instanceof Error ? error.message : 'Could not save file.')
  } finally {
    setSaving(savePath, false)
    emitOutlineSoon()
  }
}

function openSlashAtSelection(query = '', options?: { preserveIndex?: boolean }) {
  if (!editor || !holder.value) return
  const pos = editor.state.selection.from
  const rect = editor.view.coordsAtPos(pos)
  const holderRect = holder.value.getBoundingClientRect()
  slashLeft.value = rect.left - holderRect.left + holder.value.scrollLeft
  slashTop.value = rect.bottom - holderRect.top + holder.value.scrollTop + 8
  const previousQuery = slashQuery.value
  const previousIndex = slashIndex.value
  slashQuery.value = query
  const canPreserve = Boolean(options?.preserveIndex) && previousQuery === query
  slashIndex.value = canPreserve ? previousIndex : 0
  slashOpen.value = visibleSlashCommands.value.length > 0
  if (slashOpen.value && canPreserve) {
    slashIndex.value = Math.max(0, Math.min(slashIndex.value, visibleSlashCommands.value.length - 1))
  }
}

function currentTextSelectionContext() {
  if (!editor) return null
  const { selection } = editor.state
  if (!selection.empty) return null
  const { $from } = selection
  const parent = $from.parent
  if (!parent.isTextblock) return null
  const text = parent.textContent
  const from = $from.start()
  const to = $from.end()
  const offset = $from.parentOffset
  return { from, to, text, offset, nodeType: parent.type.name }
}

function readSlashContext() {
  const context = currentTextSelectionContext()
  if (!context || context.nodeType !== 'paragraph') return null
  const before = context.text.slice(0, context.offset)
  const match = before.match(/^\/([a-zA-Z0-9_-]*)$/)
  if (!match) return null
  return {
    query: match[1] ?? '',
    from: context.from,
    to: context.to
  }
}

function insertBlockFromDescriptor(type: string, data: Record<string, unknown>) {
  if (!editor) return false
  const context = currentTextSelectionContext()
  if (!context) return false
  const slashContext = readSlashContext()

  if (type === 'list') {
    const style = data.style === 'ordered' ? 'ordered' : data.style === 'checklist' ? 'checklist' : 'unordered'
    const chain = editor.chain().focus()
    if (slashContext) {
      chain.deleteRange({ from: slashContext.from, to: slashContext.to })
    }
    if (style === 'ordered') {
      chain.toggleOrderedList().run()
      return true
    }
    if (style === 'checklist') {
      chain.toggleTaskList().run()
      return true
    }
    chain.toggleBulletList().run()
    return true
  }

  const content: JSONContent | null = (() => {
    switch (type) {
      case 'header':
        return { type: 'heading', attrs: { level: Number(data.level ?? 2) }, content: [] }
      case 'table':
        return {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph' }] }, { type: 'tableHeader', content: [{ type: 'paragraph' }] }] },
            { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }, { type: 'tableCell', content: [{ type: 'paragraph' }] }] }
          ]
        }
      case 'callout':
        return { type: 'calloutBlock', attrs: { kind: String(data.kind ?? 'NOTE'), message: '' } }
      case 'mermaid':
        return { type: 'mermaidBlock', attrs: { code: String(data.code ?? '') } }
      case 'code':
        return { type: 'codeBlock', attrs: { language: '' }, content: [] }
      case 'quote':
        return { type: 'quoteBlock', attrs: { text: String(data.text ?? '') } }
      case 'delimiter':
        return { type: 'horizontalRule' }
      default:
        return { type: 'paragraph', content: [] }
    }
  })()

  if (!content) return false
  if (slashContext) {
    editor.chain().focus().deleteRange({ from: slashContext.from, to: slashContext.to }).insertContent(content).run()
  } else {
    editor.chain().focus().insertContent(content).run()
  }
  return true
}

async function loadWikilinkTargets() {
  const now = Date.now()
  if (cachedLinkTargets.value.length && now - cachedLinkTargetsAt.value < WIKILINK_TARGETS_TTL_MS) {
    return cachedLinkTargets.value
  }
  try {
    const targets = await props.loadLinkTargets()
    cachedLinkTargets.value = targets
    cachedLinkTargetsAt.value = Date.now()
    return targets
  } catch {
    cachedLinkTargets.value = []
    cachedLinkTargetsAt.value = Date.now()
    return []
  }
}

async function loadWikilinkHeadings(target: string) {
  const key = target.trim().toLowerCase()
  const now = Date.now()
  if (
    key &&
    cachedHeadingsByTarget.value[key] &&
    now - (cachedHeadingsAt.value[key] ?? 0) < WIKILINK_HEADINGS_TTL_MS
  ) {
    return cachedHeadingsByTarget.value[key]
  }
  try {
    const headings = await props.loadLinkHeadings(target)
    if (key) {
      cachedHeadingsByTarget.value = { ...cachedHeadingsByTarget.value, [key]: headings }
      cachedHeadingsAt.value = { ...cachedHeadingsAt.value, [key]: Date.now() }
    }
    return headings
  } catch {
    return []
  }
}

async function resolveWikilinkTarget(target: string): Promise<boolean> {
  const parsed = parseWikilinkTarget(target)
  if (!parsed.notePath) return true
  const targets = await loadWikilinkTargets()
  const wanted = parsed.notePath.toLowerCase()
  return targets.some((entry) => entry.toLowerCase() === wanted)
}

async function getWikilinkCandidates(query: string): Promise<WikilinkCandidate[]> {
  return buildWikilinkCandidates({
    query,
    loadTargets: () => loadWikilinkTargets(),
    loadHeadings: (target) => loadWikilinkHeadings(target),
    currentHeadings: () => parseOutlineFromDoc().map((item) => item.text),
    resolve: (target) => resolveWikilinkTarget(target)
  })
}

function syncWikilinkUiFromPluginState() {
  if (!editor || !holder.value) {
    closeWikilinkMenu()
    return
  }

  const state = getWikilinkPluginState(editor.state)
  if (state.mode === 'editing' && state.editingRange) {
    const selection = editor.state.selection
    const stillInside = selection.from > state.editingRange.from && selection.to < state.editingRange.to
    if (!stillInside) {
      const token = editor.state.doc.textBetween(state.editingRange.from, state.editingRange.to, '', '')
      const parsed = parseWikilinkToken(token)
      if (parsed) {
        const nodeType = editor.state.schema.nodes[TIPTAP_NODE_TYPES.wikilink]
        if (nodeType) {
          const node = nodeType.create({
            target: parsed.target,
            label: parsed.label,
            exists: true
          })
          const exitOnLeft = selection.from <= state.editingRange.from
          const tr = editor.state.tr.replaceWith(state.editingRange.from, state.editingRange.to, node)
          const pos = exitOnLeft ? state.editingRange.from : state.editingRange.from + node.nodeSize
          tr.setSelection(TextSelection.create(tr.doc, Math.max(1, Math.min(pos, tr.doc.content.size))))
          editor.view.dispatch(tr)
        }
      }
      editor.view.dispatch(editor.state.tr.setMeta(WIKILINK_STATE_KEY, { type: 'setIdle' }))
      closeWikilinkMenu()
      return
    }
  }

  if (!state.open || state.mode !== 'editing' || !state.editingRange) {
    closeWikilinkMenu()
    return
  }

  wikilinkOpen.value = true
  wikilinkIndex.value = state.selectedIndex
  wikilinkEditingRange.value = state.editingRange
  wikilinkResults.value = state.candidates.map((candidate) => ({
    id: `${candidate.isCreate ? 'create' : 'existing'}:${candidate.target}`,
    label: candidate.label ?? candidate.target,
    target: candidate.target,
    isCreate: Boolean(candidate.isCreate)
  }))

  const pos = editor.state.selection.from
  const rect = editor.view.coordsAtPos(pos)
  const holderRect = holder.value.getBoundingClientRect()
  wikilinkLeft.value = rect.left - holderRect.left + holder.value.scrollLeft
  wikilinkTop.value = rect.bottom - holderRect.top + holder.value.scrollTop + 8
}

function onWikilinkMenuSelect(target: string) {
  applyWikilinkCandidateToken(target, 'after')
}

function applyWikilinkCandidateToken(target: string, placement: 'after' | 'inside') {
  if (!editor || !wikilinkEditingRange.value) return
  const trimmedTarget = target.trim()
  if (!trimmedTarget) return
  const range = wikilinkEditingRange.value
  const token = `[[${trimmedTarget}]]`
  const tr = editor.state.tr.insertText(token, range.from, range.to)
  const nextPos = placement === 'inside'
    ? range.from + token.length - 2
    : range.from + token.length
  tr.setSelection(TextSelection.create(tr.doc, Math.min(nextPos, tr.doc.content.size)))
  editor.view.dispatch(tr)
  if (placement === 'inside') {
    editor.view.dispatch(editor.state.tr.setMeta(WIKILINK_STATE_KEY, {
      type: 'startEditing',
      range: { from: range.from, to: range.from + token.length }
    }))
  } else {
    editor.view.dispatch(editor.state.tr.setMeta(WIKILINK_STATE_KEY, { type: 'setIdle' }))
  }
  syncWikilinkUiFromPluginState()
}

function onWikilinkMenuIndexUpdate(index: number) {
  wikilinkIndex.value = index
  if (!editor) return
  const tr = editor.state.tr.setMeta(WIKILINK_STATE_KEY, { type: 'setSelectedIndex', index })
  editor.view.dispatch(tr)
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

function onEditorKeydown(event: KeyboardEvent) {
  if (!editor) return

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

  if (slashOpen.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!visibleSlashCommands.value.length) return
      slashIndex.value = (slashIndex.value + 1) % visibleSlashCommands.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!visibleSlashCommands.value.length) return
      slashIndex.value = (slashIndex.value - 1 + visibleSlashCommands.value.length) % visibleSlashCommands.value.length
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const command = visibleSlashCommands.value[slashIndex.value]
      if (!command) return
      closeSlashMenu()
      insertBlockFromDescriptor(command.type, command.data)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSlashMenu()
      return
    }
  }

  if (
    event.key === '/' &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    currentTextSelectionContext()?.nodeType === 'paragraph'
  ) {
    event.preventDefault()
    editor.chain().focus().insertContent('/').run()
    openSlashAtSelection('')
    return
  }

  if ((event.key === ' ' || event.code === 'Space') && currentTextSelectionContext()?.nodeType === 'paragraph') {
    const marker = currentTextSelectionContext()?.text.trim() ?? ''
    const transform = applyMarkdownShortcut(marker)
    if (transform) {
      event.preventDefault()
      closeSlashMenu()
      insertBlockFromDescriptor(transform.type, transform.data)
      return
    }
  }

  if (event.key === 'Enter' && currentTextSelectionContext()?.nodeType === 'paragraph') {
    const marker = currentTextSelectionContext()?.text.trim() ?? ''
    if (marker === '```') {
      event.preventDefault()
      insertBlockFromDescriptor('code', { code: '' })
    }
  }
}

function onEditorKeyup() {
  const path = currentPath.value
  if (path) captureCaret(path)
  const slash = readSlashContext()
  if (slash) {
    openSlashAtSelection(slash.query, { preserveIndex: true })
  } else {
    closeSlashMenu()
  }
  updateFormattingToolbar()
}

function isMarkActive(name: 'bold' | 'italic' | 'strike' | 'underline' | 'code' | 'link') {
  if (!editor) return false
  return editor.isActive(name)
}

function toggleMark(name: 'bold' | 'italic' | 'strike' | 'underline' | 'code') {
  if (!editor) return
  const chain = editor.chain().focus()
  if (name === 'bold') chain.toggleBold().run()
  if (name === 'italic') chain.toggleItalic().run()
  if (name === 'strike') chain.toggleStrike().run()
  if (name === 'underline') chain.toggleUnderline().run()
  if (name === 'code') chain.toggleCode().run()
  updateFormattingToolbar()
}

function toggleLink() {
  if (!editor) return
  const existing = editor.getAttributes('link').href as string | undefined
  const next = window.prompt('URL', existing ?? 'https://')
  if (next === null) return
  const href = next.trim()
  if (!href) {
    editor.chain().focus().unsetLink().run()
  } else {
    const safe = sanitizeExternalHref(href)
    if (!safe) return
    editor.chain().focus().setLink({ href: safe, target: '_blank', rel: 'noopener noreferrer' }).run()
  }
  updateFormattingToolbar()
}

function onEditorContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const heading = target?.closest('h1') as HTMLElement | null
  if (!heading) return
  if (heading.closest('[data-virtual-title="true"]') || heading.parentElement?.getAttribute('data-virtual-title') === 'true') {
    event.preventDefault()
    event.stopPropagation()
  }
}

function onEditorPaste(event: ClipboardEvent) {
  if (!editor) return
  const plain = event.clipboardData?.getData('text/plain') ?? ''
  const html = event.clipboardData?.getData('text/html') ?? ''
  if (!isLikelyMarkdownPaste(plain, html)) return
  const parsed = markdownToEditorData(plain)
  if (!parsed.blocks.length) return

  event.preventDefault()
  event.stopPropagation()

  const json = toTiptapDoc(parsed.blocks as EditorBlock[])
  const content = Array.isArray(json.content) ? json.content : []
  editor.chain().focus().insertContent(content).run()
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
    await loadCurrentFile(nextPath)
  }
)

onMounted(async () => {
  initEditorZoomFromStorage()

  if (currentPath.value) {
    await loadCurrentFile(currentPath.value)
  } else {
    await ensureEditor()
  }

  holder.value?.addEventListener('keydown', onEditorKeydown, true)
  holder.value?.addEventListener('keyup', onEditorKeyup, true)
  holder.value?.addEventListener('contextmenu', onEditorContextMenu, true)
  holder.value?.addEventListener('paste', onEditorPaste, true)
})

onBeforeUnmount(async () => {
  clearOutlineTimer()
  clearAutosaveTimer()
  if (mermaidReplaceDialog.value.resolve) {
    mermaidReplaceDialog.value.resolve(false)
  }
  holder.value?.removeEventListener('keydown', onEditorKeydown, true)
  holder.value?.removeEventListener('keyup', onEditorKeyup, true)
  holder.value?.removeEventListener('contextmenu', onEditorContextMenu, true)
  holder.value?.removeEventListener('paste', onEditorPaste, true)
  await destroyEditor()
})

async function revealOutlineHeading(index: number) {
  if (!editor) return
  let visibleIndex = 0
  let targetPos = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    if (node.attrs.isVirtualTitle) return
    if (visibleIndex === index) {
      targetPos = pos + 1
      return false
    }
    visibleIndex += 1
  })
  if (targetPos <= 0) return
  editor.chain().focus().setTextSelection(targetPos).scrollIntoView().run()
}

async function revealSnippet(snippet: string) {
  if (!editor || !snippet) return
  const normalizedSnippet = snippet.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  if (!normalizedSnippet) return

  let targetPos = -1
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    const value = (node.text ?? '').replace(/\s+/g, ' ').toLowerCase()
    const idx = value.indexOf(normalizedSnippet)
    if (idx >= 0) {
      targetPos = pos + idx
      return false
    }
  })

  if (targetPos <= 0) return
  editor.chain().focus().setTextSelection(targetPos + 1).scrollIntoView().run()
}

async function revealAnchor(anchor: { heading?: string; blockId?: string }): Promise<boolean> {
  if (!editor || (!anchor.heading && !anchor.blockId)) return false

  let targetPos = -1
  if (anchor.heading) {
    const wanted = normalizeHeadingAnchor(anchor.heading)
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'heading' || node.attrs.isVirtualTitle) return
      const text = node.textContent.trim()
      if (!text) return
      if (normalizeHeadingAnchor(text) === wanted || slugifyHeading(text) === slugifyHeading(anchor.heading ?? '')) {
        targetPos = pos + 1
        return false
      }
    })
  } else if (anchor.blockId) {
    const wanted = normalizeBlockId(anchor.blockId)
    const matcher = new RegExp(`(^|\\s)\\^${wanted.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(\\s|$)`, 'i')
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return
      if (matcher.test(node.text ?? '')) {
        targetPos = pos + 1
        return false
      }
    })
  }

  if (targetPos <= 0) return false
  editor.chain().focus().setTextSelection(targetPos).scrollIntoView().run()
  return true
}

function focusEditor() {
  editor?.commands.focus()
}

async function focusFirstContentBlock() {
  if (!editor) return
  let targetPos = 1
  let firstSeen = false
  editor.state.doc.descendants((node, pos) => {
    if (!firstSeen && node.type.name === 'heading' && node.attrs.isVirtualTitle) {
      firstSeen = true
      return
    }
    if (!firstSeen) return
    if (node.isTextblock) {
      targetPos = pos + 1
      return false
    }
  })
  editor.chain().focus().setTextSelection(targetPos).run()
}

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
          :style="editorZoomStyle"
          @click="closeSlashMenu(); closeWikilinkMenu()"
        >
          <EditorContent v-if="editor" :editor="editor" />

          <div
            v-if="formatToolbarOpen"
            class="absolute z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            :style="{ left: `${formatToolbarLeft}px`, top: `${formatToolbarTop}px` }"
          >
            <button type="button" class="px-2 py-1 text-xs" :class="isMarkActive('bold') ? 'bg-slate-200 dark:bg-slate-700' : ''" @mousedown.prevent @click="toggleMark('bold')">B</button>
            <button type="button" class="px-2 py-1 text-xs italic" :class="isMarkActive('italic') ? 'bg-slate-200 dark:bg-slate-700' : ''" @mousedown.prevent @click="toggleMark('italic')">I</button>
            <button type="button" class="px-2 py-1 text-xs line-through" :class="isMarkActive('strike') ? 'bg-slate-200 dark:bg-slate-700' : ''" @mousedown.prevent @click="toggleMark('strike')">S</button>
            <button type="button" class="px-2 py-1 text-xs underline" :class="isMarkActive('underline') ? 'bg-slate-200 dark:bg-slate-700' : ''" @mousedown.prevent @click="toggleMark('underline')">U</button>
            <button type="button" class="px-2 py-1 text-xs font-mono" :class="isMarkActive('code') ? 'bg-slate-200 dark:bg-slate-700' : ''" @mousedown.prevent @click="toggleMark('code')">{ }</button>
            <button type="button" class="px-2 py-1 text-xs" :class="isMarkActive('link') ? 'bg-slate-200 dark:bg-slate-700' : ''" @mousedown.prevent @click="toggleLink">Link</button>
          </div>

          <EditorSlashMenu
            :open="slashOpen"
            :index="slashIndex"
            :left="slashLeft"
            :top="slashTop"
            :commands="visibleSlashCommands"
            @update:index="slashIndex = $event"
            @select="closeSlashMenu(); insertBlockFromDescriptor($event.type, $event.data)"
          />

          <EditorWikilinkMenu
            :open="wikilinkOpen"
            :index="wikilinkIndex"
            :left="wikilinkLeft"
            :top="wikilinkTop"
            :results="wikilinkResults"
            @menu-el="() => {}"
            @update:index="onWikilinkMenuIndexUpdate($event)"
            @select="onWikilinkMenuSelect($event)"
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

.editor-holder :deep(a.wikilink) {
  color: var(--meditor-link-color);
  text-decoration: underline;
}

.editor-holder :deep(a.wikilink.is-missing) {
  color: rgb(220 38 38);
  text-decoration-style: dashed;
}

.editor-holder :deep(.ProseMirror) {
  min-height: 100%;
  outline: none;
}

.editor-holder :deep(.ProseMirror p) {
  margin: 0.35rem 0;
}

.editor-holder :deep(.ProseMirror h1) {
  font-size: calc(2rem * var(--editor-zoom, 1));
  margin: 0.6rem 0;
}

.editor-holder :deep(.ProseMirror h2) {
  font-size: calc(1.6rem * var(--editor-zoom, 1));
  margin: 0.55rem 0;
}

.editor-holder :deep(.ProseMirror h3) {
  font-size: calc(1.35rem * var(--editor-zoom, 1));
  margin: 0.5rem 0;
}

.editor-holder :deep(.ProseMirror ul),
.editor-holder :deep(.ProseMirror ol) {
  margin: 0.45rem 0 0.45rem 1.35rem;
  padding: 0;
}

.editor-holder :deep(.ProseMirror ul) {
  list-style: disc;
}

.editor-holder :deep(.ProseMirror ol) {
  list-style: decimal;
}

.editor-holder :deep(.ProseMirror ul ul) {
  list-style: circle;
}

.editor-holder :deep(.ProseMirror ol ol) {
  list-style: lower-alpha;
}

.editor-holder :deep(.ProseMirror li) {
  margin: 0.2rem 0;
}

.editor-holder :deep(.ProseMirror ul[data-type="taskList"]) {
  list-style: none;
  margin-left: 0.25rem;
}

.editor-holder :deep(.ProseMirror ul[data-type="taskList"] li) {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.editor-holder :deep(.ProseMirror ul[data-type="taskList"] li > label) {
  margin-top: 0;
  display: inline-flex;
  align-items: center;
}

.editor-holder :deep(.ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]) {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: rgb(37 99 235);
  cursor: pointer;
}

.editor-holder :deep(.ProseMirror ul[data-type="taskList"] li > div > p) {
  margin: 0;
}

.editor-holder :deep(.ProseMirror table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.6rem 0;
}

.editor-holder :deep(.ProseMirror th),
.editor-holder :deep(.ProseMirror td) {
  border: 1px solid rgb(203 213 225);
  padding: 0.45rem 0.55rem;
  vertical-align: top;
}

.editor-holder :deep(.ProseMirror th) {
  font-weight: 700;
  background: rgb(241 245 249);
}

.editor-holder :deep(.ProseMirror pre) {
  border: 1px solid rgb(226 232 240);
  border-radius: 0.6rem;
  padding: 0.8rem;
  overflow: auto;
}

.editor-holder :deep(.meditor-code-node) {
  margin: 0.5rem 0;
}

.editor-holder :deep(.meditor-code-node-actions) {
  display: flex;
  gap: 0.36rem;
  justify-content: flex-end;
  margin-bottom: 0.35rem;
}

.editor-holder :deep(.meditor-code-node pre.meditor-code-wrap-enabled) {
  white-space: pre-wrap;
  word-break: break-word;
}

.editor-holder :deep(.meditor-code-copy-btn),
.editor-holder :deep(.meditor-code-wrap-btn) {
  border: 1px solid rgb(203 213 225);
  border-radius: 0.4rem;
  background: white;
  color: rgb(51 65 85);
  font-size: 0.7rem;
  line-height: 1;
  padding: 0.28rem 0.45rem;
  cursor: pointer;
}

.dark .editor-holder :deep(.ProseMirror th),
.dark .editor-holder :deep(.ProseMirror td) {
  border-color: rgb(71 85 105);
}

.dark .editor-holder :deep(.ProseMirror th) {
  background: rgb(30 41 59);
}
</style>
