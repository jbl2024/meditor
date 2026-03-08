<script setup lang="ts">
withDefaults(defineProps<{
  className?: string
}>(), {
  className: ''
})
</script>

<template>
  <div :class="['ui-menu-list', className]">
    <slot />
  </div>
</template>

<style scoped>
.ui-menu-list {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.ui-menu-list:deep(.ui-menu-item) {
  width: 100%;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--menu-text);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 500;
  text-align: left;
}

.ui-menu-list:deep(.ui-menu-item:hover:not(:disabled)) {
  background: var(--menu-hover-bg);
  color: var(--menu-text-strong);
}

.ui-menu-list:deep(.ui-menu-item[data-active='true']) {
  background: var(--menu-active-bg);
  color: var(--menu-active-text);
}

.ui-menu-list:deep(.ui-menu-item:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
