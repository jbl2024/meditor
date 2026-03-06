<script setup lang="ts">
import UiButton from '../ui/UiButton.vue'

/**
 * ShortcutsModal
 *
 * Purpose:
 * - Render filterable keyboard shortcut documentation.
 */

type ShortcutSection = {
  title: string
  items: Array<{ keys: string; action: string }>
}

defineProps<{
  visible: boolean
  filterQuery: string
  sections: ShortcutSection[]
}>()

const emit = defineEmits<{
  close: []
  'update:filterQuery': [value: string]
}>()
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
    <div
      class="modal shortcuts-modal"
      data-modal="shortcuts"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      aria-describedby="shortcuts-description"
      tabindex="-1"
    >
      <h3 id="shortcuts-title" class="confirm-title">Keyboard Shortcuts</h3>
      <p id="shortcuts-description" class="sr-only">Browse and filter keyboard shortcuts.</p>
      <input
        :value="filterQuery"
        data-shortcuts-filter="true"
        class="tool-input shortcuts-filter-input"
        placeholder="Filter shortcuts (ex: zoom, save, Ctrl+P)"
        @input="emit('update:filterQuery', ($event.target as HTMLInputElement).value)"
      />
      <div class="shortcuts-sections">
        <section v-for="section in sections" :key="section.title" class="shortcuts-section">
          <h4 class="shortcuts-title">{{ section.title }}</h4>
          <div class="shortcuts-grid">
            <template v-for="item in section.items" :key="`${section.title}-${item.keys}-${item.action}`">
              <span class="shortcut-keys">{{ item.keys }}</span>
              <span class="shortcut-action">{{ item.action }}</span>
            </template>
          </div>
        </section>
        <div v-if="!sections.length" class="placeholder">No matching shortcuts</div>
      </div>
      <div class="confirm-actions">
        <UiButton size="sm" @click="emit('close')">Close</UiButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shortcuts-modal {
  width: min(900px, calc(100vw - 32px));
  max-height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcuts-filter-input {
  flex: 0 0 auto;
}

.shortcuts-sections {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 2px;
  overflow: auto;
  padding-right: 4px;
}

.shortcuts-section {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  min-width: 0;
}

:global(.ide-root.dark) .shortcuts-section {
  border-color: #3e4451;
}

.shortcuts-title {
  margin: 0 0 8px;
  font-size: 12px;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

:global(.ide-root.dark) .shortcuts-title {
  color: #5c6370;
}

.shortcuts-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 12px;
  align-items: start;
}

.shortcut-keys {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 11px;
  color: #0f172a;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 3px 6px;
  white-space: nowrap;
}

:global(.ide-root.dark) .shortcut-keys {
  color: #abb2bf;
  background: #21252b;
  border-color: #3e4451;
}

.shortcut-action {
  font-size: 12px;
  color: #334155;
}

:global(.ide-root.dark) .shortcut-action {
  color: #cbd5e1;
}
</style>
