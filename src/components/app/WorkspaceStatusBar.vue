<script setup lang="ts">
/**
 * WorkspaceStatusBar
 *
 * Purpose:
 * - Render the compact app status footer.
 */

defineProps<{
  activeFileLabel: string
  activeStateLabel: string
  indexStateLabel: string
  indexStateClass: string
  workspaceLabel: string
}>()

const emit = defineEmits<{
  'open-index-status': []
}>()
</script>

<template>
  <footer class="status-bar">
    <span class="status-item">{{ activeFileLabel }}</span>
    <span class="status-item status-item-state">{{ activeStateLabel }}</span>
    <button type="button" class="status-item status-item-index status-trigger" :class="indexStateClass" @click="emit('open-index-status')">
      <span class="status-dot" :class="indexStateClass"></span>
      <span>index: {{ indexStateLabel }}</span>
    </button>
    <span class="status-item">workspace: {{ workspaceLabel }}</span>
  </footer>
</template>

<style scoped>
.status-bar {
  height: 22px;
  border-top: 1px solid #e5e7eb;
  background: #f2f4f8;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  color: #4b5563;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0;
  overflow-x: auto;
}

:global(.ide-root.dark) .status-bar {
  border-top-color: #3e4451;
  background: #21252b;
  color: #8b93a3;
}

.status-item {
  display: inline-flex;
  align-items: center;
  height: 100%;
  padding: 0 8px;
  white-space: nowrap;
}

.status-trigger {
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.status-trigger:hover {
  filter: brightness(0.94);
}

.status-item-state {
  width: 10ch;
  justify-content: center;
}

.status-item-index {
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
  background: #94a3b8;
}

.status-dot.status-item-indexing {
  background: #2563eb;
  animation: statusPulse 1.2s ease-in-out infinite;
}

.status-dot.status-item-indexed {
  background: #22c55e;
}

.status-dot.status-item-out-of-sync {
  background: #f97316;
}

:global(.ide-root.dark) .status-dot.status-item-indexing {
  background: #60a5fa;
}

:global(.ide-root.dark) .status-dot.status-item-indexed {
  background: #4ade80;
}

:global(.ide-root.dark) .status-dot.status-item-out-of-sync {
  background: #fb923c;
}

.status-item + .status-item {
  border-left: 1px solid #cbd5e1;
}

:global(.ide-root.dark) .status-item + .status-item {
  border-left-color: #3e4451;
}

@keyframes statusPulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.9);
  }

  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}
</style>
