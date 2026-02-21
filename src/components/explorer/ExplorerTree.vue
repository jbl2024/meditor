<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ExplorerContextMenu, { type MenuAction } from './ExplorerContextMenu.vue'
import ExplorerItem from './ExplorerItem.vue'
import { useSelectionManager } from './composables/useSelectionManager'
import {
  copyEntry,
  createEntry,
  duplicateEntry,
  listChildren,
  moveEntry,
  openPathExternal,
  renameEntry,
  revealInFileManager,
  trashEntry,
  type ConflictStrategy,
  type EntryKind,
  type TreeNode
} from '../../lib/api'
import UiButton from '../ui/UiButton.vue'

const props = defineProps<{
  folderPath: string
  activePath?: string
}>()

const emit = defineEmits<{
  open: [path: string]
  select: [paths: string[]]
  error: [message: string]
}>()

type VisibleRow =
  | { kind: 'node'; path: string; depth: number }
  | { kind: 'create'; key: string; parentPath: string; depth: number; entryKind: EntryKind }

const treeRoot = computed(() => props.folderPath)
const childrenByDir = ref<Record<string, TreeNode[]>>({})
const nodeByPath = ref<Record<string, TreeNode>>({})
const parentByPath = ref<Record<string, string>>({})
const expandedPaths = ref<Set<string>>(new Set())
const loadingDirs = ref<Set<string>>(new Set())
const focusedPath = ref<string>('')
const treeRef = ref<HTMLElement | null>(null)

const contextMenu = ref<{ x: number; y: number; targetPath: string | null } | null>(null)
const editingPath = ref<string>('')
const editingValue = ref('')
const creating = ref<{ parentPath: string; entryKind: EntryKind; value: string } | null>(null)

const conflictPrompt = ref<{
  title: string
  detail: string
  pending: ((strategy: ConflictStrategy) => Promise<void>) | null
} | null>(null)

const confirmPrompt = ref<{
  title: string
  detail: string
  intent: 'delete' | 'move_folders'
  payload: string[]
} | null>(null)

const clipboard = ref<{ mode: 'copy' | 'cut'; paths: string[] } | null>(null)

const selectionManager = useSelectionManager()

const isMac = navigator.platform.toLowerCase().includes('mac')

const selectionPaths = computed(() => selectionManager.selectedPaths.value)
const canPaste = computed(() => Boolean(clipboard.value?.paths.length && props.folderPath))

const visibleRows = computed<VisibleRow[]>(() => {
  const rows: VisibleRow[] = []
  const root = treeRoot.value
  if (!root) return rows

  const pushDir = (dirPath: string, depth: number) => {
    const children = childrenByDir.value[dirPath] ?? []

    if (creating.value && creating.value.parentPath === dirPath) {
      rows.push({
        kind: 'create',
        key: `create-${dirPath}-${creating.value.entryKind}`,
        parentPath: dirPath,
        depth,
        entryKind: creating.value.entryKind
      })
    }

    for (const child of children) {
      rows.push({ kind: 'node', path: child.path, depth })
      if (child.is_dir && expandedPaths.value.has(child.path)) {
        pushDir(child.path, depth + 1)
      }
    }
  }

  pushDir(root, 0)
  return rows
})

const visibleNodePaths = computed(() =>
  visibleRows.value.filter((row): row is { kind: 'node'; path: string; depth: number } => row.kind === 'node').map((row) => row.path)
)

function emitError(message: string) {
  emit('error', message)
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function getParentPath(path: string): string {
  const normalized = normalizePath(path)
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return path
  return normalized.slice(0, idx)
}

function getAncestorDirs(path: string): string[] {
  const root = normalizePath(props.folderPath)
  const target = normalizePath(path)
  if (!root || !target || target === root || !target.startsWith(`${root}/`)) return []

  const relative = target.slice(root.length + 1)
  const segments = relative.split('/').slice(0, -1)
  const dirs: string[] = []

  let current = root
  for (const segment of segments) {
    current = `${current}/${segment}`
    dirs.push(current)
  }
  return dirs
}

function isConflictError(err: unknown): boolean {
  return err instanceof Error && /already exists/i.test(err.message)
}

function persistExpandedState() {
  if (!props.folderPath) return
  const key = `meditor.explorer.expanded.${props.folderPath}`
  window.localStorage.setItem(key, JSON.stringify(Array.from(expandedPaths.value)))
}

function loadExpandedState() {
  if (!props.folderPath) return
  const key = `meditor.explorer.expanded.${props.folderPath}`
  const raw = window.localStorage.getItem(key)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw) as string[]
    expandedPaths.value = new Set(parsed)
  } catch {
    expandedPaths.value = new Set()
  }
}

async function loadChildren(dirPath: string) {
  if (!props.folderPath) return
  if (loadingDirs.value.has(dirPath)) return

  const nextLoading = new Set(loadingDirs.value)
  nextLoading.add(dirPath)
  loadingDirs.value = nextLoading

  try {
    const children = await listChildren(props.folderPath, dirPath)
    childrenByDir.value[dirPath] = children

    for (const child of children) {
      nodeByPath.value[child.path] = child
      parentByPath.value[child.path] = dirPath
    }
  } finally {
    const done = new Set(loadingDirs.value)
    done.delete(dirPath)
    loadingDirs.value = done
  }
}

async function refreshLoadedDirs() {
  if (!props.folderPath) return

  const dirs = new Set<string>([props.folderPath, ...Object.keys(childrenByDir.value)])
  for (const dir of dirs) {
    try {
      await loadChildren(dir)
    } catch {
      // Skip transient refresh errors.
    }
  }
}

function currentContextTarget(): string | null {
  return contextMenu.value?.targetPath ?? null
}

function effectiveSelection(targetPath?: string | null): string[] {
  const selected = selectionPaths.value
  if (targetPath && selected.includes(targetPath)) {
    return selected
  }
  if (targetPath) {
    return [targetPath]
  }
  return selected
}

function openContextMenuAt(x: number, y: number, targetPath: string | null) {
  contextMenu.value = {
    x,
    y,
    targetPath
  }
}

function openContextMenu(event: MouseEvent, targetPath: string | null) {
  openContextMenuAt(event.clientX + 2, event.clientY + 2, targetPath)
}

function closeContextMenu() {
  contextMenu.value = null
}

function beginCreate(parentPath: string, entryKind: EntryKind) {
  creating.value = {
    parentPath,
    entryKind,
    value: entryKind === 'file' ? 'untitled.md' : 'new-folder'
  }
}

function cancelCreate() {
  creating.value = null
}

async function resolveConflictAndRetry(
  title: string,
  detail: string,
  action: (strategy: ConflictStrategy) => Promise<void>
) {
  conflictPrompt.value = {
    title,
    detail,
    pending: action
  }
}

async function runWithConflictModal(
  action: (strategy: ConflictStrategy) => Promise<void>,
  title: string,
  detail: string
) {
  try {
    await action('fail')
  } catch (err) {
    if (isConflictError(err)) {
      await resolveConflictAndRetry(title, detail, action)
      return
    }
    emitError(err instanceof Error ? err.message : 'Operation failed.')
  }
}

async function confirmCreate() {
  if (!creating.value || !props.folderPath) return

  const name = creating.value.value.trim()
  if (!name) {
    emitError('Name cannot be empty.')
    return
  }

  const payload = creating.value

  await runWithConflictModal(
    async (strategy) => {
      const created = await createEntry(
        props.folderPath,
        payload.parentPath,
        name,
        payload.entryKind,
        strategy
      )
      cancelCreate()
      await loadChildren(payload.parentPath)
      if (payload.entryKind === 'file' && /\.(md|markdown)$/i.test(created)) {
        emit('open', created)
      }
    },
    'File or folder already exists',
    'Choose how to proceed.'
  )
}

function startRename(path: string) {
  const node = nodeByPath.value[path]
  if (!node) return
  editingPath.value = path
  editingValue.value = node.name
}

function cancelRename() {
  editingPath.value = ''
  editingValue.value = ''
}

async function confirmRename() {
  const path = editingPath.value
  if (!path || !props.folderPath) return

  const newName = editingValue.value.trim()
  if (!newName) {
    emitError('Name cannot be empty.')
    return
  }

  await runWithConflictModal(
    async (strategy) => {
      const renamedPath = await renameEntry(props.folderPath, path, newName, strategy)
      const parent = getParentPath(path)
      cancelRename()
      await loadChildren(parent)

      if (selectionManager.isSelected(path)) {
        selectionManager.setSelection([renamedPath])
      }
      if (focusedPath.value === path) {
        focusedPath.value = renamedPath
      }
      emit('select', selectionManager.selectedPaths.value)
    },
    'File or folder already exists',
    'Choose how to proceed.'
  )
}

function requestDelete(paths: string[]) {
  if (!paths.length) return

  const folderCount = paths.filter((path) => nodeByPath.value[path]?.is_dir).length
  const base = paths.length === 1 ? `Delete "${nodeByPath.value[paths[0]]?.name || 'item'}"?` : `Delete ${paths.length} items?`
  const detail =
    folderCount > 0
      ? 'Some selected items are folders. Deletion moves them to trash recursively.'
      : 'Selected items will be moved to trash.'

  confirmPrompt.value = {
    title: base,
    detail,
    intent: 'delete',
    payload: paths
  }
}

async function executeDelete(paths: string[]) {
  if (!props.folderPath || !paths.length) return

  for (const path of paths) {
    try {
      await trashEntry(props.folderPath, path)
    } catch (err) {
      emitError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  selectionManager.clearSelection()
  focusedPath.value = ''
  emit('select', [])
  await refreshLoadedDirs()
}

async function runDuplicate(paths: string[]) {
  if (!props.folderPath || !paths.length) return

  await runWithConflictModal(
    async (strategy) => {
      for (const path of paths) {
        await duplicateEntry(props.folderPath, path, strategy)
      }
      await refreshLoadedDirs()
    },
    'Name conflict while duplicating',
    'Choose how to handle conflicts.'
  )
}

function setClipboard(mode: 'copy' | 'cut', paths: string[]) {
  if (!paths.length) return
  clipboard.value = { mode, paths }
}

async function runPaste(targetPath?: string | null) {
  if (!props.folderPath || !clipboard.value) return

  const target = targetPath || focusedPath.value || props.folderPath
  const targetNode = nodeByPath.value[target]
  const targetDir = targetNode?.is_dir ? target : getParentPath(target)

  const sourcePaths = clipboard.value.paths
  if (!sourcePaths.length) return

  const hasFolderMove = clipboard.value.mode === 'cut' && sourcePaths.some((path) => nodeByPath.value[path]?.is_dir)
  if (hasFolderMove) {
    confirmPrompt.value = {
      title: 'Move selected folders?',
      detail: 'Moving folders can affect many files. Confirm this operation.',
      intent: 'move_folders',
      payload: sourcePaths
    }
    return
  }

  await executePaste(targetDir, sourcePaths)
}

async function executePaste(targetDir: string, pathsOverride?: string[]) {
  if (!props.folderPath || !clipboard.value) return

  const sources = pathsOverride ?? clipboard.value.paths
  const mode = clipboard.value.mode

  await runWithConflictModal(
    async (strategy) => {
      for (const source of sources) {
        if (mode === 'copy') {
          await copyEntry(props.folderPath, source, targetDir, strategy)
        } else {
          await moveEntry(props.folderPath, source, targetDir, strategy)
        }
      }

      if (mode === 'cut') {
        clipboard.value = null
      }
      await refreshLoadedDirs()
    },
    'Name conflict while pasting',
    'Choose how to handle conflicts.'
  )
}

async function openSelected(paths: string[]) {
  if (!paths.length) return
  const first = nodeByPath.value[paths[0]]
  if (!first || first.is_dir) return
  if (first.is_markdown) {
    emit('open', first.path)
  } else {
    await openPathExternal(first.path)
  }
}

function handleRowClick(event: MouseEvent, node: TreeNode) {
  const ordered = visibleNodePaths.value
  const isToggle = isMac ? event.metaKey : event.ctrlKey

  if (event.shiftKey) {
    selectionManager.selectRange(node.path, ordered)
  } else if (isToggle) {
    selectionManager.toggleSelection(node.path)
  } else {
    selectionManager.selectSingle(node.path)
  }

  focusedPath.value = node.path
  emit('select', selectionManager.selectedPaths.value)

  if (!node.is_dir && node.is_markdown && !event.shiftKey && !isToggle) {
    emit('open', node.path)
  }
}

function handleDoubleClick(node: TreeNode) {
  if (node.is_dir) {
    toggleExpand(node.path)
    return
  }
  if (node.is_markdown) {
    emit('open', node.path)
  } else {
    void openPathExternal(node.path)
  }
}

async function toggleExpand(path: string) {
  const expanded = new Set(expandedPaths.value)
  if (expanded.has(path)) {
    expanded.delete(path)
  } else {
    expanded.add(path)
    await loadChildren(path)
  }
  expandedPaths.value = expanded
  persistExpandedState()
}

function onRowAction(payload: { event: MouseEvent; node: TreeNode }) {
  const target = payload.event.currentTarget as HTMLElement | null
  if (target) {
    const rect = target.getBoundingClientRect()
    openContextMenuAt(rect.right + 6, rect.bottom + 6, payload.node.path)
    return
  }

  openContextMenu(payload.event, payload.node.path)
}

function onNodeContextMenu(payload: { event: MouseEvent; node: TreeNode }) {
  openContextMenu(payload.event, payload.node.path)
}

function onTreeContextMenu(event: MouseEvent) {
  openContextMenu(event, null)
}

function clearSelectionIfBackground(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    selectionManager.clearSelection()
    emit('select', [])
  }
}

function focusTree() {
  treeRef.value?.focus()
}

async function onContextAction(action: MenuAction) {
  const targetPath = currentContextTarget()
  const targetNode = targetPath ? nodeByPath.value[targetPath] : null
  const selection = effectiveSelection(targetPath)

  if (action === 'new-file' || action === 'new-folder') {
    const parent = targetNode?.is_dir ? targetNode.path : targetPath ? getParentPath(targetPath) : props.folderPath
    beginCreate(parent || props.folderPath, action === 'new-file' ? 'file' : 'folder')
    closeContextMenu()
    return
  }

  if (action === 'open') {
    await openSelected(selection)
  }

  if (action === 'open-external' && targetPath) {
    await openPathExternal(targetPath)
  }

  if (action === 'reveal' && targetPath) {
    await revealInFileManager(targetPath)
  }

  if (action === 'rename' && targetPath) {
    startRename(targetPath)
  }

  if (action === 'delete') {
    requestDelete(selection)
  }

  if (action === 'duplicate') {
    await runDuplicate(selection)
  }

  if (action === 'copy') {
    setClipboard('copy', selection)
  }

  if (action === 'cut') {
    setClipboard('cut', selection)
  }

  if (action === 'paste') {
    await runPaste(targetPath)
  }

  closeContextMenu()
}

function ensureFocusedPath(defaultToFirst = true) {
  if (focusedPath.value && visibleNodePaths.value.includes(focusedPath.value)) {
    return focusedPath.value
  }

  if (defaultToFirst && visibleNodePaths.value.length) {
    focusedPath.value = visibleNodePaths.value[0]
    return focusedPath.value
  }

  return ''
}

async function onTreeKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target) {
    const tag = target.tagName.toLowerCase()
    const isTextInput = tag === 'input' || tag === 'textarea'
    const isEditable = target.isContentEditable
    if (isTextInput || isEditable) {
      return
    }
  }

  const ordered = visibleNodePaths.value
  if (!ordered.length) return

  const focused = ensureFocusedPath()
  if (!focused) return

  const currentIndex = ordered.indexOf(focused)
  const key = event.key
  const ctrlOrMeta = isMac ? event.metaKey : event.ctrlKey

  if (key === 'ArrowDown') {
    event.preventDefault()
    const next = ordered[Math.min(currentIndex + 1, ordered.length - 1)]
    if (!next) return
    if (event.shiftKey) {
      selectionManager.selectRange(next, ordered)
    } else {
      selectionManager.selectSingle(next)
    }
    focusedPath.value = next
    emit('select', selectionManager.selectedPaths.value)
    return
  }

  if (key === 'ArrowUp') {
    event.preventDefault()
    const prev = ordered[Math.max(currentIndex - 1, 0)]
    if (!prev) return
    if (event.shiftKey) {
      selectionManager.selectRange(prev, ordered)
    } else {
      selectionManager.selectSingle(prev)
    }
    focusedPath.value = prev
    emit('select', selectionManager.selectedPaths.value)
    return
  }

  const focusedNode = nodeByPath.value[focused]
  if (!focusedNode) return

  if (key === 'ArrowRight') {
    event.preventDefault()
    if (focusedNode.is_dir) {
      if (!expandedPaths.value.has(focusedNode.path)) {
        await toggleExpand(focusedNode.path)
      } else {
        const children = childrenByDir.value[focusedNode.path] ?? []
        const firstChild = children[0]
        if (firstChild) {
          selectionManager.selectSingle(firstChild.path)
          focusedPath.value = firstChild.path
          emit('select', selectionManager.selectedPaths.value)
        }
      }
    }
    return
  }

  if (key === 'ArrowLeft') {
    event.preventDefault()
    if (focusedNode.is_dir && expandedPaths.value.has(focusedNode.path)) {
      await toggleExpand(focusedNode.path)
      return
    }

    const parent = parentByPath.value[focusedNode.path]
    if (parent && parent !== props.folderPath) {
      selectionManager.selectSingle(parent)
      focusedPath.value = parent
      emit('select', selectionManager.selectedPaths.value)
    }
    return
  }

  if (key === 'Enter') {
    event.preventDefault()
    if (focusedNode.is_dir) {
      await toggleExpand(focusedNode.path)
    } else {
      if (focusedNode.is_markdown) {
        emit('open', focusedNode.path)
      } else {
        await openPathExternal(focusedNode.path)
      }
    }
    return
  }

  if (key === 'F2') {
    event.preventDefault()
    if (selectionPaths.value.length === 1) {
      startRename(selectionPaths.value[0])
    }
    return
  }

  if (key === 'Delete') {
    event.preventDefault()
    if (selectionPaths.value.length) {
      requestDelete(selectionPaths.value)
    }
    return
  }

  if (ctrlOrMeta && key.toLowerCase() === 'c') {
    event.preventDefault()
    setClipboard('copy', selectionPaths.value)
    return
  }

  if (ctrlOrMeta && key.toLowerCase() === 'x') {
    event.preventDefault()
    setClipboard('cut', selectionPaths.value)
    return
  }

  if (ctrlOrMeta && key.toLowerCase() === 'v') {
    event.preventDefault()
    await runPaste()
    return
  }

  if (ctrlOrMeta && key.toLowerCase() === 'n') {
    event.preventDefault()
    beginCreate(props.folderPath, event.shiftKey ? 'folder' : 'file')
    return
  }

  if (ctrlOrMeta && key.toLowerCase() === 'a') {
    event.preventDefault()
    const parent = parentByPath.value[focused] || props.folderPath
    const siblings = childrenByDir.value[parent] ?? []
    selectionManager.setSelection(siblings.map((node) => node.path))
    emit('select', selectionManager.selectedPaths.value)
  }
}

async function initializeExplorer() {
  if (!props.folderPath) {
    childrenByDir.value = {}
    nodeByPath.value = {}
    parentByPath.value = {}
    expandedPaths.value = new Set()
    selectionManager.clearSelection()
    focusedPath.value = ''
    return
  }

  loadExpandedState()
  await loadChildren(props.folderPath)

  const expanded = Array.from(expandedPaths.value)
  for (const dirPath of expanded) {
    if (dirPath !== props.folderPath) {
      try {
        await loadChildren(dirPath)
      } catch {
        // Ignore stale expanded folders.
      }
    }
  }

  if (!selectionPaths.value.length && visibleNodePaths.value.length) {
    selectionManager.selectSingle(visibleNodePaths.value[0])
    focusedPath.value = visibleNodePaths.value[0]
    emit('select', selectionManager.selectedPaths.value)
  }
}

async function revealPath(path: string) {
  if (!path || !props.folderPath) return
  const ancestors = getAncestorDirs(path)
  for (const dir of ancestors) {
    if (!expandedPaths.value.has(dir)) {
      expandedPaths.value = new Set(expandedPaths.value).add(dir)
      await loadChildren(dir)
    }
  }
  persistExpandedState()
  focusedPath.value = path
}

let refreshTimer: number | null = null

function startExternalRefresh() {
  stopExternalRefresh()
  refreshTimer = window.setInterval(() => {
    void refreshLoadedDirs()
  }, 2000)
}

function stopExternalRefresh() {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function closeConflictPrompt() {
  conflictPrompt.value = null
}

async function resolveConflict(strategy: ConflictStrategy) {
  if (!conflictPrompt.value?.pending) {
    closeConflictPrompt()
    return
  }

  const pending = conflictPrompt.value.pending
  closeConflictPrompt()

  try {
    await pending(strategy)
  } catch (err) {
    emitError(err instanceof Error ? err.message : 'Operation failed.')
  }
}

function cancelConfirmPrompt() {
  confirmPrompt.value = null
}

async function confirmPromptAction() {
  if (!confirmPrompt.value) return
  const prompt = confirmPrompt.value
  confirmPrompt.value = null

  if (prompt.intent === 'delete') {
    await executeDelete(prompt.payload)
    return
  }

  if (prompt.intent === 'move_folders') {
    const target = currentContextTarget() || focusedPath.value || props.folderPath
    const targetNode = nodeByPath.value[target]
    const targetDir = targetNode?.is_dir ? target : getParentPath(target)
    await executePaste(targetDir, prompt.payload)
  }
}

watch(
  () => props.folderPath,
  async () => {
    await initializeExplorer()
    if (props.folderPath) {
      startExternalRefresh()
    } else {
      stopExternalRefresh()
    }
  },
  { immediate: true }
)

watch(
  () => props.activePath,
  async (next) => {
    if (!next || !props.folderPath) return
    await revealPath(next)
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('click', closeContextMenu)
  focusTree()
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeContextMenu)
  stopExternalRefresh()
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
      <UiButton size="sm" :disabled="!folderPath" @click="beginCreate(folderPath, 'file')">New file</UiButton>
      <UiButton size="sm" :disabled="!folderPath" @click="beginCreate(folderPath, 'folder')">New folder</UiButton>
      <UiButton size="sm" variant="ghost" :disabled="!folderPath" @click="refreshLoadedDirs">Refresh</UiButton>
    </div>

    <div
      ref="treeRef"
      tabindex="0"
      class="min-h-[220px] rounded-md border border-slate-200 bg-white p-2 outline-none focus-visible:ring-1 focus-visible:ring-slate-500 dark:border-slate-800 dark:bg-slate-950"
      @keydown="onTreeKeydown"
      @contextmenu.prevent="onTreeContextMenu"
      @click="clearSelectionIfBackground"
    >
      <p v-if="!folderPath" class="px-2 py-1 text-xs text-slate-500 dark:text-slate-500">Select a working folder to start.</p>
      <p v-else-if="!visibleRows.length" class="px-2 py-1 text-xs text-slate-500 dark:text-slate-500">No files or folders. Use New file or New folder.</p>

      <template v-else>
        <template v-for="row in visibleRows" :key="row.kind === 'node' ? row.path : row.key">
          <ExplorerItem
            v-if="row.kind === 'node'"
            :node="nodeByPath[row.path]"
            :depth="row.depth"
            :expanded="expandedPaths.has(row.path)"
            :selected="selectionManager.isSelected(row.path)"
            :active="activePath === row.path"
            :focused="focusedPath === row.path"
            :cut-pending="Boolean(clipboard?.mode === 'cut' && clipboard.paths.includes(row.path))"
            :editing="editingPath === row.path"
            :rename-value="editingValue"
            @toggle="toggleExpand"
            @click="handleRowClick"
            @doubleclick="handleDoubleClick"
            @contextmenu="onNodeContextMenu"
            @rowaction="onRowAction"
            @rename-update="editingValue = $event"
            @rename-confirm="confirmRename"
            @rename-cancel="cancelRename"
          />

          <div
            v-else
            class="py-1"
            :style="{ paddingLeft: `${row.depth * 14 + 24}px` }"
          >
            <input
              v-if="creating"
              v-model="creating.value"
              class="h-7 w-full rounded-lg border border-slate-300/90 bg-white/95 px-2 text-xs text-slate-900 outline-none focus:border-[#003153]/70 focus:ring-2 focus:ring-[#003153]/20 dark:border-slate-600/70 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:border-[#4a6f95]/70 dark:focus:ring-[#4a6f95]/30"
              @keydown.enter.stop.prevent="confirmCreate"
              @keydown.esc.stop.prevent="cancelCreate"
              @blur="confirmCreate"
            />
          </div>
        </template>
      </template>
    </div>

    <ExplorerContextMenu
      v-if="contextMenu"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :can-open="Boolean(contextMenu.targetPath)"
      :can-paste="canPaste"
      :can-rename="Boolean(contextMenu.targetPath)"
      :can-delete="Boolean(contextMenu.targetPath)"
      @action="onContextAction"
    />

    <div v-if="conflictPrompt" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div class="w-full max-w-sm rounded-2xl border border-slate-300/80 bg-white p-4 shadow-xl dark:border-slate-700/80 dark:bg-slate-900">
        <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ conflictPrompt.title }}</h3>
        <p class="mt-1 text-xs text-slate-600 dark:text-slate-400">{{ conflictPrompt.detail }}</p>
        <div class="mt-4 flex flex-wrap justify-end gap-2">
          <UiButton size="sm" variant="ghost" @click="closeConflictPrompt">Cancel</UiButton>
          <UiButton size="sm" @click="resolveConflict('rename')">Keep both</UiButton>
          <UiButton size="sm" variant="primary" @click="resolveConflict('overwrite')">Replace</UiButton>
        </div>
      </div>
    </div>

    <div v-if="confirmPrompt" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div class="w-full max-w-sm rounded-2xl border border-slate-300/80 bg-white p-4 shadow-xl dark:border-slate-700/80 dark:bg-slate-900">
        <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ confirmPrompt.title }}</h3>
        <p class="mt-1 text-xs text-slate-600 dark:text-slate-400">{{ confirmPrompt.detail }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <UiButton size="sm" variant="ghost" @click="cancelConfirmPrompt">Cancel</UiButton>
          <UiButton size="sm" variant="primary" @click="confirmPromptAction">Confirm</UiButton>
        </div>
      </div>
    </div>
  </div>
</template>
