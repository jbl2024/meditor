<script setup lang="ts">
import ExplorerRenameInput from './ExplorerRenameInput.vue'
import type { TreeNode } from '../../lib/api'
import { DocumentIcon, DocumentTextIcon, FolderIcon, FolderOpenIcon, PhotoIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  node: TreeNode
  depth: number
  expanded: boolean
  selected: boolean
  active: boolean
  focused: boolean
  cutPending: boolean
  editing: boolean
  renameValue: string
}>()

const emit = defineEmits<{
  toggle: [path: string]
  click: [event: MouseEvent, node: TreeNode]
  doubleclick: [node: TreeNode]
  contextmenu: [payload: { event: MouseEvent; node: TreeNode }]
  rowaction: [payload: { event: MouseEvent; node: TreeNode }]
  renameUpdate: [value: string]
  renameConfirm: []
  renameCancel: []
}>()

function iconForNode(node: TreeNode) {
  if (node.is_dir) return props.expanded ? FolderOpenIcon : FolderIcon
  if (node.is_markdown) return DocumentTextIcon
  const ext = node.name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'svg') return PhotoIcon
  return DocumentIcon
}
</script>

<template>
  <div
    class="group flex items-center gap-2 rounded-lg px-2 py-1 text-xs"
    :class="[
      selected ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300',
      active ? 'font-semibold text-slate-950 dark:text-white' : '',
      focused ? 'ring-1 ring-blue-500/70' : '',
      cutPending ? 'opacity-45' : 'opacity-100'
    ]"
    :style="{ paddingLeft: `${depth * 14 + 8}px` }"
    @click="emit('click', $event, node)"
    @dblclick="emit('doubleclick', node)"
    @contextmenu.prevent="emit('contextmenu', { event: $event, node })"
  >
    <button
      type="button"
      class="inline-flex h-4 w-4 items-center justify-center rounded text-[10px] text-slate-500 dark:text-slate-400"
      @click.stop="node.is_dir && emit('toggle', node.path)"
    >
      <component :is="iconForNode(node)" class="h-4 w-4" />
    </button>

    <div class="min-w-0 flex-1">
      <ExplorerRenameInput
        v-if="editing"
        :model-value="renameValue"
        @update:model-value="emit('renameUpdate', $event)"
        @confirm="emit('renameConfirm')"
        @cancel="emit('renameCancel')"
      />
      <span v-else class="block truncate" :title="node.path">{{ node.name }}</span>
    </div>

    <button
      type="button"
      class="rounded-md px-1.5 text-sm leading-none text-slate-500 opacity-0 transition hover:bg-slate-200/70 hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 dark:text-slate-300 dark:hover:bg-slate-700/70"
      title="Actions"
      @click.stop="emit('rowaction', { event: $event, node })"
    >
      ⋯
    </button>
  </div>
</template>
