<script setup lang="ts">
import { computed } from 'vue'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md'

const props = withDefaults(defineProps<{
  variant?: Variant
  size?: Size
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  className?: string
}>(), {
  variant: 'secondary',
  size: 'md',
  disabled: false,
  type: 'button',
  className: ''
})

const variantClass = computed(() => {
  if (props.variant === 'primary') {
    return 'border-[#003153]/75 bg-[#003153] text-white hover:bg-[#002744] dark:border-[#4a6f95]/75 dark:bg-[#4a6f95] dark:text-slate-950 dark:hover:bg-[#5a82ad]'
  }
  if (props.variant === 'ghost') {
    return 'border-slate-300/90 bg-transparent text-slate-700 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700/70 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100'
  }
  return 'border-slate-300/90 bg-white/90 text-slate-800 hover:bg-slate-100 dark:border-slate-600/70 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-700/80'
})

const sizeClass = computed(() => {
  if (props.size === 'sm') return 'h-8 px-3 text-xs'
  return 'h-10 px-4 text-sm'
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition duration-150',
      'disabled:cursor-not-allowed disabled:opacity-45',
      variantClass,
      sizeClass,
      className
    ]"
  >
    <slot />
  </button>
</template>
