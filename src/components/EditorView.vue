<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Editor, EditorContent, Extension } from '@tiptap/vue-3'
import { TextSelection, type Transaction } from '@tiptap/pm/state'
import type { EditorView as ProseMirrorEditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { DragHandle as DragHandleVue3 } from '@tiptap/extension-drag-handle-vue-3'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { ListKit } from '@tiptap/extension-list'
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
import EditorBlockMenu from './editor/EditorBlockMenu.vue'
import EditorTableToolbar from './editor/EditorTableToolbar.vue'
import EditorInlineFormatToolbar from './editor/EditorInlineFormatToolbar.vue'
import EditorLargeDocOverlay from './editor/EditorLargeDocOverlay.vue'
import EditorMermaidReplaceDialog from './editor/EditorMermaidReplaceDialog.vue'
import { composeMarkdownDocument, serializeFrontmatter } from '../lib/frontmatter'
import { useFrontmatterProperties } from '../composables/useFrontmatterProperties'
import { useEditorZoom } from '../composables/useEditorZoom'
import { useMermaidReplaceDialog } from '../composables/useMermaidReplaceDialog'
import { useInlineFormatToolbar } from '../composables/useInlineFormatToolbar'
import { applyMarkdownShortcut, isEditorZoomModifier, isLikelyMarkdownPaste, isZoomInShortcut, isZoomOutShortcut, isZoomResetShortcut } from '../lib/editorInteractions'
import { normalizeBlockId, normalizeHeadingAnchor, parseWikilinkTarget, slugifyHeading } from '../lib/wikilinks'
import { toTiptapDoc } from '../lib/tiptap/editorBlocksToTiptapDoc'
import { fromTiptapDoc } from '../lib/tiptap/tiptapDocToEditorBlocks'
import { TIPTAP_NODE_TYPES } from '../lib/tiptap/types'
import { toPersistedTextSelection } from '../lib/tiptap/selectionSnapshot'
import { useDocumentEditorSessions, type PaneId } from '../composables/useDocumentEditorSessions'
import { CalloutNode } from '../lib/tiptap/extensions/CalloutNode'
import { MermaidNode } from '../lib/tiptap/extensions/MermaidNode'
import { QuoteNode } from '../lib/tiptap/extensions/QuoteNode'
import { WikilinkNode } from '../lib/tiptap/extensions/WikilinkNode'
import { VirtualTitleGuard } from '../lib/tiptap/extensions/VirtualTitleGuard'
import { CodeBlockNode } from '../lib/tiptap/extensions/CodeBlockNode'
import { WIKILINK_STATE_KEY, getWikilinkPluginState, type WikilinkCandidate } from '../lib/tiptap/plugins/wikilinkState'
import { buildWikilinkCandidates } from '../lib/tiptap/wikilinkCandidates'
import { enterWikilinkEditFromNode, parseWikilinkToken, type WikilinkEditingRange } from '../lib/tiptap/extensions/wikilinkCommands'
import type { BlockMenuActionItem, BlockMenuTarget, TurnIntoType } from '../lib/tiptap/blockMenu/types'
import { canCopyAnchor, canTurnInto, toBlockMenuTarget } from '../lib/tiptap/blockMenu/guards'
import { canMoveDown, canMoveUp, deleteNode, duplicateNode, insertAbove, insertBelow, moveNodeDown, moveNodeUp, turnInto } from '../lib/tiptap/blockMenu/actions'
import { computeHandleLock, resolveActiveTarget, type DragHandleUiState } from '../lib/tiptap/blockMenu/dragHandleState'
import {
  buildTableToolbarActions,
  type TableActionId,
  type TableCommandCapabilities,
  type TableToolbarAction
} from '../lib/tiptap/tableToolbarActions'
import { applyTableAction } from '../lib/tiptap/tableCommands'

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
  openPaths?: string[]
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
const contentShell = ref<HTMLDivElement | null>(null)
let editor: Editor | null = null
let suppressOnChange = false
let pathLoadToken = 0
const MAIN_PANE_ID: PaneId = 'main'
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
const slashActivatedByUser = ref(false)

const wikilinkOpen = ref(false)
const wikilinkIndex = ref(0)
const wikilinkLeft = ref(0)
const wikilinkTop = ref(0)
const wikilinkResults = ref<Array<{ id: string; label: string; target: string; isCreate: boolean }>>([])
const wikilinkEditingRange = ref<WikilinkEditingRange | null>(null)
const blockMenuOpen = ref(false)
const blockMenuIndex = ref(0)
const blockMenuTarget = ref<BlockMenuTarget | null>(null)
const lastStableBlockMenuTarget = ref<BlockMenuTarget | null>(null)
const blockMenuFloatingEl = ref<HTMLDivElement | null>(null)
const blockMenuPos = ref({ x: 0, y: 0 })
const tableToolbarFloatingEl = ref<HTMLDivElement | null>(null)
const tableToolbarOpen = ref(false)
const tableToolbarLeft = ref(0) // menu anchor, holder-relative
const tableToolbarTop = ref(0) // menu anchor, holder-relative
const tableToolbarViewportLeft = ref(0)
const tableToolbarViewportTop = ref(0)
const tableToolbarViewportMaxHeight = ref(420)
const tableMenuBtnLeft = ref(0)
const tableMenuBtnTop = ref(0)
const tableBoxLeft = ref(0)
const tableBoxTop = ref(0)
const tableBoxWidth = ref(0)
const tableBoxHeight = ref(0)
const tableAddTopVisible = ref(false)
const tableAddBottomVisible = ref(false)
const tableAddLeftVisible = ref(false)
const tableAddRightVisible = ref(false)
const tableToolbarTriggerVisible = ref(false)
const tableToolbarHovering = ref(false)
const tableToolbarActions = ref<TableToolbarAction[]>([])
let tableEdgeTopSeenAt = 0
let tableEdgeBottomSeenAt = 0
let tableEdgeLeftSeenAt = 0
let tableEdgeRightSeenAt = 0
let tableHoverHideTimer: ReturnType<typeof setTimeout> | null = null
const TABLE_EDGE_SHOW_THRESHOLD = 20
const TABLE_EDGE_STICKY_THRESHOLD = 44
const TABLE_EDGE_STICKY_MS = 280
const TABLE_MARKDOWN_MODE = true
const DRAG_HANDLE_PLUGIN_KEY = 'meditor-drag-handle'
const DRAG_HANDLE_DEBUG = false
let lastAppliedDragHandleLock: boolean | null = null
const dragHandleUiState = ref<DragHandleUiState>({
  menuOpen: false,
  gutterHover: false,
  controlsHover: false,
  dragging: false,
  activeTarget: null,
})
const gutterHitboxStyle = ref<Record<string, string>>({
  position: 'absolute',
  top: '0',
  left: '0px',
  bottom: '0',
  width: '0px',
})
const TURN_INTO_TYPES: TurnIntoType[] = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
  'blockquote',
]
const TURN_INTO_LABELS: Record<TurnIntoType, string> = {
  paragraph: 'Paragraph',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  bulletList: 'Bullet list',
  orderedList: 'Ordered list',
  taskList: 'Task list',
  codeBlock: 'Code block',
  blockquote: 'Quote',
}
const currentPath = computed(() => props.path?.trim() || '')
const sessionStore = useDocumentEditorSessions({
  createEditor: (path) => createSessionEditor(path)
})
const visibleSlashCommands = computed(() => {
  const query = slashQuery.value.trim().toLowerCase()
  if (!query) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((command) => command.label.toLowerCase().includes(query) || command.id.toLowerCase().includes(query))
})

const inlineFormatToolbar = useInlineFormatToolbar({
  holder,
  getEditor: () => editor,
  sanitizeHref: sanitizeExternalHref
})
const cachedLinkTargets = ref<string[]>([])
const cachedLinkTargetsAt = ref(0)
const cachedHeadingsByTarget = ref<Record<string, string[]>>({})
const cachedHeadingsAt = ref<Record<string, number>>({})
const WIKILINK_TARGETS_TTL_MS = 15_000
const WIKILINK_HEADINGS_TTL_MS = 30_000
const computedDragLock = computed(() => computeHandleLock(dragHandleUiState.value))
const debugTargetPos = computed(() => String(dragHandleUiState.value.activeTarget?.pos ?? ''))
// Keep template binding reactive when active session editor changes.
const renderedEditor = computed(() => sessionStore.getActiveSession(MAIN_PANE_ID)?.editor ?? null)
const blockMenuActionTarget = computed(() => resolveActiveTarget(dragHandleUiState.value.activeTarget, lastStableBlockMenuTarget.value))
const blockMenuActions = computed<BlockMenuActionItem[]>(() => {
  const currentEditor = renderedEditor.value
  const target = blockMenuActionTarget.value
  const canMoveUpValue = Boolean(currentEditor && target && !target.isVirtualTitle && canMoveUp(currentEditor, target))
  const canMoveDownValue = Boolean(currentEditor && target && !target.isVirtualTitle && canMoveDown(currentEditor, target))
  const base: BlockMenuActionItem[] = [
    { id: 'insert_above', actionId: 'insert_above', label: 'Insert above', disabled: !target },
    { id: 'insert_below', actionId: 'insert_below', label: 'Insert below', disabled: !target },
    { id: 'move_up', actionId: 'move_up', label: 'Move up', disabled: !canMoveUpValue },
    { id: 'move_down', actionId: 'move_down', label: 'Move down', disabled: !canMoveDownValue },
    { id: 'duplicate', actionId: 'duplicate', label: 'Duplicate', disabled: !target },
    { id: 'copy_anchor', actionId: 'copy_anchor', label: 'Copy anchor', disabled: !canCopyAnchor(target) },
    { id: 'delete', actionId: 'delete', label: 'Delete', disabled: !target?.canDelete },
  ]
  return base
})
const blockMenuConvertActions = computed<BlockMenuActionItem[]>(() => {
  const target = blockMenuActionTarget.value
  return TURN_INTO_TYPES.map((turnIntoType) => ({
    id: `turn_into:${turnIntoType}`,
    actionId: 'turn_into' as const,
    turnIntoType,
    label: TURN_INTO_LABELS[turnIntoType],
    disabled: !canTurnInto(target, turnIntoType),
  }))
})
const { editorZoomStyle, initFromStorage: initEditorZoomFromStorage, zoomBy: zoomEditorBy, resetZoom: resetEditorZoom, getZoom } = useEditorZoom()
const { mermaidReplaceDialog, resolveMermaidReplaceDialog, requestMermaidReplaceConfirm } = useMermaidReplaceDialog()

function getSession(path: string) {
  return sessionStore.getSession(path)
}

function ensureSession(path: string) {
  return sessionStore.ensureSession(path)
}

function emitStatus(path: string) {
  const session = getSession(path)
  if (!session) return
  emit('status', {
    path,
    dirty: session.dirty,
    saving: session.saving,
    saveError: session.saveError
  })
}

function setDirty(path: string, dirty: boolean) {
  const session = getSession(path)
  if (!session) return
  session.dirty = dirty
  emitStatus(path)
}

function setSaving(path: string, saving: boolean) {
  const session = getSession(path)
  if (!session) return
  session.saving = saving
  emitStatus(path)
}

function setSaveError(path: string, message: string) {
  const session = getSession(path)
  if (!session) return
  session.saveError = message
  emitStatus(path)
}

function clearAutosaveTimer(path: string) {
  const session = getSession(path)
  if (!session || !session.autosaveTimer) return
  clearTimeout(session.autosaveTimer)
  session.autosaveTimer = null
}

function countLines(input: string): number {
  if (!input) return 0
  return input.replace(/\r\n?/g, '\n').split('\n').length
}

async function flushUiFrame() {
  await nextTick()
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

function scheduleAutosave(path: string) {
  const session = getSession(path)
  if (!session) return
  clearAutosaveTimer(path)
  session.autosaveTimer = setTimeout(() => {
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
  const session = getSession(path)
  if (!session) return
  const snapshot = toPersistedTextSelection(editor.state.selection)
  session.caret = { kind: 'pm-selection', from: snapshot.from, to: snapshot.to }
}

function restoreCaret(path: string) {
  if (!editor || !path) return false
  const snapshot = getSession(path)?.caret
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

function clearOutlineTimer(path: string) {
  const session = getSession(path)
  if (!session || !session.outlineTimer) return
  clearTimeout(session.outlineTimer)
  session.outlineTimer = null
}

function emitOutlineSoon(path: string) {
  const session = getSession(path)
  if (!session) return
  clearOutlineTimer(path)
  session.outlineTimer = setTimeout(() => {
    if (currentPath.value !== path) return
    emit('outline', parseOutlineFromDoc())
  }, 120)
}

function closeSlashMenu() {
  slashOpen.value = false
  slashIndex.value = 0
  slashQuery.value = ''
}

function markSlashActivatedByUser() {
  slashActivatedByUser.value = true
}

function closeWikilinkMenu() {
  wikilinkOpen.value = false
  wikilinkIndex.value = 0
  wikilinkResults.value = []
  wikilinkEditingRange.value = null
}

function closeBlockMenu(unlock = true) {
  const wasOpen = blockMenuOpen.value || blockMenuIndex.value !== 0 || dragHandleUiState.value.menuOpen
  if (!wasOpen) return
  blockMenuOpen.value = false
  blockMenuIndex.value = 0
  dragHandleUiState.value = { ...dragHandleUiState.value, menuOpen: false }
  if (unlock) {
    syncDragHandleLockFromState('close-menu')
  }
}

function onBlockHandleNodeChange(payload: { pos: number; node: { type: { name: string }; attrs?: Record<string, unknown>; textContent?: string; nodeSize: number } | null }) {
  if (!payload.node) return
  const nodeAtPos = editor?.state.doc.nodeAt(payload.pos)
  if (!nodeAtPos) return
  const nextTarget = toBlockMenuTarget(nodeAtPos, payload.pos)
  blockMenuTarget.value = nextTarget
  lastStableBlockMenuTarget.value = nextTarget
  dragHandleUiState.value = {
    ...dragHandleUiState.value,
    activeTarget: nextTarget,
  }
  debugDragHandle('target-change', nextTarget.pos)
}

function toggleBlockMenu(event: MouseEvent) {
  const handleRoot = (event.currentTarget instanceof HTMLElement)
    ? event.currentTarget.closest('.meditor-drag-handle')
    : null
  if (handleRoot?.getAttribute('data-dragging') === 'true') {
    dragHandleUiState.value = { ...dragHandleUiState.value, dragging: true }
    syncDragHandleLockFromState('drag-guard')
    return
  }
  event.preventDefault()
  event.stopPropagation()
  if (!editor) return
  const target = resolveActiveTarget(dragHandleUiState.value.activeTarget, lastStableBlockMenuTarget.value)
  if (!target) return
  blockMenuTarget.value = target

  if (blockMenuOpen.value) {
    closeBlockMenu()
    return
  }

  if (event.currentTarget instanceof HTMLElement) {
    const rect = event.currentTarget.getBoundingClientRect()
    const estimatedWidth = 260
    const estimatedHeight = 360
    const maxX = Math.max(12, window.innerWidth - estimatedWidth - 12)
    const maxY = Math.max(12, window.innerHeight - estimatedHeight - 12)
    blockMenuPos.value = {
      x: Math.max(12, Math.min(rect.right + 8, maxX)),
      y: Math.max(12, Math.min(rect.top, maxY)),
    }
  }

  closeSlashMenu()
  closeWikilinkMenu()
  blockMenuOpen.value = true
  dragHandleUiState.value = { ...dragHandleUiState.value, menuOpen: true }
  blockMenuIndex.value = 0
  syncDragHandleLockFromState('open-menu')
}

function onBlockMenuPlus(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (!editor) return
  const target = resolveActiveTarget(dragHandleUiState.value.activeTarget, lastStableBlockMenuTarget.value)
  if (!target) return
  blockMenuTarget.value = target
  closeSlashMenu()
  closeWikilinkMenu()
  insertBelow(editor, target)
  openSlashAtSelection('')
}

function copyAnchorTarget(target: BlockMenuTarget) {
  if (!target.text.trim()) return
  const text = `[[#${target.text.trim()}]]`
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text)
  }
}

function onBlockMenuSelect(item: BlockMenuActionItem) {
  if (!editor || item.disabled) return
  const target = resolveActiveTarget(dragHandleUiState.value.activeTarget, lastStableBlockMenuTarget.value)
  if (!target) return
  blockMenuTarget.value = target
  if (item.actionId === 'insert_above') insertAbove(editor, target)
  if (item.actionId === 'insert_below') insertBelow(editor, target)
  if (item.actionId === 'move_up') moveNodeUp(editor, target)
  if (item.actionId === 'move_down') moveNodeDown(editor, target)
  if (item.actionId === 'duplicate') duplicateNode(editor, target)
  if (item.actionId === 'delete') deleteNode(editor, target)
  if (item.actionId === 'copy_anchor' && canCopyAnchor(target)) copyAnchorTarget(target)
  if (item.actionId === 'turn_into' && item.turnIntoType) turnInto(editor, target, item.turnIntoType)
  closeBlockMenu()
}

function onTableToolbarSelect(actionId: TableActionId) {
  if (!editor) return
  applyTableAction(editor, actionId)
  updateTableToolbar()
}

function toggleTableToolbar(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (!tableToolbarTriggerVisible.value) return
  const opening = !tableToolbarOpen.value
  if (opening) updateTableToolbar()
  tableToolbarOpen.value = opening
}

function addRowAfterFromTrigger(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (!editor || !tableToolbarTriggerVisible.value) return
  editor.chain().focus().addRowAfter().run()
  updateTableToolbar()
}

function addRowBeforeFromTrigger(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (!editor || !tableToolbarTriggerVisible.value) return
  editor.chain().focus().addRowBefore().run()
  updateTableToolbar()
}

function addColumnBeforeFromTrigger(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (!editor || !tableToolbarTriggerVisible.value) return
  editor.chain().focus().addColumnBefore().run()
  updateTableToolbar()
}

function addColumnAfterFromTrigger(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (!editor || !tableToolbarTriggerVisible.value) return
  editor.chain().focus().addColumnAfter().run()
  updateTableToolbar()
}

function onDocumentMouseDown(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Node)) return
  const handleRoot = target instanceof Element ? target.closest('.meditor-block-controls') : null

  if (blockMenuOpen.value) {
    if (blockMenuFloatingEl.value?.contains(target)) return
    if (handleRoot) return
    closeBlockMenu()
  }

  if (tableToolbarOpen.value) {
    if (tableToolbarFloatingEl.value?.contains(target)) return
    if (target instanceof Element && target.closest('.meditor-table-control')) return
    hideTableToolbar()
  }
}

function updateGutterHitboxStyle() {
  if (!holder.value || !contentShell.value) return
  const holderRect = holder.value.getBoundingClientRect()
  const shellRect = contentShell.value.getBoundingClientRect()
  const shellStyle = window.getComputedStyle(contentShell.value)
  const shellPaddingLeft = Number.parseFloat(shellStyle.paddingLeft || '0') || 0
  const textStart = shellRect.left + shellPaddingLeft
  const width = Math.max(48, textStart - holderRect.left + 8)
  gutterHitboxStyle.value = {
    position: 'absolute',
    top: '0',
    left: '0px',
    bottom: '0',
    width: `${width}px`,
  }
}

function onHolderScroll() {
  updateGutterHitboxStyle()
  updateTableToolbar()
}

function debugDragHandle(event: string, detail?: unknown) {
  if (!DRAG_HANDLE_DEBUG) return
  // eslint-disable-next-line no-console
  console.info('[drag-handle]', event, detail ?? '', dragHandleUiState.value)
}

function syncDragHandleLockFromState(reason: string) {
  if (!editor) return
  const shouldLock = computeHandleLock(dragHandleUiState.value)
  if (lastAppliedDragHandleLock === shouldLock) return
  lastAppliedDragHandleLock = shouldLock
  editor.commands.setMeta('lockDragHandle', shouldLock)
  debugDragHandle(`sync-lock:${reason}`, shouldLock)
}

function onHandleControlsEnter() {
  if (dragHandleUiState.value.controlsHover) return
  dragHandleUiState.value = { ...dragHandleUiState.value, controlsHover: true }
  syncDragHandleLockFromState('controls-enter')
}

function onHandleControlsLeave() {
  if (!dragHandleUiState.value.controlsHover) return
  dragHandleUiState.value = { ...dragHandleUiState.value, controlsHover: false }
  syncDragHandleLockFromState('controls-leave')
}

function onHandleDragStart() {
  if (dragHandleUiState.value.dragging) return
  dragHandleUiState.value = { ...dragHandleUiState.value, dragging: true }
  syncDragHandleLockFromState('drag-start')
}

function onHandleDragEnd() {
  if (!dragHandleUiState.value.dragging) return
  dragHandleUiState.value = { ...dragHandleUiState.value, dragging: false }
  syncDragHandleLockFromState('drag-end')
}

function updateFormattingToolbar() {
  inlineFormatToolbar.updateFormattingToolbar()
}

function hideTableToolbar() {
  tableToolbarOpen.value = false
}

function hideTableToolbarAnchor() {
  if (tableHoverHideTimer) {
    clearTimeout(tableHoverHideTimer)
    tableHoverHideTimer = null
  }
  hideTableToolbar()
  tableToolbarHovering.value = false
  tableToolbarTriggerVisible.value = false
  tableAddTopVisible.value = false
  tableAddBottomVisible.value = false
  tableAddLeftVisible.value = false
  tableAddRightVisible.value = false
  tableEdgeTopSeenAt = 0
  tableEdgeBottomSeenAt = 0
  tableEdgeLeftSeenAt = 0
  tableEdgeRightSeenAt = 0
  tableToolbarActions.value = []
}

function activeTableElement(): HTMLElement | null {
  if (!editor) return null
  const domAt = editor.view.domAtPos(editor.state.selection.$from.pos)
  const baseEl = domAt.node instanceof Element ? domAt.node : domAt.node.parentElement
  return baseEl?.closest('table') as HTMLElement | null
}

function activeTableCellElement(): HTMLElement | null {
  if (!editor) return null
  const domAt = editor.view.domAtPos(editor.state.selection.$from.pos)
  const baseEl = domAt.node instanceof Element ? domAt.node : domAt.node.parentElement
  return baseEl?.closest('td,th') as HTMLElement | null
}

function updateTableToolbarPosition(cellEl: HTMLElement, tableEl: HTMLElement) {
  if (!holder.value) return
  const holderRect = holder.value.getBoundingClientRect()
  const cellRect = cellEl.getBoundingClientRect()
  const tableRect = tableEl.getBoundingClientRect()
  const holderScrollLeft = holder.value.scrollLeft
  const holderScrollTop = holder.value.scrollTop
  const cellTop = cellRect.top - holderRect.top + holderScrollTop
  const cellRight = cellRect.right - holderRect.left + holderScrollLeft
  const tableTop = tableRect.top - holderRect.top + holderScrollTop
  const tableLeft = tableRect.left - holderRect.left + holderScrollLeft
  const tableWidth = tableRect.width
  const tableHeight = tableRect.height

  tableMenuBtnLeft.value = Math.max(6, cellRight - 28)
  tableMenuBtnTop.value = Math.max(6, cellTop + 6)
  tableBoxLeft.value = Math.max(6, tableLeft)
  tableBoxTop.value = Math.max(6, tableTop)
  tableBoxWidth.value = Math.max(0, tableWidth)
  tableBoxHeight.value = Math.max(0, tableHeight)

  tableToolbarLeft.value = tableMenuBtnLeft.value + 24
  tableToolbarTop.value = Math.max(6, tableMenuBtnTop.value - 4)

  const menuWidth = 320
  const viewportPadding = 8
  const minMenuHeight = 160
  const preferredMenuHeight = Math.max(220, Math.floor(window.innerHeight * 0.72))
  const rawViewportLeft = holderRect.left + tableToolbarLeft.value
  const rawViewportTop = holderRect.top + tableToolbarTop.value
  const availableBelow = Math.max(0, Math.floor(window.innerHeight - rawViewportTop - viewportPadding))
  const availableAbove = Math.max(0, Math.floor(rawViewportTop - viewportPadding))

  let clampedTop = rawViewportTop
  let maxHeight = Math.max(minMenuHeight, Math.min(preferredMenuHeight, availableBelow))
  if (availableBelow < 220 && availableAbove > availableBelow) {
    maxHeight = Math.max(minMenuHeight, Math.min(preferredMenuHeight, availableAbove))
    clampedTop = rawViewportTop - maxHeight
  }

  clampedTop = Math.max(viewportPadding, clampedTop)
  const overflowBottom = clampedTop + maxHeight - (window.innerHeight - viewportPadding)
  if (overflowBottom > 0) {
    clampedTop = Math.max(viewportPadding, clampedTop - overflowBottom)
  }

  const clampedLeft = Math.max(viewportPadding, Math.min(rawViewportLeft, window.innerWidth - menuWidth - viewportPadding))
  tableToolbarViewportLeft.value = clampedLeft
  tableToolbarViewportTop.value = clampedTop
  tableToolbarViewportMaxHeight.value = maxHeight
}

function readTableCommandCapabilities(currentEditor: Editor): TableCommandCapabilities {
  const canRun = (command: (chain: ReturnType<ReturnType<Editor['can']>['chain']>) => ReturnType<ReturnType<Editor['can']>['chain']>) =>
    command(currentEditor.can().chain().focus()).run()
  return {
    addRowBefore: canRun((chain) => chain.addRowBefore()),
    addRowAfter: canRun((chain) => chain.addRowAfter()),
    deleteRow: canRun((chain) => chain.deleteRow()),
    addColumnBefore: canRun((chain) => chain.addColumnBefore()),
    addColumnAfter: canRun((chain) => chain.addColumnAfter()),
    deleteColumn: canRun((chain) => chain.deleteColumn()),
    toggleHeaderRow: canRun((chain) => chain.toggleHeaderRow()),
    toggleHeaderColumn: canRun((chain) => chain.toggleHeaderColumn()),
    toggleHeaderCell: canRun((chain) => chain.toggleHeaderCell()),
    deleteTable: canRun((chain) => chain.deleteTable())
  }
}

function updateTableToolbar() {
  if (!editor || !holder.value) {
    hideTableToolbarAnchor()
    return
  }
  if (!editor.isActive('table')) {
    hideTableToolbarAnchor()
    return
  }

  tableToolbarActions.value = buildTableToolbarActions(readTableCommandCapabilities(editor))
  const tableEl = activeTableElement()
  const cellEl = activeTableCellElement()
  if (!tableEl || !cellEl) {
    hideTableToolbarAnchor()
    return
  }
  tableToolbarTriggerVisible.value = true
  updateTableToolbarPosition(cellEl, tableEl)
}

function onEditorMouseMove(event: MouseEvent) {
  if (tableHoverHideTimer) {
    clearTimeout(tableHoverHideTimer)
    tableHoverHideTimer = null
  }
  if (!editor?.isActive('table')) {
    tableToolbarHovering.value = false
    tableAddTopVisible.value = false
    tableAddBottomVisible.value = false
    tableAddLeftVisible.value = false
    tableAddRightVisible.value = false
    tableEdgeTopSeenAt = 0
    tableEdgeBottomSeenAt = 0
    tableEdgeLeftSeenAt = 0
    tableEdgeRightSeenAt = 0
    return
  }
  const target = event.target
  if (!(target instanceof Element)) return
  const tableEl = activeTableElement()
  if (!tableEl) return
  const rect = tableEl.getBoundingClientRect()
  const x = event.clientX
  const y = event.clientY
  const now = performance.now()
  const topThreshold = tableAddTopVisible.value ? TABLE_EDGE_STICKY_THRESHOLD : TABLE_EDGE_SHOW_THRESHOLD
  const bottomThreshold = tableAddBottomVisible.value ? TABLE_EDGE_STICKY_THRESHOLD : TABLE_EDGE_SHOW_THRESHOLD
  const leftThreshold = tableAddLeftVisible.value ? TABLE_EDGE_STICKY_THRESHOLD : TABLE_EDGE_SHOW_THRESHOLD
  const rightThreshold = tableAddRightVisible.value ? TABLE_EDGE_STICKY_THRESHOLD : TABLE_EDGE_SHOW_THRESHOLD
  const inVerticalBand = y >= rect.top - 24 && y <= rect.bottom + 24
  const inHorizontalBand = x >= rect.left - 24 && x <= rect.right + 24
  const nearLeft = Math.abs(x - rect.left) <= leftThreshold && inVerticalBand
  const nearRight = Math.abs(x - rect.right) <= rightThreshold && inVerticalBand
  const nearTop = Math.abs(y - rect.top) <= topThreshold && inHorizontalBand
  const nearBottom = Math.abs(y - rect.bottom) <= bottomThreshold && inHorizontalBand
  if (nearTop) tableEdgeTopSeenAt = now
  if (nearBottom) tableEdgeBottomSeenAt = now
  if (nearLeft) tableEdgeLeftSeenAt = now
  if (nearRight) tableEdgeRightSeenAt = now
  const stickyTop = now - tableEdgeTopSeenAt <= TABLE_EDGE_STICKY_MS
  const stickyBottom = now - tableEdgeBottomSeenAt <= TABLE_EDGE_STICKY_MS
  const stickyLeft = now - tableEdgeLeftSeenAt <= TABLE_EDGE_STICKY_MS
  const stickyRight = now - tableEdgeRightSeenAt <= TABLE_EDGE_STICKY_MS
  const inToolbar = Boolean(tableToolbarFloatingEl.value?.contains(target))
  const inControls = Boolean(target.closest('.meditor-table-control'))
  const inTable = Boolean(target.closest('.ProseMirror table'))
  tableAddTopVisible.value = nearTop || stickyTop || inControls || tableToolbarOpen.value
  tableAddBottomVisible.value = nearBottom || stickyBottom || inControls || tableToolbarOpen.value
  tableAddLeftVisible.value = nearLeft || stickyLeft || inControls || tableToolbarOpen.value
  tableAddRightVisible.value = nearRight || stickyRight || inControls || tableToolbarOpen.value
  tableToolbarHovering.value = inTable || inToolbar || inControls || tableToolbarOpen.value
}

function onEditorMouseLeave() {
  if (tableToolbarOpen.value) return
  if (tableHoverHideTimer) clearTimeout(tableHoverHideTimer)
  tableHoverHideTimer = setTimeout(() => {
    tableToolbarHovering.value = false
    tableAddTopVisible.value = false
    tableAddBottomVisible.value = false
    tableAddLeftVisible.value = false
    tableAddRightVisible.value = false
    tableEdgeTopSeenAt = 0
    tableEdgeBottomSeenAt = 0
    tableEdgeLeftSeenAt = 0
    tableEdgeRightSeenAt = 0
    tableHoverHideTimer = null
  }, 120)
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
    scheduleAutosave(path)
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

watch(editorZoomStyle, () => {
  void nextTick().then(() => updateGutterHitboxStyle())
}, { deep: true })

function onEditorDocChanged(path: string) {
  if (suppressOnChange || !path) return
  setDirty(path, true)
  setSaveError(path, '')
  scheduleAutosave(path)
  emitOutlineSoon(path)
}

function createEditorOptions(path: string) {
  return {
    autofocus: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        codeBlock: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        link: false
      }),
      Link.configure({
        openOnClick: false
      }),
      HeadingMeta,
      ListKit.configure({
        taskItem: {
          nested: true
        }
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
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
      handleKeyDown: () => {
        markSlashActivatedByUser()
        return false
      },
      handleClick: (_view: ProseMirrorEditorView, _pos: number, event: MouseEvent) => {
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
              const targetEditor = getSession(path)?.editor ?? editor
              if (!targetEditor) continue
              const range = enterWikilinkEditFromNode(targetEditor, candidate)
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
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault()
          event.stopPropagation()
          const targetEditor = getSession(path)?.editor ?? editor
          if (!targetEditor) return true

          let pos = 0
          try {
            pos = _view.posAtDOM(anchor, 0)
          } catch {
            pos = 0
          }

          const candidates = [_pos, _pos + 1, _pos - 1, pos, pos + 1, pos - 1]
          for (const candidate of candidates) {
            if (candidate < 0 || candidate > _view.state.doc.content.size) continue
            targetEditor.chain().focus().setTextSelection(candidate).extendMarkRange('link').run()
            const { from, to, empty } = targetEditor.state.selection
            if (empty || from === to || !targetEditor.isActive('link')) continue
            inlineFormatToolbar.updateFormattingToolbar()
            inlineFormatToolbar.openLinkPopover()
            return true
          }
          return true
        }
        event.preventDefault()
        event.stopPropagation()
        void openExternalUrl(safe)
        return true
      }
    },
    onUpdate: () => {
      if (currentPath.value !== path) return
      syncSlashMenuFromSelection({ preserveIndex: true })
      updateTableToolbar()
      syncWikilinkUiFromPluginState()
    },
    onSelectionUpdate: () => {
      if (currentPath.value !== path) return
      const activePath = currentPath.value
      if (activePath) captureCaret(activePath)
      syncSlashMenuFromSelection({ preserveIndex: true })
      updateFormattingToolbar()
      updateTableToolbar()
      syncWikilinkUiFromPluginState()
    },
    onTransaction: (payload: { transaction: Transaction }) => {
      const { transaction } = payload
      if (transaction.docChanged) {
        onEditorDocChanged(path)
      }
      if (currentPath.value !== path) return
      updateTableToolbar()
      syncWikilinkUiFromPluginState()
    }
  }
}

function createSessionEditor(path: string): Editor {
  return new Editor({
    content: '',
    element: document.createElement('div'),
    ...createEditorOptions(path)
  })
}

function resetTransientUiState() {
  slashActivatedByUser.value = false
  closeSlashMenu()
  closeWikilinkMenu()
  closeBlockMenu()
  blockMenuTarget.value = null
  lastStableBlockMenuTarget.value = null
  dragHandleUiState.value = { ...dragHandleUiState.value, activeTarget: null }
  inlineFormatToolbar.dismissToolbar()
  hideTableToolbarAnchor()
  cachedLinkTargetsAt.value = 0
  cachedHeadingsByTarget.value = {}
  cachedHeadingsAt.value = {}
}

function setActiveSession(path: string) {
  sessionStore.setActivePath(MAIN_PANE_ID, path)
  const session = getSession(path)
  editor = session?.editor ?? null
  lastAppliedDragHandleLock = null
}

async function loadCurrentFile(path: string, options?: { forceReload?: boolean; requestId?: number; skipActivate?: boolean }) {
  if (!path) return
  await ensurePropertySchemaLoaded()
  if (typeof options?.requestId === 'number' && options.requestId !== pathLoadToken) return
  const session = ensureSession(path)
  if (!options?.skipActivate) {
    setActiveSession(path)
  }
  if (typeof options?.requestId === 'number' && options.requestId !== pathLoadToken) return
  if (!editor) return

  setSaveError(path, '')
  clearAutosaveTimer(path)
  clearOutlineTimer(path)
  resetTransientUiState()
  isLoadingLargeDocument.value = false
  loadStageLabel.value = ''
  loadProgressPercent.value = 0
  loadProgressIndeterminate.value = false
  loadDocumentStats.value = null

  try {
    if (!session.isLoaded || options?.forceReload) {
      const txt = await props.openFile(path)
      if (typeof options?.requestId === 'number' && options.requestId !== pathLoadToken) return
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
      session.editor.commands.setContent(toTiptapDoc(normalized), { emitUpdate: false })
      suppressOnChange = false

      session.loadedText = txt
      session.isLoaded = true
      setDirty(path, false)
    }

    await nextTick()
    if (typeof options?.requestId === 'number' && options.requestId !== pathLoadToken) return
    if (currentPath.value !== path) return
    const remembered = session.scrollTop
    if (holder.value && typeof remembered === 'number') {
      holder.value.scrollTop = remembered
    }
    if (!restoreCaret(path)) {
      editor.commands.focus('end')
    }

    emitOutlineSoon(path)
    syncWikilinkUiFromPluginState()
    updateGutterHitboxStyle()
  } catch (error) {
    setSaveError(path, error instanceof Error ? error.message : 'Could not read file.')
  } finally {
    if (typeof options?.requestId === 'number' && options.requestId !== pathLoadToken) return
    isLoadingLargeDocument.value = false
    loadStageLabel.value = ''
    loadProgressPercent.value = 0
    loadProgressIndeterminate.value = false
    loadDocumentStats.value = null
  }
}

async function saveCurrentFile(manual = true) {
  const initialPath = currentPath.value
  const initialSession = getSession(initialPath)
  if (!initialPath || !editor || !initialSession || initialSession.saving) return

  let savePath = initialPath
  setSaving(savePath, true)
  if (manual) setSaveError(savePath, '')

  try {
    const rawBlocks = serializeCurrentDocBlocks()
    const requestedTitle = readVirtualTitle(rawBlocks) || blockTextCandidate(rawBlocks[0]) || noteTitleFromPath(initialPath)
    const lastLoaded = initialSession.loadedText

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
      sessionStore.renamePath(initialPath, savePath)
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

    const savedSession = getSession(savePath)
    if (savedSession) {
      savedSession.loadedText = markdown
      savedSession.isLoaded = true
    }

    parseAndStoreFrontmatter(savePath, markdown)
    setDirty(savePath, false)
  } catch (error) {
    setSaveError(savePath, error instanceof Error ? error.message : 'Could not save file.')
  } finally {
    setSaving(savePath, false)
    emitOutlineSoon(savePath)
  }
}

function openSlashAtSelection(query = '', options?: { preserveIndex?: boolean }) {
  if (!editor || !holder.value) return
  closeBlockMenu()
  const pos = editor.state.selection.from
  const rect = editor.view.coordsAtPos(pos)
  let left = rect.left
  let top = rect.bottom + 8

  const estimatedWidth = 240
  const estimatedHeight = 360
  const maxX = Math.max(12, window.innerWidth - estimatedWidth - 12)
  const maxY = Math.max(12, window.innerHeight - estimatedHeight - 12)

  left = Math.max(12, Math.min(left, maxX))
  top = Math.max(12, Math.min(top, maxY))

  slashLeft.value = left
  slashTop.value = top
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

function syncSlashMenuFromSelection(options?: { preserveIndex?: boolean }) {
  const slash = readSlashContext()
  if (slash && slashActivatedByUser.value) {
    openSlashAtSelection(slash.query, { preserveIndex: options?.preserveIndex ?? true })
  } else {
    closeSlashMenu()
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
  if (blockMenuOpen.value || dragHandleUiState.value.menuOpen) {
    closeBlockMenu()
  }
  wikilinkIndex.value = state.selectedIndex
  wikilinkEditingRange.value = state.editingRange
  wikilinkResults.value = state.candidates.map((candidate) => ({
    id: `${candidate.isCreate ? 'create' : 'existing'}:${candidate.target}`,
    label: candidate.label ?? candidate.target,
    target: candidate.target,
    isCreate: Boolean(candidate.isCreate)
  }))

  const anchorPos = Math.max(
    state.editingRange.from + 2,
    Math.min(editor.state.selection.from, state.editingRange.to - 1)
  )
  const rect = editor.view.coordsAtPos(anchorPos)
  let left = rect.left
  let top = rect.bottom + 8

  const estimatedWidth = 320
  const estimatedHeight = 280
  const maxX = Math.max(12, window.innerWidth - estimatedWidth - 12)
  const maxY = Math.max(12, window.innerHeight - estimatedHeight - 12)

  left = Math.max(12, Math.min(left, maxX))
  top = Math.max(12, Math.min(top, maxY))

  wikilinkLeft.value = left
  wikilinkTop.value = top
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
  const session = path ? getSession(path) : null
  if (path && session?.dirty) {
    clearAutosaveTimer(path)
    await saveCurrentFile(false)
    if (getSession(path)?.dirty) return
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
      event.stopPropagation()
      if (!visibleSlashCommands.value.length) return
      slashIndex.value = (slashIndex.value + 1) % visibleSlashCommands.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      if (!visibleSlashCommands.value.length) return
      slashIndex.value = (slashIndex.value - 1 + visibleSlashCommands.value.length) % visibleSlashCommands.value.length
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const command = visibleSlashCommands.value[slashIndex.value]
      if (!command) return
      closeSlashMenu()
      insertBlockFromDescriptor(command.type, command.data)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeSlashMenu()
      return
    }
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

  if (event.key === 'Escape' && blockMenuOpen.value) {
    event.preventDefault()
    closeBlockMenu()
    return
  }

  if (event.key === 'Escape' && inlineFormatToolbar.linkPopoverOpen.value) {
    event.preventDefault()
    inlineFormatToolbar.cancelLink()
    return
  }

  if (event.key === 'Escape' && tableToolbarOpen.value) {
    event.preventDefault()
    hideTableToolbar()
  }
}

function onEditorKeyup() {
  const path = currentPath.value
  if (path) captureCaret(path)
  syncSlashMenuFromSelection({ preserveIndex: true })
  updateFormattingToolbar()
  updateTableToolbar()
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
      const prevSession = getSession(prev)
      if (prevSession) prevSession.scrollTop = holder.value.scrollTop
    }

    const nextPath = next?.trim()
    if (!nextPath) {
      pathLoadToken += 1
      const activePath = sessionStore.getActivePath(MAIN_PANE_ID)
      if (activePath) {
        captureCaret(activePath)
        if (holder.value) {
          const activeSession = getSession(activePath)
          if (activeSession) activeSession.scrollTop = holder.value.scrollTop
        }
      }
      sessionStore.setActivePath(MAIN_PANE_ID, '')
      editor = null
      resetPropertySchemaState()
      emit('properties', { path: '', items: [], parseErrorCount: 0 })
      closeSlashMenu()
      closeWikilinkMenu()
      closeBlockMenu()
      hideTableToolbarAnchor()
      emit('outline', [])
      return
    }

    const requestId = ++pathLoadToken
    ensureSession(nextPath)
    setActiveSession(nextPath)
    await nextTick()
    await loadCurrentFile(nextPath, { requestId, skipActivate: true })
  }
)

watch(
  () => props.openPaths ?? [],
  (nextOpenPaths) => {
    const keep = new Set(nextOpenPaths.map((path) => path.trim()).filter(Boolean))
    const activePath = sessionStore.getActivePath(MAIN_PANE_ID) || currentPath.value
    for (const sessionPath of sessionStore.listPaths()) {
      if (sessionPath === activePath) continue
      if (!keep.has(sessionPath)) {
        sessionStore.closePath(sessionPath)
      }
    }
  },
  { deep: true }
)

onMounted(async () => {
  initEditorZoomFromStorage()

  if (currentPath.value) {
    const requestId = ++pathLoadToken
    ensureSession(currentPath.value)
    setActiveSession(currentPath.value)
    await loadCurrentFile(currentPath.value, { requestId, skipActivate: true })
  }

  holder.value?.addEventListener('keydown', onEditorKeydown, true)
  holder.value?.addEventListener('keyup', onEditorKeyup, true)
  holder.value?.addEventListener('contextmenu', onEditorContextMenu, true)
  holder.value?.addEventListener('paste', onEditorPaste, true)
  holder.value?.addEventListener('scroll', onHolderScroll, true)
  window.addEventListener('resize', updateGutterHitboxStyle)
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  updateGutterHitboxStyle()
  document.addEventListener('mousedown', onDocumentMouseDown, true)
})

onBeforeUnmount(async () => {
  if (tableHoverHideTimer) {
    clearTimeout(tableHoverHideTimer)
    tableHoverHideTimer = null
  }
  if (mermaidReplaceDialog.value.resolve) {
    mermaidReplaceDialog.value.resolve(false)
  }
  holder.value?.removeEventListener('keydown', onEditorKeydown, true)
  holder.value?.removeEventListener('keyup', onEditorKeyup, true)
  holder.value?.removeEventListener('contextmenu', onEditorContextMenu, true)
  holder.value?.removeEventListener('paste', onEditorPaste, true)
  holder.value?.removeEventListener('scroll', onHolderScroll, true)
  window.removeEventListener('resize', updateGutterHitboxStyle)
  document.removeEventListener('mousedown', onDocumentMouseDown, true)
  sessionStore.closeAll()
  editor = null
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
    const requestId = ++pathLoadToken
    ensureSession(currentPath.value)
    setActiveSession(currentPath.value)
    await loadCurrentFile(currentPath.value, { forceReload: true, requestId, skipActivate: true })
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

      <div
        class="relative min-h-0 flex-1 overflow-hidden"
        :data-drag-lock="computedDragLock ? 'true' : 'false'"
        :data-menu-open="dragHandleUiState.menuOpen ? 'true' : 'false'"
        :data-gutter-hover="dragHandleUiState.gutterHover ? 'true' : 'false'"
        :data-controls-hover="dragHandleUiState.controlsHover ? 'true' : 'false'"
        :data-target-pos="debugTargetPos"
      >
        <div
          v-if="DRAG_HANDLE_DEBUG"
          class="pointer-events-none absolute right-2 top-2 z-50 rounded bg-slate-900/80 px-2 py-1 text-[11px] text-white"
        >
          lock={{ computedDragLock }} menu={{ dragHandleUiState.menuOpen }} gutter={{ dragHandleUiState.gutterHover }} controls={{ dragHandleUiState.controlsHover }} drag={{ dragHandleUiState.dragging }} target={{ debugTargetPos }}
        </div>
        <div
          class="editor-gutter-hitbox"
          :style="gutterHitboxStyle"
        />
        <div
          ref="holder"
          class="editor-holder relative h-full min-h-0 overflow-y-auto px-8 py-6"
          :style="editorZoomStyle"
          @mousemove="onEditorMouseMove"
          @mouseleave="onEditorMouseLeave"
          @click="closeSlashMenu(); closeWikilinkMenu(); closeBlockMenu()"
        >
          <div ref="contentShell" class="editor-content-shell">
            <EditorContent
              v-if="renderedEditor"
              :key="`editor-content:${currentPath}`"
              :editor="renderedEditor"
            />
          </div>
          <DragHandleVue3
            v-if="renderedEditor"
            :key="`editor-drag:${currentPath}`"
            :editor="renderedEditor"
            :plugin-key="DRAG_HANDLE_PLUGIN_KEY"
            :compute-position-config="{ placement: 'left-start' }"
            class="meditor-drag-handle"
            :nested="true"
            :on-node-change="onBlockHandleNodeChange"
            :on-element-drag-start="onHandleDragStart"
            :on-element-drag-end="onHandleDragEnd"
          >
            <div class="meditor-block-controls" @mouseenter="onHandleControlsEnter" @mouseleave="onHandleControlsLeave">
              <button
                type="button"
                class="meditor-block-control-btn"
                aria-label="Insert below"
                @mousedown.stop
                @click.stop.prevent="onBlockMenuPlus"
              >
                +
              </button>
              <button
                type="button"
                class="meditor-block-control-btn meditor-block-grip-btn"
                aria-label="Open block menu"
                @mousedown.stop
                @click.stop.prevent="toggleBlockMenu"
              >
                ⋮⋮
              </button>
            </div>
          </DragHandleVue3>

          <EditorInlineFormatToolbar
            :open="inlineFormatToolbar.formatToolbarOpen.value"
            :left="inlineFormatToolbar.formatToolbarLeft.value"
            :top="inlineFormatToolbar.formatToolbarTop.value"
            :active-marks="{
              bold: inlineFormatToolbar.isMarkActive('bold'),
              italic: inlineFormatToolbar.isMarkActive('italic'),
              strike: inlineFormatToolbar.isMarkActive('strike'),
              underline: inlineFormatToolbar.isMarkActive('underline'),
              code: inlineFormatToolbar.isMarkActive('code'),
              link: inlineFormatToolbar.isMarkActive('link')
            }"
            :link-popover-open="inlineFormatToolbar.linkPopoverOpen.value"
            :link-value="inlineFormatToolbar.linkValue.value"
            :link-error="inlineFormatToolbar.linkError.value"
            @toggle-mark="inlineFormatToolbar.toggleMark"
            @open-link="inlineFormatToolbar.openLinkPopover"
            @apply-link="inlineFormatToolbar.applyLink"
            @unlink="inlineFormatToolbar.unlinkLink"
            @cancel-link="inlineFormatToolbar.cancelLink"
            @update:linkValue="(value) => { inlineFormatToolbar.linkValue.value = value }"
          />

          <div
            v-if="tableToolbarTriggerVisible"
            class="meditor-table-trigger absolute z-30 meditor-table-control"
            :class="{ 'is-visible': true }"
            :style="{ left: `${tableMenuBtnLeft}px`, top: `${tableMenuBtnTop}px` }"
          >
            <button
              type="button"
              class="meditor-table-trigger-btn"
              aria-label="Open table actions"
              @mousedown.prevent
              @click.stop="toggleTableToolbar"
            >
              ⋮
            </button>
          </div>

          <div
            v-if="tableToolbarTriggerVisible"
            class="meditor-table-edge meditor-table-edge-top absolute z-30 meditor-table-control"
            :class="{ 'is-visible': tableAddTopVisible }"
            :style="{ left: `${tableBoxLeft}px`, top: `${tableBoxTop - 20}px`, width: `${tableBoxWidth}px` }"
          >
            <button
              type="button"
              class="meditor-table-trigger-btn meditor-table-plus-btn"
              aria-label="Add row above"
              @mousedown.prevent
              @click.stop="addRowBeforeFromTrigger"
            >
              +
            </button>
          </div>

          <div
            v-if="tableToolbarTriggerVisible"
            class="meditor-table-edge meditor-table-edge-bottom absolute z-30 meditor-table-control"
            :class="{ 'is-visible': tableAddBottomVisible }"
            :style="{ left: `${tableBoxLeft}px`, top: `${tableBoxTop + tableBoxHeight}px`, width: `${tableBoxWidth}px` }"
          >
            <button
              type="button"
              class="meditor-table-trigger-btn meditor-table-plus-btn"
              aria-label="Add row below"
              @mousedown.prevent
              @click.stop="addRowAfterFromTrigger"
            >
              +
            </button>
          </div>

          <div
            v-if="tableToolbarTriggerVisible"
            class="meditor-table-edge meditor-table-edge-left absolute z-30 meditor-table-control"
            :class="{ 'is-visible': tableAddLeftVisible }"
            :style="{ left: `${tableBoxLeft - 20}px`, top: `${tableBoxTop}px`, height: `${tableBoxHeight}px` }"
          >
            <button
              type="button"
              class="meditor-table-trigger-btn meditor-table-plus-btn"
              aria-label="Add column left"
              @mousedown.prevent
              @click.stop="addColumnBeforeFromTrigger"
            >
              +
            </button>
          </div>

          <div
            v-if="tableToolbarTriggerVisible"
            class="meditor-table-edge meditor-table-edge-right absolute z-30 meditor-table-control"
            :class="{ 'is-visible': tableAddRightVisible }"
            :style="{ left: `${tableBoxLeft + tableBoxWidth}px`, top: `${tableBoxTop}px`, height: `${tableBoxHeight}px` }"
          >
            <button
              type="button"
              class="meditor-table-trigger-btn meditor-table-plus-btn"
              aria-label="Add column right"
              @mousedown.prevent
              @click.stop="addColumnAfterFromTrigger"
            >
              +
            </button>
          </div>

          <Teleport to="body">
            <div :style="{ position: 'fixed', left: `${slashLeft}px`, top: `${slashTop}px`, zIndex: 50 }">
              <EditorSlashMenu
                :open="slashOpen"
                :index="slashIndex"
                :left="0"
                :top="0"
                :commands="visibleSlashCommands"
                @update:index="slashIndex = $event"
                @select="closeSlashMenu(); insertBlockFromDescriptor($event.type, $event.data)"
              />
            </div>

            <div :style="{ position: 'fixed', left: `${wikilinkLeft}px`, top: `${wikilinkTop}px`, zIndex: 50 }">
              <EditorWikilinkMenu
                :open="wikilinkOpen"
                :index="wikilinkIndex"
                :left="0"
                :top="0"
                :results="wikilinkResults"
                @menu-el="() => {}"
                @update:index="onWikilinkMenuIndexUpdate($event)"
                @select="onWikilinkMenuSelect($event)"
              />
            </div>

            <div :style="{ position: 'fixed', left: `${blockMenuPos.x}px`, top: `${blockMenuPos.y}px`, zIndex: 50 }">
              <EditorBlockMenu
              :open="blockMenuOpen"
              :index="blockMenuIndex"
              :actions="blockMenuActions"
              :convert-actions="blockMenuConvertActions"
              @menu-el="blockMenuFloatingEl = $event"
              @update:index="blockMenuIndex = $event"
              @select="onBlockMenuSelect($event)"
                @close="closeBlockMenu()"
              />
            </div>

            <div :style="{ position: 'fixed', left: `${tableToolbarViewportLeft}px`, top: `${tableToolbarViewportTop}px`, zIndex: 52 }">
              <EditorTableToolbar
                :open="tableToolbarOpen"
                :actions="tableToolbarActions"
                :markdown-mode="TABLE_MARKDOWN_MODE"
                :max-height-px="tableToolbarViewportMaxHeight"
                @menu-el="tableToolbarFloatingEl = $event"
                @select="onTableToolbarSelect($event)"
                @close="hideTableToolbar()"
              />
            </div>

          </Teleport>
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

.editor-content-shell {
  max-width: 880px;
  margin: 0 auto;
  padding-left: 2.5rem;
}

.editor-gutter-hitbox {
  min-width: 36px;
  z-index: 1;
  pointer-events: none;
  background: transparent;
}

.editor-holder :deep(.ProseMirror > *),
.editor-holder :deep(.ProseMirror li) {
  position: relative;
}

.editor-holder :deep(.ProseMirror > *::after),
.editor-holder :deep(.ProseMirror li::after) {
  content: '';
  position: absolute;
  left: -5rem;
  width: 5rem;
  top: -0.25rem;
  bottom: -0.25rem;
  pointer-events: auto;
}

@media (max-width: 840px) {
  .editor-content-shell {
    max-width: 100%;
    padding-left: 0.5rem;
  }
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
  align-items: flex-start;
  gap: 0.45rem;
}

.editor-holder :deep(.ProseMirror ul[data-type="taskList"] li > label) {
  margin-top: 0;
  display: inline-flex;
  align-items: center;
  padding-top: 0.15rem;
}

.editor-holder :deep(.ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]) {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: rgb(37 99 235);
  cursor: pointer;
}

.editor-holder :deep(.ProseMirror ul[data-type="taskList"] li > div > p) {
  margin: 0;
  min-height: 1.2em;
  outline: 1px solid transparent;
}

.editor-holder :deep(.ProseMirror table) {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 0.8rem 0;
  border: 1px solid rgb(203 213 225);
  border-radius: 0.65rem;
  overflow: hidden;
  background: rgb(255 255 255 / 0.98);
  font-size: calc(0.92rem * var(--editor-zoom, 1));
  line-height: 1.45;
  table-layout: fixed;
}

.editor-holder :deep(.ProseMirror th),
.editor-holder :deep(.ProseMirror td) {
  border-right: 1px solid rgb(226 232 240);
  border-bottom: 1px solid rgb(226 232 240);
  padding: 0.5rem 0.62rem;
  vertical-align: top;
  position: relative;
  min-width: 4rem;
  transition: background-color 120ms ease;
}

.editor-holder :deep(.ProseMirror tr:last-child > th),
.editor-holder :deep(.ProseMirror tr:last-child > td) {
  border-bottom: none;
}

.editor-holder :deep(.ProseMirror tr > th:last-child),
.editor-holder :deep(.ProseMirror tr > td:last-child) {
  border-right: none;
}

.editor-holder :deep(.ProseMirror tbody tr:hover td) {
  background: rgb(248 250 252);
}

.editor-holder :deep(.ProseMirror th) {
  font-weight: 640;
  background: rgb(248 250 252);
  color: rgb(30 41 59);
}

.editor-holder :deep(.ProseMirror td.selectedCell),
.editor-holder :deep(.ProseMirror th.selectedCell) {
  background: rgb(219 234 254);
}

.editor-holder :deep(.ProseMirror .column-resize-handle) {
  position: absolute;
  right: -2px;
  top: 0;
  width: 4px;
  height: 100%;
  background: rgb(59 130 246 / 0.55);
  pointer-events: none;
}

.editor-holder :deep(.ProseMirror.resize-cursor) {
  cursor: col-resize;
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

.editor-holder :deep(.meditor-drag-handle) {
  z-index: 35;
}

.editor-holder :deep(.meditor-block-controls) {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.12rem;
  padding-right: 0.8rem;
  line-height: 1;
}

.editor-holder :deep(.meditor-block-control-btn) {
  width: 1.7rem;
  height: 1.7rem;
  border: 1px solid rgb(203 213 225);
  border-radius: 0.4rem;
  background: white;
  color: rgb(71 85 105);
  font-size: 0.95rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.editor-holder :deep(.meditor-block-control-btn:hover) {
  background: rgb(241 245 249);
}

.editor-holder :deep(.meditor-block-grip-btn) {
  letter-spacing: -0.1rem;
}

.meditor-table-trigger {
  display: flex;
  align-items: center;
  gap: 0.28rem;
  transition: transform 120ms ease;
  transform: translateY(0);
}

.meditor-table-trigger.is-visible {
  opacity: 0.92;
  pointer-events: auto;
  transform: translateY(0);
}

.meditor-table-edge {
  display: flex;
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease;
}

.meditor-table-edge-top,
.meditor-table-edge-bottom {
  align-items: center;
  justify-content: center;
  height: 20px;
}

.meditor-table-edge-left,
.meditor-table-edge-right {
  align-items: center;
  justify-content: center;
  width: 20px;
}

.meditor-table-edge.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.meditor-table-plus-btn {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 0.34rem;
  background: transparent;
  color: rgb(71 85 105);
  font-size: 0.95rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease, background-color 120ms ease;
}

.meditor-table-edge.is-visible .meditor-table-plus-btn {
  opacity: 0.92;
  pointer-events: auto;
}

.meditor-table-edge.is-visible .meditor-table-plus-btn:hover {
  background: rgb(248 250 252 / 0.7);
}

.meditor-table-trigger-btn {
  width: 1.38rem;
  height: 1.38rem;
  border: 1px solid rgb(203 213 225);
  border-radius: 0.38rem;
  background: rgb(255 255 255 / 0.92);
  color: rgb(71 85 105);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  letter-spacing: -0.08rem;
  font-size: 0.82rem;
  line-height: 1;
}

.meditor-table-trigger-btn:focus-visible {
  outline: 2px solid rgb(96 165 250 / 0.55);
  outline-offset: 1px;
}

.meditor-table-trigger-btn:hover {
  background: rgb(248 250 252);
}

.dark .editor-holder :deep(.meditor-block-control-btn) {
  border-color: rgb(71 85 105);
  background: rgb(15 23 42);
  color: rgb(203 213 225);
}

.dark .editor-holder :deep(.meditor-block-control-btn:hover) {
  background: rgb(30 41 59);
}

.dark .meditor-table-trigger-btn {
  border-color: rgb(71 85 105);
  background: rgb(30 41 59 / 0.96);
  color: rgb(226 232 240);
  box-shadow: 0 0 0 1px rgb(15 23 42 / 0.35);
}

.dark .meditor-table-trigger-btn:hover {
  background: rgb(30 41 59 / 0.92);
}

.dark .meditor-table-edge.is-visible .meditor-table-plus-btn {
  color: rgb(226 232 240);
}

.dark .meditor-table-edge.is-visible .meditor-table-plus-btn:hover {
  background: rgb(30 41 59 / 0.55);
}

.dark .meditor-table-trigger-btn:focus-visible {
  outline: 2px solid rgb(147 197 253 / 0.65);
}

.dark .editor-holder :deep(.ProseMirror th),
.dark .editor-holder :deep(.ProseMirror td) {
  border-color: rgb(51 65 85);
}

.dark .editor-holder :deep(.ProseMirror table) {
  border-color: rgb(71 85 105);
  background: rgb(15 23 42);
}

.dark .editor-holder :deep(.ProseMirror th) {
  background: rgb(30 41 59 / 0.85);
  color: rgb(226 232 240);
}

.dark .editor-holder :deep(.ProseMirror tbody tr:hover td) {
  background: rgb(30 41 59 / 0.45);
}

.dark .editor-holder :deep(.ProseMirror td.selectedCell),
.dark .editor-holder :deep(.ProseMirror th.selectedCell) {
  background: rgb(30 64 175 / 0.45);
}

.dark .editor-holder :deep(.ProseMirror .column-resize-handle) {
  background: rgb(96 165 250 / 0.65);
}
</style>
