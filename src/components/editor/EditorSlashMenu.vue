<script setup lang="ts">
import { computed } from 'vue'
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
import UiFilterableDropdown, { type FilterableDropdownItem } from '../ui/UiFilterableDropdown.vue'

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
  html: CodeBracketIcon,
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
  html: CodeBracketIcon,
  quote: ChatBubbleLeftRightIcon,
  delimiter: ViewColumnsIcon,
}

function iconFor(command: SlashCommand) {
  return ICON_BY_ID[command.id] ?? ICON_BY_TYPE[command.type] ?? DocumentTextIcon
}

const items = computed<Array<FilterableDropdownItem & { command: SlashCommand }>>(() =>
  props.commands.map((command) => ({
    id: `slash:${command.id}:${command.type}`,
    label: command.label,
    command
  }))
)

function onSelect(item: FilterableDropdownItem) {
  const command = (item as FilterableDropdownItem & { command?: SlashCommand }).command
  if (!command) return
  emit('select', command)
}

function commandFromItem(item: unknown): SlashCommand | null {
  const command = (item as { command?: SlashCommand } | null)?.command
  return command ?? null
}

function labelForItem(item: unknown): string {
  const command = commandFromItem(item)
  return command?.label ?? ''
}

function iconForItem(item: unknown) {
  const command = commandFromItem(item)
  return command ? iconFor(command) : DocumentTextIcon
}
</script>

<template>
  <div class="editor-slash-dropdown-anchor" :style="{ left: `${props.left}px`, top: `${props.top}px` }">
    <UiFilterableDropdown
      class="editor-slash-dropdown"
      :items="items"
      :model-value="props.open"
      query=""
      :active-index="props.index"
      :show-filter="false"
      :auto-focus-on-open="false"
      :close-on-outside="false"
      :close-on-select="false"
      :max-height="320"
      @open-change="() => {}"
      @query-change="() => {}"
      @active-index-change="emit('update:index', $event)"
      @select="onSelect($event)"
    >
      <template #item="{ item }">
        <span class="editor-slash-item">
          <component :is="iconForItem(item)" class="h-4 w-4 shrink-0" />
          <span class="truncate">{{ labelForItem(item) }}</span>
        </span>
      </template>
    </UiFilterableDropdown>
  </div>
</template>

<style scoped>
.editor-slash-dropdown-anchor {
  position: absolute;
}

.editor-slash-dropdown :deep(.ui-filterable-dropdown-menu) {
  position: absolute;
  left: 0;
  top: 0;
  width: 14rem;
  z-index: 20;
}

.editor-slash-dropdown :deep(.ui-filterable-dropdown-option) {
  border-radius: 0.375rem;
  color: rgb(51 65 85);
  font-size: 0.875rem;
  padding: 0.5rem 0.625rem;
}

.editor-slash-item {
  align-items: center;
  display: flex;
  gap: 0.5rem;
}

.dark .editor-slash-dropdown :deep(.ui-filterable-dropdown-option) {
  color: rgb(226 232 240);
}

.dark .editor-slash-dropdown :deep(.ui-filterable-dropdown-menu) {
  background: rgb(15 23 42);
  border-color: rgb(71 85 105);
}

.dark .editor-slash-dropdown :deep(.ui-filterable-dropdown-option:hover),
.dark .editor-slash-dropdown :deep(.ui-filterable-dropdown-option[data-active='true']) {
  background: rgb(30 41 59);
}

.dark .editor-slash-dropdown :deep(.ui-filterable-dropdown-empty) {
  color: rgb(148 163 184);
}
</style>
