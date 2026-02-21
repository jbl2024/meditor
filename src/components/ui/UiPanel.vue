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
      'rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 shadow-[0_18px_50px_rgba(2,6,23,0.45)] backdrop-blur-sm',
      className
    ]"
  >
    <slot />
  </section>
</template>
