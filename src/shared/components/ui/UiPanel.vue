<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'default' | 'subtle' | 'raised'
  className?: string
}>(), {
  tone: 'default',
  className: ''
})
</script>

<template>
  <section
    :class="[
      'ui-panel border p-4 backdrop-blur-sm',
      `ui-panel--${tone}`,
      className
    ]"
  >
    <slot />
  </section>
</template>

<style scoped>
.ui-panel {
  border-color: var(--panel-border);
  box-shadow: var(--panel-shadow);
  border-radius: var(--radius-xl);
}

.ui-panel--default {
  background: var(--panel-bg);
}

.ui-panel--subtle {
  background: var(--panel-subtle-bg);
}

.ui-panel--raised {
  background: var(--panel-raised-bg);
}
</style>
