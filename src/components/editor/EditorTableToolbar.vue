<script setup lang="ts">
import { computed, nextTick, onMounted, onUpdated, ref, watch, type Component } from 'vue'
import {
  ArrowUpIcon,
  ArrowDownIcon,
  Bars3BottomLeftIcon,
  Bars3Icon,
  MinusIcon,
  TableCellsIcon,
  ViewColumnsIcon
} from '@heroicons/vue/24/outline'
import type { TableActionGroup, TableToolbarAction, TableActionId } from '../../lib/tiptap/tableToolbarActions'

const props = defineProps<{
  open: boolean
  actions: TableToolbarAction[]
  markdownMode: boolean
  maxHeightPx?: number
}>()

const emit = defineEmits<{
  select: [actionId: TableActionId]
  close: []
  'menu-el': [value: HTMLDivElement | null]
}>()

const rootEl = ref<HTMLDivElement | null>(null)

function syncRootEl() {
  emit('menu-el', rootEl.value)
}

onMounted(syncRootEl)
onUpdated(syncRootEl)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    void nextTick(() => {
      rootEl.value?.focus()
    })
  }
)

const GROUP_ORDER: TableActionGroup[] = ['rows', 'columns', 'header', 'table']
const GROUP_LABELS: Record<TableActionGroup, string> = {
  rows: 'Rows',
  columns: 'Columns',
  header: 'Header',
  table: 'Table'
}

const groupedActions = computed(() => GROUP_ORDER
  .map((group) => ({
    group,
    label: GROUP_LABELS[group],
    items: props.actions.filter((item) => item.group === group)
  }))
  .filter((entry) => entry.items.length > 0)
)

const toolbarStyle = computed(() => {
  if (!props.maxHeightPx || props.maxHeightPx <= 0) return {}
  return { maxHeight: `${props.maxHeightPx}px` }
})

const ICONS: Record<TableActionId, Component> = {
  add_row_before: ArrowUpIcon,
  add_row_after: ArrowDownIcon,
  delete_row: MinusIcon,
  add_col_before: ViewColumnsIcon,
  add_col_after: Bars3Icon,
  delete_col: MinusIcon,
  toggle_header_row: Bars3BottomLeftIcon,
  toggle_header_col: ViewColumnsIcon,
  toggle_header_cell: TableCellsIcon,
  delete_table: MinusIcon
}

function iconFor(action: TableToolbarAction): Component {
  return ICONS[action.id] ?? TableCellsIcon
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  emit('close')
}
</script>

<template>
  <div
    v-if="open"
    ref="rootEl"
    tabindex="-1"
    class="meditor-table-toolbar z-50 w-[320px] max-h-[72vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl outline-none dark:border-slate-700 dark:bg-slate-900"
    :style="toolbarStyle"
    @keydown="onKeydown"
  >
    <div class="mb-1 px-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      Table actions
      <span v-if="markdownMode" class="ml-1 font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">(Markdown mode)</span>
    </div>

    <div
      v-for="section in groupedActions"
      :key="section.group"
      class="mb-1.5 rounded-lg border border-slate-200/80 p-1 dark:border-slate-700/70"
    >
      <div class="mb-1 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{{ section.label }}</div>
      <button
        v-for="item in section.items"
        :key="item.id"
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
        :class="item.disabled
          ? 'cursor-not-allowed text-slate-400 dark:text-slate-600'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'"
        :data-action="item.id"
        :title="item.disabledReason ?? ''"
        :aria-disabled="item.disabled ? 'true' : 'false'"
        :disabled="item.disabled"
        @mousedown.prevent
        @click.stop.prevent="emit('select', item.id)"
      >
        <component :is="iconFor(item)" class="h-4 w-4 shrink-0" />
        <span class="truncate">{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>
