<script setup lang="ts">
import { ExclamationTriangleIcon, StarIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import type { FavoriteEntry } from '../../../shared/api/apiTypes'

/**
 * FavoritesListPanel
 *
 * Purpose:
 * - Render a flat favorites list with missing-entry cleanup controls.
 */

defineProps<{
  items: FavoriteEntry[]
  activePath: string
  loading: boolean
  toRelativePath: (path: string) => string
}>()

const emit = defineEmits<{
  open: [path: string]
  remove: [path: string]
}>()
</script>

<template>
  <div class="favorites-panel panel-fill">
    <div v-if="loading" class="placeholder">Loading favorites…</div>
    <div v-else-if="!items.length" class="placeholder">
      No favorites yet. Use the command palette to add the active note.
    </div>
    <ul v-else class="favorites-list" aria-label="Favorites list">
      <li v-for="item in items" :key="item.path" class="favorites-row-wrapper">
        <button
          type="button"
          class="favorites-row"
          :class="{
            'favorites-row--active': activePath === item.path,
            'favorites-row--missing': !item.exists
          }"
          :disabled="!item.exists"
          @click="item.exists ? emit('open', item.path) : undefined"
        >
          <span class="favorites-row-indicator" aria-hidden="true"></span>
          <span class="favorites-row-icon" aria-hidden="true">
            <StarIcon v-if="item.exists" />
            <ExclamationTriangleIcon v-else />
          </span>
          <span class="favorites-row-content">
            <span class="favorites-row-label">{{ toRelativePath(item.path) }}</span>
            <span v-if="!item.exists" class="favorites-row-meta">Missing</span>
          </span>
        </button>
        <button
          v-if="!item.exists"
          type="button"
          class="favorites-row-remove"
          :aria-label="`Remove favorite ${toRelativePath(item.path)}`"
          @click="emit('remove', item.path)"
        >
          <XMarkIcon />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.favorites-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.favorites-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
}

.favorites-row-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.favorites-row {
  flex: 1;
  min-width: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--explorer-row-text);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  text-align: left;
}

.favorites-row:hover:not(:disabled) {
  background: var(--explorer-row-hover-bg);
  color: var(--explorer-row-hover-text);
}

.favorites-row:disabled {
  cursor: default;
}

.favorites-row--active {
  background: var(--explorer-row-active-bg);
  color: var(--explorer-row-active-text);
}

.favorites-row--missing {
  color: var(--text-dim);
  background: color-mix(in srgb, var(--shell-chrome-bg) 88%, var(--danger, #c2410c) 12%);
}

.favorites-row-indicator {
  width: 3px;
  align-self: stretch;
  border-radius: 999px;
  background: transparent;
}

.favorites-row--active .favorites-row-indicator {
  background: var(--explorer-row-indicator);
}

.favorites-row-icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.favorites-row-icon :deep(svg) {
  width: 16px;
  height: 16px;
  stroke-width: 1.6;
}

.favorites-row-content {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.favorites-row-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorites-row-meta {
  border: 1px solid var(--shell-chrome-border);
  border-radius: 999px;
  padding: 1px 6px;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.favorites-row-remove {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.favorites-row-remove:hover {
  background: var(--explorer-row-hover-bg);
  color: var(--explorer-row-hover-text);
}

.favorites-row-remove :deep(svg) {
  width: 14px;
  height: 14px;
  stroke-width: 1.8;
}
</style>
