<script setup lang="ts">
import { onMounted, onUpdated, ref, watch } from 'vue'
import type { BlockMenuActionItem } from '../../lib/tiptap/blockMenu/types'

const props = defineProps<{
  open: boolean
  index: number
  actions: BlockMenuActionItem[]
}>()

const emit = defineEmits<{
  'update:index': [value: number]
  select: [item: BlockMenuActionItem]
  close: []
  'menu-el': [value: HTMLDivElement | null]
}>()

const rootEl = ref<HTMLDivElement | null>(null)

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
</script>

<template>
  <div
    v-if="props.open"
    ref="rootEl"
    tabindex="-1"
    class="meditor-block-menu z-40 w-56 rounded-md border border-slate-200 bg-white p-1 shadow-xl outline-none dark:border-slate-700 dark:bg-slate-900"
    @keydown="onMenuKeydown"
  >
    <button
      v-for="(item, idx) in props.actions"
      :key="item.id"
      type="button"
      class="block w-full rounded px-3 py-1.5 text-left text-sm"
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
      {{ item.label }}
    </button>
  </div>
</template>
