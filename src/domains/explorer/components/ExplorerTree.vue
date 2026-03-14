<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { EntryKind, TreeNode } from '../../../shared/api/apiTypes'
import { listenWorkspaceFsChanged, openPathExternal } from '../../../shared/api/workspaceApi'
import ExplorerConfirmDialog from './ExplorerConfirmDialog.vue'
import ExplorerConflictDialog from './ExplorerConflictDialog.vue'
import ExplorerContextMenu, { type MenuAction } from './ExplorerContextMenu.vue'
import ExplorerItem from './ExplorerItem.vue'
import ExplorerToolbar from './ExplorerToolbar.vue'
import { useSelectionManager } from './composables/useSelectionManager'
import { useExplorerFsSync } from '../composables/useExplorerFsSync'
import { useExplorerKeyboard } from '../composables/useExplorerKeyboard'
import { useExplorerOperations } from '../composables/useExplorerOperations'
import { useExplorerTreeState } from '../composables/useExplorerTreeState'

const props = defineProps<{
  folderPath: string
  activePath?: string
  contextPaths?: string[]
  rowActionMode?: 'menu' | 'context-toggle'
}>()

const emit = defineEmits<{
  open: [path: string]
  select: [paths: string[]]
  error: [message: string]
  'path-renamed': [payload: { from: string; to: string }]
  'paths-deleted': [paths: string[]]
  'request-create': [payload: { parentPath: string; entryKind: EntryKind }]
  'toggle-context': [path: string]
}>()

const treeRef = ref<HTMLElement | null>(null)
const contextMenu = ref<{ x: number; y: number; targetPath: string | null } | null>(null)

const selectionManager = useSelectionManager()
const isMac = navigator.platform.toLowerCase().includes('mac')

const selectionPaths = computed(() => selectionManager.selectedPaths.value)
const rowActionMode = computed(() => props.rowActionMode ?? 'menu')
const contextPathSet = computed(() => new Set(props.contextPaths ?? []))

const treeState = useExplorerTreeState({
  folderPath: computed(() => props.folderPath),
  activePath: computed(() => props.activePath),
  treeRef,
  onSelect: (paths) => emit('select', paths),
  selection: {
    selectedPaths: selectionPaths,
    clearSelection: selectionManager.clearSelection,
    selectSingle: selectionManager.selectSingle
  }
})

const fsSync = useExplorerFsSync({
  folderPath: computed(() => props.folderPath),
  childrenByDir: treeState.childrenByDir,
  nodeByPath: treeState.nodeByPath,
  parentByPath: treeState.parentByPath,
  expandedPaths: treeState.expandedPaths,
  focusedPath: treeState.focusedPath,
  selectionPaths,
  setSelection: selectionManager.setSelection,
  emitSelection: (paths) => emit('select', paths),
  loadChildren: treeState.loadChildren,
  clearPendingReloadDirs: () => {
    treeState.pendingReloadDirs.value = new Set()
  },
  listenWorkspaceFsChanged
})

const operations = useExplorerOperations({
  folderPath: computed(() => props.folderPath),
  focusedPath: treeState.focusedPath,
  nodeByPath: treeState.nodeByPath,
  selectionPaths,
  clearSelection: selectionManager.clearSelection,
  isSelected: selectionManager.isSelected,
  setSelection: selectionManager.setSelection,
  emitSelection: (paths) => emit('select', paths),
  emitError: (message) => emit('error', message),
  emitOpen: (path) => emit('open', path),
  emitPathRenamed: (payload) => emit('path-renamed', payload),
  emitPathsDeleted: (paths) => emit('paths-deleted', paths),
  emitRequestCreate: (payload) => emit('request-create', payload),
  loadChildren: treeState.loadChildren,
  refreshLoadedDirs: fsSync.refreshLoadedDirs
})

function ensureFocusedPath(defaultToFirst = true) {
  if (treeState.focusedPath.value && treeState.visibleNodePaths.value.includes(treeState.focusedPath.value)) {
    return treeState.focusedPath.value
  }

  if (defaultToFirst && treeState.visibleNodePaths.value.length) {
    treeState.focusedPath.value = treeState.visibleNodePaths.value[0]
    return treeState.focusedPath.value
  }

  return ''
}

const keyboard = useExplorerKeyboard({
  folderPath: computed(() => props.folderPath),
  focusedPath: treeState.focusedPath,
  visibleNodePaths: treeState.visibleNodePaths,
  parentByPath: treeState.parentByPath,
  childrenByDir: treeState.childrenByDir,
  nodeByPath: treeState.nodeByPath,
  expandedPaths: treeState.expandedPaths,
  selectionPaths,
  isMac,
  selectSingle: selectionManager.selectSingle,
  selectRange: selectionManager.selectRange,
  setSelection: selectionManager.setSelection,
  emitSelection: (paths) => emit('select', paths),
  ensureFocusedPath,
  toggleExpand: treeState.toggleExpand,
  openNode: operations.openNode,
  startRename: operations.startRename,
  requestDelete: operations.requestDelete,
  setClipboard: operations.setClipboard,
  runPaste: () => operations.runPaste(),
  requestCreate: operations.requestCreate
})

function currentContextTarget(): string | null {
  return contextMenu.value?.targetPath ?? null
}

function openContextMenuAt(x: number, y: number, targetPath: string | null) {
  contextMenu.value = { x, y, targetPath }
}

function openContextMenu(event: MouseEvent, targetPath: string | null) {
  openContextMenuAt(event.clientX + 2, event.clientY + 2, targetPath)
}

function closeContextMenu() {
  contextMenu.value = null
}

function handleRowClick(event: MouseEvent, node: TreeNode) {
  const ordered = treeState.visibleNodePaths.value
  const isToggle = isMac ? event.metaKey : event.ctrlKey

  if (event.shiftKey) {
    selectionManager.selectRange(node.path, ordered)
  } else if (isToggle) {
    selectionManager.toggleSelection(node.path)
  } else {
    selectionManager.selectSingle(node.path)
  }

  treeState.focusedPath.value = node.path
  emit('select', selectionPaths.value)

  if (node.is_dir && !event.shiftKey && !isToggle) {
    void treeState.toggleExpand(node.path)
    return
  }

  if (!node.is_dir && node.is_markdown && !event.shiftKey && !isToggle) {
    if (rowActionMode.value === 'context-toggle') {
      emit('toggle-context', node.path)
      return
    }
    emit('open', node.path)
  }
}

function handleDoubleClick(node: TreeNode) {
  if (node.is_dir) return
  if (node.is_markdown) {
    emit('open', node.path)
  } else {
    void openPathExternal(node.path)
  }
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

async function onContextAction(action: MenuAction) {
  const targetPath = currentContextTarget()
  const targetNode = targetPath ? treeState.nodeByPath.value[targetPath] : null
  const selection = operations.effectiveSelection(targetPath)

  if (action === 'new-file' || action === 'new-folder') {
    const parent = targetNode?.is_dir ? targetNode.path : targetPath ? treeState.parentByPath.value[targetPath] ?? props.folderPath : props.folderPath
    operations.requestCreate(parent || props.folderPath, action === 'new-file' ? 'file' : 'folder')
    closeContextMenu()
    return
  }

  if (action === 'open') {
    await operations.openSelected(selection)
  }

  if (action === 'open-external' && targetPath) {
    await operations.openExternal(targetPath)
  }

  if (action === 'reveal' && targetPath) {
    await operations.revealInManager(targetPath)
  }

  if (action === 'rename' && targetPath) {
    operations.startRename(targetPath)
  }

  if (action === 'delete') {
    operations.requestDelete(selection)
  }

  if (action === 'duplicate') {
    await operations.runDuplicate(selection)
  }

  if (action === 'copy') {
    operations.setClipboard('copy', selection)
  }

  if (action === 'cut') {
    operations.setClipboard('cut', selection)
  }

  if (action === 'paste') {
    await operations.runPaste(targetPath)
  }

  closeContextMenu()
}

watch(
  () => props.folderPath,
  async () => {
    await treeState.initializeExplorer()
    fsSync.resetWatcherSession()
  },
  { immediate: true }
)

watch(
  () => props.activePath,
  async (next) => {
    if (!next || !props.folderPath) return
    await treeState.revealPathInView(next)
  },
  { immediate: true }
)

defineExpose({
  revealPathInView: treeState.revealPathInView
})

onMounted(() => {
  window.addEventListener('click', closeContextMenu)
  fsSync.start()
  treeState.focusTree()
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeContextMenu)
  fsSync.stop()
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-2">
    <ExplorerToolbar
      :disabled="!folderPath"
      @create-file="operations.requestCreate(folderPath, 'file')"
      @create-folder="operations.requestCreate(folderPath, 'folder')"
      @expand-all="treeState.expandAllDirs"
      @collapse-all="treeState.collapseAllDirs"
      @refresh="fsSync.refreshLoadedDirs"
    />

    <div
      ref="treeRef"
      tabindex="0"
      class="min-h-0 flex-1 overflow-auto bg-transparent p-0.5 outline-none focus-visible:ring-0"
      @keydown="keyboard.onTreeKeydown"
      @contextmenu.prevent="onTreeContextMenu"
      @click="clearSelectionIfBackground"
    >
      <p v-if="!folderPath" class="explorer-empty-state px-2 py-1 text-xs">Select a working folder to start.</p>
      <p v-else-if="!treeState.visibleRows.value.length" class="explorer-empty-state px-2 py-1 text-xs">
        No files or folders. Use New file or New folder.
      </p>

      <template v-else>
        <ExplorerItem
          v-for="row in treeState.visibleRows.value"
          :key="row.path"
          :node="treeState.nodeByPath.value[row.path]"
          :depth="row.depth"
          :expanded="treeState.expandedPaths.value.has(row.path)"
          :selected="selectionManager.isSelected(row.path)"
          :active="activePath === row.path"
          :focused="treeState.focusedPath.value === row.path"
          :cut-pending="Boolean(operations.clipboard.value?.mode === 'cut' && operations.clipboard.value.paths.includes(row.path))"
          :editing="operations.editingPath.value === row.path"
          :rename-value="operations.editingValue.value"
          :context-active="contextPathSet.has(row.path)"
          @toggle="treeState.toggleExpand"
          @click="handleRowClick"
          @doubleclick="handleDoubleClick"
          @contextmenu="onNodeContextMenu"
          @rowaction="onRowAction"
          @rename-update="operations.editingValue.value = $event"
          @rename-confirm="operations.confirmRename"
          @rename-cancel="operations.cancelRename"
        />
      </template>
    </div>

    <ExplorerContextMenu
      v-if="contextMenu"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :can-open="Boolean(contextMenu.targetPath)"
      :can-paste="operations.canPaste.value"
      :can-rename="Boolean(contextMenu.targetPath)"
      :can-delete="Boolean(contextMenu.targetPath)"
      @action="onContextAction"
    />

    <ExplorerConflictDialog
      v-if="operations.conflictPrompt.value"
      :title="operations.conflictPrompt.value.title"
      :detail="operations.conflictPrompt.value.detail"
      @cancel="operations.closeConflictPrompt"
      @resolve="operations.resolveConflict"
    />

    <ExplorerConfirmDialog
      v-if="operations.confirmPrompt.value"
      :title="operations.confirmPrompt.value.title"
      :detail="operations.confirmPrompt.value.detail"
      @cancel="operations.cancelConfirmPrompt"
      @confirm="operations.confirmPromptAction(currentContextTarget())"
    />
  </div>
</template>

<style scoped>
.explorer-empty-state {
  color: var(--text-dim);
}
</style>
