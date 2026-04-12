<script setup lang="ts">
import type { EditorAtMacroEntry } from '../../lib/editorAtMacros'
import EditorAtMenu from './EditorAtMenu.vue'

defineProps<{
  open: boolean
  index: number
  left: number
  top: number
  query: string
  items: EditorAtMacroEntry[]
}>()

const emit = defineEmits<{
  'update:index': [value: number]
  'update:query': [value: string]
  select: [item: EditorAtMacroEntry]
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <div :style="{ position: 'fixed', left: `${left}px`, top: `${top}px`, zIndex: 50 }">
      <EditorAtMenu
        :open="open"
        :index="index"
        :left="0"
        :top="0"
        :query="query"
        :items="items"
        @update:index="emit('update:index', $event)"
        @update:query="emit('update:query', $event)"
        @select="emit('select', $event)"
        @close="emit('close')"
      />
    </div>
  </Teleport>
</template>
