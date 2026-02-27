<script setup lang="ts">
import { onMounted, onUpdated, ref } from 'vue'

type WikilinkItem = {
  id: string
  label: string
  target: string
  isCreate: boolean
}

const props = defineProps<{
  open: boolean
  index: number
  left: number
  top: number
  results: WikilinkItem[]
}>()

const emit = defineEmits<{
  'update:index': [value: number]
  select: [target: string]
  'menu-el': [value: HTMLDivElement | null]
}>()

const rootEl = ref<HTMLDivElement | null>(null)

function syncRootEl() {
  emit('menu-el', rootEl.value)
}

onMounted(syncRootEl)
onUpdated(syncRootEl)
</script>

<template>
  <div
    v-if="props.open"
    ref="rootEl"
    class="absolute z-20 w-80 max-w-[calc(100%-1rem)] rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900"
    :style="{ left: `${props.left}px`, top: `${props.top}px` }"
  >
    <button
      v-for="(item, idx) in props.results"
      :key="item.id"
      type="button"
      class="block w-full min-w-0 overflow-hidden rounded px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
      :class="
        idx === props.index
          ? 'bg-slate-100 ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:ring-slate-600'
          : ''
      "
      :title="item.label"
      @mousedown.prevent="emit('update:index', idx)"
      @click.stop.prevent="emit('select', item.target)"
    >
      <span class="block min-w-0 truncate">{{ item.label }}</span>
    </button>
    <div v-if="!props.results.length" class="px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400">No matches</div>
  </div>
</template>
