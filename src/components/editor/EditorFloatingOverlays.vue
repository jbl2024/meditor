<script setup lang="ts">
import type { BlockMenuActionItem } from '../../lib/tiptap/blockMenu/types'
import type { TableActionId, TableToolbarAction } from '../../lib/tiptap/tableToolbarActions'
import type { SlashCommand } from '../../lib/editorSlashCommands'
import EditorSlashMenu from './EditorSlashMenu.vue'
import EditorWikilinkMenu from './EditorWikilinkMenu.vue'
import EditorBlockMenu from './EditorBlockMenu.vue'
import EditorTableToolbar from './EditorTableToolbar.vue'

defineProps<{
  slashOpen: boolean
  slashIndex: number
  slashLeft: number
  slashTop: number
  slashCommands: SlashCommand[]
  wikilinkOpen: boolean
  wikilinkIndex: number
  wikilinkLeft: number
  wikilinkTop: number
  wikilinkResults: Array<{ id: string; label: string; target: string; isCreate: boolean }>
  blockMenuOpen: boolean
  blockMenuIndex: number
  blockMenuX: number
  blockMenuY: number
  blockMenuActions: BlockMenuActionItem[]
  blockMenuConvertActions: BlockMenuActionItem[]
  tableToolbarOpen: boolean
  tableToolbarViewportLeft: number
  tableToolbarViewportTop: number
  tableToolbarActions: TableToolbarAction[]
  tableMarkdownMode: boolean
  tableToolbarViewportMaxHeight: number
}>()

const emit = defineEmits<{
  'slash:updateIndex': [value: number]
  'slash:select': [command: SlashCommand]
  'wikilink:updateIndex': [value: number]
  'wikilink:select': [target: string]
  'block:updateIndex': [value: number]
  'block:select': [item: BlockMenuActionItem]
  'block:close': []
  'block:menuEl': [element: HTMLDivElement | null]
  'table:select': [actionId: TableActionId]
  'table:close': []
  'table:menuEl': [element: HTMLDivElement | null]
}>()
</script>

<template>
  <Teleport to="body">
    <div :style="{ position: 'fixed', left: `${slashLeft}px`, top: `${slashTop}px`, zIndex: 50 }">
      <EditorSlashMenu
        :open="slashOpen"
        :index="slashIndex"
        :left="0"
        :top="0"
        :commands="slashCommands"
        @update:index="emit('slash:updateIndex', $event)"
        @select="emit('slash:select', $event)"
      />
    </div>

    <div :style="{ position: 'fixed', left: `${wikilinkLeft}px`, top: `${wikilinkTop}px`, zIndex: 50 }">
      <EditorWikilinkMenu
        :open="wikilinkOpen"
        :index="wikilinkIndex"
        :left="0"
        :top="0"
        :results="wikilinkResults"
        @menu-el="() => {}"
        @update:index="emit('wikilink:updateIndex', $event)"
        @select="emit('wikilink:select', $event)"
      />
    </div>

    <div :style="{ position: 'fixed', left: `${blockMenuX}px`, top: `${blockMenuY}px`, zIndex: 50 }">
      <EditorBlockMenu
        :open="blockMenuOpen"
        :index="blockMenuIndex"
        :actions="blockMenuActions"
        :convert-actions="blockMenuConvertActions"
        @menu-el="emit('block:menuEl', $event)"
        @update:index="emit('block:updateIndex', $event)"
        @select="emit('block:select', $event)"
        @close="emit('block:close')"
      />
    </div>

    <div :style="{ position: 'fixed', left: `${tableToolbarViewportLeft}px`, top: `${tableToolbarViewportTop}px`, zIndex: 52 }">
      <EditorTableToolbar
        :open="tableToolbarOpen"
        :actions="tableToolbarActions"
        :markdown-mode="tableMarkdownMode"
        :max-height-px="tableToolbarViewportMaxHeight"
        @menu-el="emit('table:menuEl', $event)"
        @select="emit('table:select', $event)"
        @close="emit('table:close')"
      />
    </div>
  </Teleport>
</template>
