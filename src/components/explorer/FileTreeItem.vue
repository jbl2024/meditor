<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TreeNode } from '../../lib/api'

const props = defineProps<{
  node: TreeNode
  depth?: number
  selectedPath: string
  draggingPath: string
}>()

const emit = defineEmits<{
  select: [node: TreeNode]
  contextmenu: [payload: { event: MouseEvent; node: TreeNode }]
  dragstart: [path: string]
  dropnode: [payload: { sourcePath: string; targetNode: TreeNode }]
}>()

const isExpanded = ref(true)
const depth = computed(() => props.depth ?? 0)

function onClick() {
  if (props.node.is_dir) {
    isExpanded.value = !isExpanded.value
    return
  }

  emit('select', props.node)
}

function onContextMenu(event: MouseEvent) {
  emit('contextmenu', { event, node: props.node })
}

function onDragStart(event: DragEvent) {
  event.dataTransfer?.setData('text/plain', props.node.path)
  emit('dragstart', props.node.path)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  const sourcePath = event.dataTransfer?.getData('text/plain') || props.draggingPath
  if (!sourcePath || sourcePath === props.node.path) return
  emit('dropnode', { sourcePath, targetNode: props.node })
}

function onChildDrop(payload: { sourcePath: string; targetNode: TreeNode }) {
  emit('dropnode', payload)
}

function onChildSelect(node: TreeNode) {
  emit('select', node)
}

function onChildContextMenu(payload: { event: MouseEvent; node: TreeNode }) {
  emit('contextmenu', payload)
}

function onChildDragStart(path: string) {
  emit('dragstart', path)
}
</script>

<template>
  <li>
    <button
      type="button"
      class="group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition hover:bg-slate-200/70 dark:hover:bg-slate-800/80"
      :class="[
        node.is_dir ? 'font-semibold text-slate-700 dark:text-slate-200' : 'text-slate-700 dark:text-slate-300',
        !node.is_dir && selectedPath === node.path ? 'bg-slate-200/80 dark:bg-slate-800/85' : '',
        draggingPath === node.path ? 'opacity-45' : ''
      ]"
      :style="{ paddingLeft: `${depth * 14 + 8}px` }"
      draggable="true"
      @click="onClick"
      @contextmenu.prevent="onContextMenu"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @drop="onDrop"
    >
      <span v-if="node.is_dir" class="w-3 text-[10px] text-slate-500 dark:text-slate-400">{{ isExpanded ? '▾' : '▸' }}</span>
      <span v-else class="w-3 text-[10px] text-slate-500 dark:text-slate-400">{{ node.is_markdown ? 'M' : '•' }}</span>
      <span class="truncate" :title="node.path">{{ node.name }}</span>
    </button>

    <ul v-if="node.is_dir && isExpanded && node.children.length" class="space-y-0.5">
      <FileTreeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :selected-path="selectedPath"
        :dragging-path="draggingPath"
        @select="onChildSelect"
        @contextmenu="onChildContextMenu"
        @dragstart="onChildDragStart"
        @dropnode="onChildDrop"
      />
    </ul>
  </li>
</template>
