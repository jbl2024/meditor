<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'confirm'): void
  (event: 'cancel'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
})
</script>

<template>
  <input
    ref="inputRef"
    class="h-7 w-full rounded-lg border border-slate-300/90 bg-white/95 px-2 text-xs text-slate-900 outline-none focus:border-[#003153]/70 focus:ring-2 focus:ring-[#003153]/20 dark:border-slate-600/70 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:border-[#4a6f95]/70 dark:focus:ring-[#4a6f95]/30"
    :value="props.modelValue"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    @keydown.enter.stop.prevent="emit('confirm')"
    @keydown.esc.stop.prevent="emit('cancel')"
    @blur="emit('confirm')"
  />
</template>
