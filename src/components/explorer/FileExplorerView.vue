<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FileTreeItem from './FileTreeItem.vue'
import UiButton from '../ui/UiButton.vue'
import UiInput from '../ui/UiInput.vue'
import {
  createEntry,
  duplicateEntry,
  listTree,
  moveEntry,
  openPathExternal,
  renameEntry,
  trashEntry,
  type ConflictStrategy,
  type TreeNode
} from '../../lib/api'

const props = defineProps<{
  folderPath: string
  selectedPath: string
}>()

const emit = defineEmits<{
  select: [path: string]
  error: [message: string]
}>()

const CONFLICT_STRATEGY_STORAGE_KEY = 'meditor.explorer.conflict-strategy'

const treeNodes = ref<TreeNode[]>([])
const loading = ref(false)
const explorerError = ref('')
const draggingPath = ref('')
const contextMenu = ref<{ x: number; y: number; node: TreeNode | null } | null>(null)

const promptMode = ref<'new_file' | 'new_folder' | 'rename' | null>(null)
const promptValue = ref('')
const promptTargetNode = ref<TreeNode | null>(null)
const promptParentPath = ref('')

const conflictStrategy = ref<ConflictStrategy>('rename')

const hasFolder = computed(() => Boolean(props.folderPath))
const hasTree = computed(() => treeNodes.value.length > 0)

function displayError(message: string) {
  explorerError.value = message
  emit('error', message)
}

function clearError() {
  explorerError.value = ''
}

function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return path
  return normalized.slice(0, idx)
}

function isDescendantPath(path: string, base: string): boolean {
  if (!path || !base) return false
  const normalizedPath = path.replace(/\\/g, '/')
  const normalizedBase = base.replace(/\\/g, '/')
  return normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`)
}

async function refreshTree() {
  if (!props.folderPath) {
    treeNodes.value = []
    return
  }

  loading.value = true
  clearError()

  try {
    treeNodes.value = await listTree(props.folderPath)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load folder tree.'
    displayError(message)
    treeNodes.value = []
  } finally {
    loading.value = false
  }
}

function openRootContextMenu(event: MouseEvent) {
  contextMenu.value = { x: event.clientX, y: event.clientY, node: null }
}

function openNodeContextMenu(payload: { event: MouseEvent; node: TreeNode }) {
  contextMenu.value = { x: payload.event.clientX, y: payload.event.clientY, node: payload.node }
}

function closeContextMenu() {
  contextMenu.value = null
}

function startPrompt(mode: 'new_file' | 'new_folder' | 'rename', node: TreeNode | null) {
  promptMode.value = mode
  promptTargetNode.value = node
  promptValue.value = mode === 'rename' && node ? node.name : ''

  if (!node) {
    promptParentPath.value = props.folderPath
  } else if (mode === 'rename') {
    promptParentPath.value = getParentPath(node.path)
  } else {
    promptParentPath.value = node.is_dir ? node.path : getParentPath(node.path)
  }
}

function closePrompt() {
  promptMode.value = null
  promptValue.value = ''
  promptTargetNode.value = null
  promptParentPath.value = ''
}

async function confirmPrompt() {
  if (!promptMode.value || !props.folderPath) return

  const name = promptValue.value.trim()
  if (!name) {
    displayError('Name is required.')
    return
  }

  closeContextMenu()
  clearError()

  try {
    if (promptMode.value === 'new_file') {
      const createdPath = await createEntry(
        props.folderPath,
        promptParentPath.value,
        name,
        false,
        conflictStrategy.value
      )
      if (createdPath.toLowerCase().endsWith('.md') || createdPath.toLowerCase().endsWith('.markdown')) {
        emit('select', createdPath)
      }
    }

    if (promptMode.value === 'new_folder') {
      await createEntry(
        props.folderPath,
        promptParentPath.value,
        name,
        true,
        conflictStrategy.value
      )
    }

    if (promptMode.value === 'rename' && promptTargetNode.value) {
      const previousPath = promptTargetNode.value.path
      const renamedPath = await renameEntry(
        props.folderPath,
        previousPath,
        name,
        conflictStrategy.value
      )

      if (props.selectedPath === previousPath || isDescendantPath(props.selectedPath, previousPath)) {
        emit('select', renamedPath)
      }
    }

    closePrompt()
    await refreshTree()
  } catch (err) {
    displayError(err instanceof Error ? err.message : 'Operation failed.')
  }
}

async function onDuplicate(node: TreeNode | null) {
  if (!node || !props.folderPath) return
  closeContextMenu()

  try {
    const duplicatedPath = await duplicateEntry(props.folderPath, node.path, conflictStrategy.value)
    if (!node.is_dir && node.is_markdown) {
      emit('select', duplicatedPath)
    }
    await refreshTree()
  } catch (err) {
    displayError(err instanceof Error ? err.message : 'Duplicate failed.')
  }
}

async function onDelete(node: TreeNode | null) {
  if (!node || !props.folderPath) return
  closeContextMenu()

  try {
    await trashEntry(props.folderPath, node.path)
    if (props.selectedPath === node.path || isDescendantPath(props.selectedPath, node.path)) {
      emit('select', '')
    }
    await refreshTree()
  } catch (err) {
    displayError(err instanceof Error ? err.message : 'Delete failed.')
  }
}

async function onOpenExternal(node: TreeNode | null) {
  if (!node) return
  closeContextMenu()

  try {
    await openPathExternal(node.path)
  } catch (err) {
    displayError(err instanceof Error ? err.message : 'Could not open with external app.')
  }
}

function onSelectNode(node: TreeNode) {
  if (node.is_dir) return

  if (node.is_markdown) {
    emit('select', node.path)
    return
  }

  void onOpenExternal(node)
}

function onDragStart(path: string) {
  draggingPath.value = path
}

async function onDropNode(payload: { sourcePath: string; targetNode: TreeNode }) {
  if (!props.folderPath) return

  const sourcePath = payload.sourcePath
  const targetNode = payload.targetNode
  const targetDirPath = targetNode.is_dir ? targetNode.path : getParentPath(targetNode.path)

  if (!sourcePath || !targetDirPath || sourcePath === targetDirPath) {
    return
  }

  if (isDescendantPath(targetDirPath, sourcePath)) {
    displayError('Cannot move a folder into itself.')
    return
  }

  try {
    const movedPath = await moveEntry(
      props.folderPath,
      sourcePath,
      targetDirPath,
      conflictStrategy.value
    )

    if (props.selectedPath === sourcePath || isDescendantPath(props.selectedPath, sourcePath)) {
      emit('select', movedPath)
    }

    await refreshTree()
  } catch (err) {
    displayError(err instanceof Error ? err.message : 'Move failed.')
  } finally {
    draggingPath.value = ''
  }
}

function menuAction(action: string) {
  const node = contextMenu.value?.node ?? null

  if (action === 'new-file') {
    startPrompt('new_file', node)
  }

  if (action === 'new-folder') {
    startPrompt('new_folder', node)
  }

  if (action === 'rename' && node) {
    startPrompt('rename', node)
  }

  if (action === 'duplicate' && node) {
    void onDuplicate(node)
  }

  if (action === 'delete' && node) {
    void onDelete(node)
  }

  if (action === 'open-external' && node) {
    void onOpenExternal(node)
  }

  if (action === 'refresh') {
    closeContextMenu()
    void refreshTree()
  }
}

watch(
  () => props.folderPath,
  async () => {
    closeContextMenu()
    closePrompt()
    await refreshTree()
  },
  { immediate: true }
)

watch(conflictStrategy, (next) => {
  window.localStorage.setItem(CONFLICT_STRATEGY_STORAGE_KEY, next)
})

onMounted(() => {
  const stored = window.localStorage.getItem(CONFLICT_STRATEGY_STORAGE_KEY)
  if (stored === 'rename' || stored === 'overwrite') {
    conflictStrategy.value = stored
  }

  window.addEventListener('click', closeContextMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeContextMenu)
})
</script>

<template>
  <div class="space-y-3" @contextmenu.prevent="openRootContextMenu">
    <div class="flex flex-wrap items-center gap-2">
      <UiButton size="sm" :disabled="!hasFolder" @click="startPrompt('new_file', null)">New file</UiButton>
      <UiButton size="sm" :disabled="!hasFolder" @click="startPrompt('new_folder', null)">New folder</UiButton>
      <UiButton size="sm" variant="ghost" :disabled="!hasFolder" @click="refreshTree">Refresh</UiButton>
      <label class="ml-auto flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        <span>On name conflict</span>
        <select
          v-model="conflictStrategy"
          class="h-8 rounded-lg border border-slate-300/90 bg-white/95 px-2 text-xs text-slate-800 dark:border-slate-600/70 dark:bg-slate-900/80 dark:text-slate-100"
        >
          <option value="rename">Keep both (rename)</option>
          <option value="overwrite">Overwrite file</option>
        </select>
      </label>
    </div>

    <div class="space-y-1">
      <p v-if="!hasFolder" class="text-xs text-slate-500 dark:text-slate-500">Select a working folder to start.</p>
      <p v-else-if="loading" class="text-xs text-slate-500 dark:text-slate-500">Loading files and folders...</p>
      <p v-else-if="!hasTree" class="text-xs text-slate-500 dark:text-slate-500">No files or folders found. Right-click here or use New file/New folder.</p>

      <ul v-else class="space-y-0.5">
        <FileTreeItem
          v-for="node in treeNodes"
          :key="node.path"
          :node="node"
          :selected-path="selectedPath"
          :dragging-path="draggingPath"
          @select="onSelectNode"
          @contextmenu="openNodeContextMenu"
          @dragstart="onDragStart"
          @dropnode="onDropNode"
        />
      </ul>

      <p v-if="explorerError" class="rounded-lg border border-rose-300/80 bg-rose-50/80 px-2 py-1 text-xs text-rose-700 dark:border-rose-900/80 dark:bg-rose-950/40 dark:text-rose-300">
        {{ explorerError }}
      </p>
    </div>

    <div
      v-if="contextMenu"
      class="fixed z-40 min-w-[220px] rounded-xl border border-slate-300/90 bg-white p-1 shadow-lg dark:border-slate-700/80 dark:bg-slate-900"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button type="button" class="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800" @click="menuAction('new-file')">New file</button>
      <button type="button" class="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800" @click="menuAction('new-folder')">New folder</button>
      <button type="button" class="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800" @click="menuAction('refresh')">Refresh</button>

      <template v-if="contextMenu.node">
        <div class="my-1 border-t border-slate-200 dark:border-slate-700"></div>
        <button type="button" class="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800" @click="menuAction('rename')">Rename</button>
        <button type="button" class="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800" @click="menuAction('duplicate')">Duplicate</button>
        <button type="button" class="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800" @click="menuAction('open-external')">Open in default app</button>
        <button type="button" class="w-full rounded-lg px-3 py-2 text-left text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/30" @click="menuAction('delete')">Move to trash</button>
      </template>
    </div>

    <div v-if="promptMode" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" @click="closePrompt">
      <div class="w-full max-w-sm rounded-2xl border border-slate-300/80 bg-white p-4 shadow-xl dark:border-slate-700/80 dark:bg-slate-900" @click.stop>
        <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {{ promptMode === 'rename' ? 'Rename item' : promptMode === 'new_file' ? 'Create file' : 'Create folder' }}
        </h3>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Conflict mode: {{ conflictStrategy === 'rename' ? 'Keep both' : 'Overwrite file' }}</p>
        <UiInput v-model="promptValue" className="mt-3" :placeholder="promptMode === 'new_file' ? 'notes.md' : 'name'" />
        <div class="mt-4 flex justify-end gap-2">
          <UiButton size="sm" variant="ghost" @click="closePrompt">Cancel</UiButton>
          <UiButton size="sm" variant="primary" @click="confirmPrompt">Confirm</UiButton>
        </div>
      </div>
    </div>
  </div>
</template>
