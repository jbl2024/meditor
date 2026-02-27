<script setup lang="ts">
import { onMounted, onUpdated, ref, watch } from 'vue'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  HashtagIcon,
  ListBulletIcon,
  NumberedListIcon,
  QueueListIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import type { BlockMenuActionItem } from '../../lib/tiptap/blockMenu/types'

const props = defineProps<{
  open: boolean
  index: number
  actions: BlockMenuActionItem[]
  convertActions: BlockMenuActionItem[]
}>()

const emit = defineEmits<{
  'update:index': [value: number]
  select: [item: BlockMenuActionItem]
  close: []
  'menu-el': [value: HTMLDivElement | null]
}>()

const rootEl = ref<HTMLDivElement | null>(null)
const convertOpen = ref(false)

function syncRootEl() {
  emit('menu-el', rootEl.value)
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    requestAnimationFrame(() => {
      rootEl.value?.focus()
    })
  }
)

onMounted(syncRootEl)
onUpdated(syncRootEl)

function onMenuKeydown(event: KeyboardEvent) {
  if (!props.open) return

  if (event.key === 'Escape') {
    event.preventDefault()
    convertOpen.value = false
    emit('close')
    return
  }

  if (!props.actions.length) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    let next = props.index
    for (let i = 0; i < props.actions.length; i += 1) {
      next = (next + 1) % props.actions.length
      if (!props.actions[next]?.disabled) break
    }
    emit('update:index', next)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    let next = props.index
    for (let i = 0; i < props.actions.length; i += 1) {
      next = (next - 1 + props.actions.length) % props.actions.length
      if (!props.actions[next]?.disabled) break
    }
    emit('update:index', next)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    const item = props.actions[props.index]
    if (!item || item.disabled) return
    emit('select', item)
  }
}

const ICONS: Record<string, unknown> = {
  insert_above: ArrowUpIcon,
  insert_below: ArrowDownIcon,
  move_up: ArrowUturnLeftIcon,
  move_down: ArrowUturnRightIcon,
  duplicate: DocumentDuplicateIcon,
  copy_anchor: ClipboardDocumentIcon,
  delete: TrashIcon,
  paragraph: DocumentTextIcon,
  heading1: HashtagIcon,
  heading2: HashtagIcon,
  heading3: HashtagIcon,
  bulletList: ListBulletIcon,
  orderedList: NumberedListIcon,
  taskList: QueueListIcon,
  codeBlock: DocumentTextIcon,
  blockquote: DocumentTextIcon,
}

function iconFor(item: BlockMenuActionItem) {
  if (item.turnIntoType) return ICONS[item.turnIntoType] ?? DocumentTextIcon
  return ICONS[item.actionId] ?? DocumentTextIcon
}
</script>

<template>
  <div
    v-if="props.open"
    ref="rootEl"
    tabindex="-1"
    class="meditor-block-menu z-40 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl outline-none dark:border-slate-700 dark:bg-slate-900"
    @keydown="onMenuKeydown"
    @mouseleave="convertOpen = false"
  >
    <button
      v-for="(item, idx) in props.actions"
      :key="item.id"
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm"
      :class="[
        item.disabled
          ? 'cursor-not-allowed text-slate-400 dark:text-slate-600'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
        idx === props.index && !item.disabled ? 'bg-slate-100 dark:bg-slate-800' : '',
      ]"
      @mouseenter="!item.disabled && emit('update:index', idx)"
      @mousedown.prevent
      @click.stop.prevent="!item.disabled && emit('select', item)"
    >
      <component :is="iconFor(item)" class="h-4 w-4 shrink-0" />
      <span class="truncate">{{ item.label }}</span>
    </button>

    <div class="relative">
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        @mouseenter="convertOpen = true"
        @mousedown.prevent
        @click.stop.prevent="convertOpen = !convertOpen"
      >
        <DocumentTextIcon class="h-4 w-4 shrink-0" />
        <span class="flex-1 truncate">Convert to</span>
        <ChevronRightIcon class="h-4 w-4 shrink-0" />
      </button>

      <div
        v-if="convertOpen"
        class="absolute left-full top-0 z-50 ml-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <button
          v-for="item in props.convertActions"
          :key="item.id"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm"
          :class="
            item.disabled
              ? 'cursor-not-allowed text-slate-400 dark:text-slate-600'
              : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
          "
          @mousedown.prevent
          @click.stop.prevent="!item.disabled && emit('select', item)"
        >
          <component :is="iconFor(item)" class="h-4 w-4 shrink-0" />
          <span class="truncate">{{ item.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
