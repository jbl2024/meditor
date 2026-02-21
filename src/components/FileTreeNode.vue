<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TreeNode } from '../lib/api'

const props = defineProps<{
  node: TreeNode
  depth?: number
  selectedPath: string
}>()

const emit = defineEmits<{
  select: [path: string]
}>()

const isOpen = ref(true)
const depth = computed(() => props.depth ?? 0)

function onNodeClick() {
  if (props.node.is_dir) {
    isOpen.value = !isOpen.value
    return
  }
  emit('select', props.node.path)
}

function onChildSelect(path: string) {
  emit('select', path)
}
</script>

<template>
  <li>
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition hover:bg-slate-200/70 dark:hover:bg-slate-800/80"
      :class="[
        node.is_dir ? 'font-semibold text-slate-700 dark:text-slate-200' : 'text-slate-700 dark:text-slate-300',
        !node.is_dir && selectedPath === node.path ? 'bg-slate-200/80 dark:bg-slate-800/85' : ''
      ]"
      :style="{ paddingLeft: `${depth * 14 + 8}px` }"
      @click="onNodeClick"
    >
      <span v-if="node.is_dir" class="w-3 text-[10px] text-slate-500 dark:text-slate-400">{{ isOpen ? '▾' : '▸' }}</span>
      <span v-else class="w-3 text-[10px] text-slate-500 dark:text-slate-400">•</span>
      <span class="truncate" :title="node.path">{{ node.name }}</span>
    </button>

    <ul v-if="node.is_dir && isOpen && node.children.length" class="space-y-0.5">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :selected-path="selectedPath"
        @select="onChildSelect"
      />
    </ul>
  </li>
</template>
