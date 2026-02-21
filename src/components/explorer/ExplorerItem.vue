<script setup lang="ts">
import ExplorerRenameInput from './ExplorerRenameInput.vue'
import type { TreeNode } from '../../lib/api'

const props = defineProps<{
  node: TreeNode
  depth: number
  expanded: boolean
  selected: boolean
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
  if (node.is_dir) return props.expanded ? '▾' : '▸'
  if (node.is_markdown) return 'M'
  const ext = node.name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'txt') return 'T'
  if (ext === 'json') return 'J'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif') return 'I'
  return '•'
}
</script>

<template>
  <div
    class="group flex items-center gap-2 rounded-lg px-2 py-1 text-xs"
    :class="[
      selected ? 'bg-blue-100/90 text-slate-900 dark:bg-blue-900/40 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300',
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
      {{ iconForNode(node) }}
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
