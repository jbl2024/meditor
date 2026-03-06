<script setup lang="ts">
/**
 * Presentational Echoes panel for the note-side context surface.
 */
import {
  ArrowUturnLeftIcon,
  ClockIcon,
  LinkIcon,
  SparklesIcon
} from '@heroicons/vue/24/outline'
import type { EchoesItem } from '../../lib/echoes'

const props = defineProps<{
  items: EchoesItem[]
  loading: boolean
  error: string
  hintVisible: boolean
  toRelativePath: (path: string) => string
}>()

const emit = defineEmits<{
  open: [path: string]
}>()

function compactRelativePath(path: string): string {
  const relative = props.toRelativePath(path)
  const segments = relative.split('/').filter(Boolean)
  if (segments.length <= 2) return relative
  return `.../${segments.slice(-2).join('/')}`
}

function reasonIcon(reason: string) {
  switch (reason) {
    case 'Direct link':
      return LinkIcon
    case 'Backlink':
      return ArrowUturnLeftIcon
    case 'Semantically related':
      return SparklesIcon
    case 'Recently active':
      return ClockIcon
    default:
      return LinkIcon
  }
}
</script>

<template>
  <section class="pane-card pane-section">
    <h3 class="section-title">Echoes</h3>
    <p v-if="hintVisible" class="echoes-helper">Relevant notes around what you're working on now.</p>
    <div v-if="loading" class="empty-state">Loading...</div>
    <div v-else-if="error" class="empty-state">{{ error }}</div>
    <div v-else-if="!items.length" class="empty-state">
      Echoes surfaces nearby notes when Tomosona finds strong local context.
    </div>
    <button
      v-for="item in items"
      v-else
      :key="`echo-${item.path}`"
      type="button"
      class="echoes-item"
      :title="props.toRelativePath(item.path)"
      @click="emit('open', item.path)"
    >
      <span class="echoes-item-main">
        <span class="echoes-item-title">{{ item.title }}</span>
        <span class="echoes-item-path">{{ compactRelativePath(item.path) }}</span>
      </span>
      <span class="echoes-item-meta">
        <span class="echoes-item-reasons">
          <span class="echoes-reason-icon-wrap" :title="item.reasonLabel">
            <component
              :is="reasonIcon(item.reasonLabel)"
              class="echoes-reason-icon"
            />
          </span>
          <span
            v-for="reason in item.reasonLabels.filter((reason) => reason !== item.reasonLabel).slice(0, 1)"
            :key="`${item.path}-${reason}`"
            class="echoes-reason-icon-wrap"
            :title="reason"
          >
            <component
              :is="reasonIcon(reason)"
              class="echoes-reason-icon echoes-reason-icon-secondary"
            />
          </span>
        </span>
      </span>
    </button>
  </section>
</template>

<style scoped>
.pane-card {
  position: relative;
  border-radius: 10px;
  background: #fbfcff;
  padding: 10px 8px 8px 10px;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.15);
  transition: box-shadow 160ms ease, background-color 160ms ease;
}

.pane-card:hover {
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.3);
}

.ide-root.dark .pane-card {
  background: #232a33;
  box-shadow: inset 0 0 0 1px rgba(71, 85, 105, 0.35);
}

.ide-root.dark .pane-card:hover {
  box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.45);
}

.pane-section {
  position: relative;
}

.section-title {
  margin: 2px 0 6px;
  font-size: 11px;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  font-weight: 600;
  color: #5b6472;
}

.ide-root.dark .section-title {
  color: #a8b3c4;
}

.empty-state {
  color: #8b93a3;
  font-size: 12px;
  line-height: 1.45;
  padding: 8px;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.08);
}

.ide-root.dark .empty-state {
  color: #9aa3b2;
  background: rgba(71, 85, 105, 0.26);
}

.echoes-helper {
  margin: 0 0 8px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.4;
}

.ide-root.dark .echoes-helper {
  color: #aab4c5;
}

.echoes-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 0;
  text-align: left;
  background: transparent;
  padding: 8px 8px;
  border-radius: 10px;
  margin: 4px 0;
  transition:
    background-color 140ms ease,
    box-shadow 140ms ease;
}

.echoes-item:hover {
  background: #eef2f8;
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.18);
}

.ide-root.dark .echoes-item:hover {
  background: #2f3845;
  box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.22);
}

.echoes-item-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.echoes-item-title,
.echoes-item-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.echoes-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #2d313a;
}

.ide-root.dark .echoes-item-title {
  color: #dbe3ee;
}

.echoes-item-path {
  font-size: 11px;
  color: #6b7280;
}

.ide-root.dark .echoes-item-path {
  color: #9aa7bb;
}

.echoes-item-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.echoes-item-reasons {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.echoes-reason-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.echoes-reason-icon {
  width: 16px;
  height: 16px;
  color: #64748b;
}

.echoes-reason-icon-secondary {
  color: #8b98aa;
}
.ide-root.dark .echoes-reason-icon {
  color: #aab4c5;
}

.ide-root.dark .echoes-reason-icon-secondary {
  color: #7f8da1;
}
</style>
