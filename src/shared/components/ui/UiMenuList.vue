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

.ui-menu-list:deep(.ui-menu-item-icon) {
  width: 1rem;
  height: 1rem;
  flex: 0 0 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ui-menu-list:deep(.ui-menu-item-icon > svg) {
  width: 100%;
  height: 100%;
}

.ui-menu-list:deep(.ui-menu-item-icon-spacer) {
  width: 1rem;
  height: 1rem;
  flex: 0 0 1rem;
}

.ui-menu-list:deep(.ui-menu-item:hover:not(:disabled)) {
  background: var(--menu-hover-bg);
  color: var(--menu-text-strong);
}

.ui-menu-list:deep(.ui-menu-item[data-active='true']) {
  background: var(--menu-active-bg);
  color: var(--menu-active-text);
}

.ui-menu-list:deep(.ui-menu-item[data-tone='accent']) {
  color: var(--menu-active-text);
}

.ui-menu-list:deep(.ui-menu-item[data-tone='accent']:hover:not(:disabled)) {
  background: var(--menu-active-bg);
  color: var(--menu-active-text);
}

.ui-menu-list:deep(.ui-menu-item[data-tone='accent'][data-active='true']) {
  background: var(--menu-active-bg);
  color: var(--menu-active-text);
}

.ui-menu-list:deep(.ui-menu-item[data-tone='danger']) {
  color: var(--danger);
}

.ui-menu-list:deep(.ui-menu-item[data-tone='danger']:hover:not(:disabled)) {
  background: color-mix(in srgb, var(--danger) 10%, var(--surface-bg));
  color: var(--danger);
}

.ui-menu-list:deep(.ui-menu-item[data-tone='danger'][data-active='true']) {
  background: color-mix(in srgb, var(--danger) 12%, var(--surface-bg));
  color: var(--danger);
}

.ui-menu-list:deep(.ui-menu-item:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
