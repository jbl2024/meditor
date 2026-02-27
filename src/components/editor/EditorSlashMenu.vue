<script setup lang="ts">
import {
  ChatBubbleLeftRightIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  HashtagIcon,
  ListBulletIcon,
  QueueListIcon,
  RectangleGroupIcon,
  TableCellsIcon,
  ViewColumnsIcon,
} from '@heroicons/vue/24/outline'

type SlashCommand = {
  id: string
  label: string
  type: string
  data: Record<string, unknown>
}

const props = defineProps<{
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

const ICON_BY_ID: Record<string, unknown> = {
  heading: HashtagIcon,
  bullet: ListBulletIcon,
  checklist: QueueListIcon,
  table: TableCellsIcon,
  callout: ChatBubbleLeftRightIcon,
  mermaid: RectangleGroupIcon,
  code: CodeBracketIcon,
  quote: ChatBubbleLeftRightIcon,
  divider: ViewColumnsIcon,
}

const ICON_BY_TYPE: Record<string, unknown> = {
  header: HashtagIcon,
  list: ListBulletIcon,
  table: TableCellsIcon,
  callout: ChatBubbleLeftRightIcon,
  mermaid: RectangleGroupIcon,
  code: CodeBracketIcon,
  quote: ChatBubbleLeftRightIcon,
  delimiter: ViewColumnsIcon,
}

function iconFor(command: SlashCommand) {
  return ICON_BY_ID[command.id] ?? ICON_BY_TYPE[command.type] ?? DocumentTextIcon
}
</script>

<template>
  <div
    v-if="props.open"
    class="absolute z-20 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
    :style="{ left: `${props.left}px`, top: `${props.top}px` }"
  >
    <button
      v-for="(command, idx) in props.commands"
      :key="command.id"
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      :class="idx === props.index ? 'bg-slate-100 dark:bg-slate-800' : ''"
      @mousedown.prevent="emit('update:index', idx)"
      @click.stop.prevent="emit('select', command)"
    >
      <component :is="iconFor(command)" class="h-4 w-4 shrink-0" />
      <span class="truncate">{{ command.label }}</span>
    </button>
  </div>
</template>
