<script setup lang="ts">
import ExplorerRenameInput from './ExplorerRenameInput.vue'
import type { TreeNode } from '../../lib/api'

const props = defineProps<{
  node: TreeNode
  depth: number
  expanded: boolean
  selected: boolean
  active: boolean
  focused: boolean
  dragTarget: boolean
  cutPending: boolean
  editing: boolean
  renameValue: string
}>()

const emit = defineEmits<{
  toggle: [path: string]
  click: [event: MouseEvent, node: TreeNode]
  doubleclick: [node: TreeNode]
  contextmenu: [payload: { event: MouseEvent; node: TreeNode }]
  dragstart: [payload: { event: DragEvent; node: TreeNode }]
  dragover: [payload: { event: DragEvent; node: TreeNode }]
  dragleave: [payload: { event: DragEvent; node: TreeNode }]
  drop: [payload: { event: DragEvent; node: TreeNode }]
  rowaction: [payload: { event: MouseEvent; node: TreeNode }]
  renameUpdate: [value: string]
  renameConfirm: []
  renameCancel: []
}>()

function iconForNode(node: TreeNode): string {
  if (node.is_dir) return props.expanded ? 'folder-open' : 'folder'
  if (node.is_markdown) return 'markdown'
  const ext = node.name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'svg') return 'image'
  return 'document'
}
</script>

<template>
  <div
    class="group flex items-center gap-2 rounded-lg px-2 py-1 text-xs"
    :class="[
      selected ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300',
      active ? 'font-semibold text-slate-950 dark:text-white' : '',
      focused ? 'ring-1 ring-blue-500/70' : '',
      dragTarget ? 'bg-emerald-100/90 dark:bg-emerald-900/35' : '',
      cutPending ? 'opacity-45' : 'opacity-100'
    ]"
    :style="{ paddingLeft: `${depth * 14 + 8}px` }"
    draggable="true"
    @click="emit('click', $event, node)"
    @dblclick="emit('doubleclick', node)"
    @contextmenu.prevent="emit('contextmenu', { event: $event, node })"
    @dragstart="emit('dragstart', { event: $event, node })"
    @dragover.prevent="emit('dragover', { event: $event, node })"
    @dragleave="emit('dragleave', { event: $event, node })"
    @drop.prevent="emit('drop', { event: $event, node })"
  >
    <button
      type="button"
      class="inline-flex h-4 w-4 items-center justify-center rounded text-[10px] text-slate-500 dark:text-slate-400"
      @click.stop="node.is_dir && emit('toggle', node.path)"
    >
      <svg
        v-if="iconForNode(node) === 'folder'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        class="h-4 w-4"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 7.5h5.379a1.5 1.5 0 0 1 1.06.44l1.122 1.12a1.5 1.5 0 0 0 1.06.44H20.25a.75.75 0 0 1 .75.75v7.5a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 17.75V8.25a.75.75 0 0 1 .75-.75Z" />
      </svg>
      <svg
        v-else-if="iconForNode(node) === 'folder-open'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        class="h-4 w-4"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 8.25A2.25 2.25 0 0 1 6 6h3.4a1.5 1.5 0 0 1 1.06.44l1.12 1.12a1.5 1.5 0 0 0 1.061.44H18A2.25 2.25 0 0 1 20.205 9.7l-1.07 7.5A2.25 2.25 0 0 1 16.908 19.5H6.092a2.25 2.25 0 0 1-2.227-1.8L2.796 10.2a2.25 2.25 0 0 1 .954-1.95Z" />
      </svg>
      <svg
        v-else-if="iconForNode(node) === 'markdown'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        class="h-4 w-4"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 3.75h6.879a2.25 2.25 0 0 1 1.591.659l3.621 3.621a2.25 2.25 0 0 1 .659 1.591V18a2.25 2.25 0 0 1-2.25 2.25h-10.5A2.25 2.25 0 0 1 5.25 18V6A2.25 2.25 0 0 1 7.5 3.75Z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 14.25v-3l1.5 1.5 1.5-1.5v3M13.5 14.25h2.25l-2.25-3h2.25" />
      </svg>
      <svg
        v-else-if="iconForNode(node) === 'image'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        class="h-4 w-4"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h12A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6Z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15 4.5-4.5 3 3 2.25-2.25L19.5 16.5M14.25 8.25h.008v.008h-.008V8.25Z" />
      </svg>
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        class="h-4 w-4"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 3.75h6.879a2.25 2.25 0 0 1 1.591.659l3.621 3.621a2.25 2.25 0 0 1 .659 1.591V18a2.25 2.25 0 0 1-2.25 2.25h-10.5A2.25 2.25 0 0 1 5.25 18V6A2.25 2.25 0 0 1 7.5 3.75Z" />
      </svg>
    </button>

    <div class="min-w-0 flex-1">
      <ExplorerRenameInput
        v-if="editing"
        :model-value="renameValue"
        @update:model-value="emit('renameUpdate', $event)"
        @confirm="emit('renameConfirm')"
        @cancel="emit('renameCancel')"
      />
      <span v-else class="truncate" :title="node.path">{{ node.name }}</span>
    </div>

    <button
      type="button"
      class="rounded-md px-1.5 text-sm leading-none text-slate-500 opacity-35 transition hover:bg-slate-200/70 hover:opacity-100 group-hover:opacity-100 dark:text-slate-300 dark:hover:bg-slate-700/70"
      :class="selected ? 'opacity-100' : ''"
      title="Actions"
      @click.stop="emit('rowaction', { event: $event, node })"
    >
      ⋯
    </button>
  </div>
</template>
