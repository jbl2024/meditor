<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  className?: string
}>(), {
  placeholder: '',
  className: ''
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <input
    :value="props.modelValue"
    :placeholder="placeholder"
    :class="[
      'h-10 w-full rounded-xl border border-slate-300/90 bg-white/95 px-3 text-sm text-slate-900',
      'outline-none transition focus:border-cyan-500/70 focus:ring-2 focus:ring-cyan-500/25',
      'placeholder:text-slate-400 dark:border-slate-600/70 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:border-cyan-400/70 dark:focus:ring-cyan-400/30 dark:placeholder:text-slate-500',
      className
    ]"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
