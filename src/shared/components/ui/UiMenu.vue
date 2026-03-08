<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{
  className?: string
}>(), {
  className: ''
})

const rootEl = ref<HTMLElement | null>(null)

defineExpose({
  rootEl,
  getRootEl: () => rootEl.value
})
</script>

<template>
  <div ref="rootEl" :class="['ui-menu', className]" role="menu">
    <slot />
  </div>
</template>

<style scoped>
.ui-menu {
  border: 1px solid var(--menu-border);
  border-radius: var(--radius-lg);
  background: var(--menu-bg);
  box-shadow: var(--menu-shadow);
  padding: 0.375rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
</style>
