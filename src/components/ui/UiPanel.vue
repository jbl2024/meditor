<script setup lang="ts">
withDefaults(defineProps<{
  className?: string
}>(), {
  className: ''
})
</script>

<template>
  <section
    :class="[
      'rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_18px_50px_rgba(148,163,184,0.22)] backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-900/70 dark:shadow-[0_18px_50px_rgba(2,6,23,0.45)]',
      className
    ]"
  >
    <slot />
  </section>
</template>
