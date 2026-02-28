<script setup lang="ts">
import type { SlashCommand } from '../../lib/editorSlashCommands'
import EditorSlashMenu from './EditorSlashMenu.vue'

defineProps<{
  open: boolean
  index: number
  left: number
  top: number
  commands: SlashCommand[]
}>()

const emit = defineEmits<{
  'update:index': [value: number]
  select: [command: SlashCommand]
}>()
</script>

<template>
  <Teleport to="body">
    <div :style="{ position: 'fixed', left: `${left}px`, top: `${top}px`, zIndex: 50 }">
      <EditorSlashMenu
        :open="open"
        :index="index"
        :left="0"
        :top="0"
        :commands="commands"
        @update:index="emit('update:index', $event)"
        @select="emit('select', $event)"
      />
    </div>
  </Teleport>
</template>
