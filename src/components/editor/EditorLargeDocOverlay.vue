<script setup lang="ts">
const props = defineProps<{
  visible: boolean
  stageLabel: string
  progressPercent: number
  progressIndeterminate: boolean
  stats: { chars: number; lines: number } | null
}>()
</script>

<template>
  <div
    v-if="props.visible"
    class="pointer-events-none absolute inset-0 z-30 flex items-start justify-center bg-white/75 px-6 py-6 backdrop-blur-[1px] dark:bg-slate-950/75"
  >
    <div class="pointer-events-auto w-full max-w-md rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/95">
      <div class="text-sm font-medium text-slate-800 dark:text-slate-100">Loading large document</div>
      <div class="mt-1 text-xs text-slate-600 dark:text-slate-300">{{ props.stageLabel }}</div>
      <div v-if="props.stats" class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        {{ props.stats.lines.toLocaleString() }} lines · {{ props.stats.chars.toLocaleString() }} chars
      </div>
      <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          class="h-full rounded-full bg-blue-600 transition-[width] duration-200 ease-out dark:bg-blue-500"
          :class="{ 'meditor-load-indeterminate': props.progressIndeterminate }"
          :style="props.progressIndeterminate ? undefined : { width: `${props.progressPercent}%` }"
        ></div>
      </div>
      <div class="mt-2 text-right text-[11px] text-slate-600 dark:text-slate-300">
        {{ props.progressIndeterminate ? 'Working...' : `${props.progressPercent}%` }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.meditor-load-indeterminate {
  width: 45%;
  background-image: linear-gradient(90deg, #2563eb 0%, #3b82f6 50%, #2563eb 100%);
  background-size: 200% 100%;
  animation: meditor-load-slide 1.1s linear infinite;
}

@keyframes meditor-load-slide {
  from {
    transform: translateX(-120%);
    background-position: 0% 0%;
  }
  to {
    transform: translateX(260%);
    background-position: 100% 0%;
  }
}
</style>
