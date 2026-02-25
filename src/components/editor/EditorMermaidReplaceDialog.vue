<script setup lang="ts">
const props = defineProps<{
  visible: boolean
  templateLabel: string
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()
</script>

<template>
  <div
    v-if="props.visible"
    class="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/45 px-4"
    @click.self="emit('cancel')"
  >
    <div class="w-full max-w-sm rounded-2xl border border-slate-300/80 bg-white p-4 shadow-xl dark:border-slate-700/80 dark:bg-slate-900">
      <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Replace Mermaid diagram?</h3>
      <p class="mt-1 text-xs text-slate-600 dark:text-slate-400">
        Replace current Mermaid content with template "{{ props.templateLabel }}"?
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-1.5 text-xs font-semibold text-white"
          @click="emit('confirm')"
        >
          Replace
        </button>
      </div>
    </div>
  </div>
</template>
