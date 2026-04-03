<script setup lang="ts">
import { computed } from 'vue'
import UiButton from '../../../../shared/components/ui/UiButton.vue'
import UiModalShell from '../../../../shared/components/ui/UiModalShell.vue'
import UiPanel from '../../../../shared/components/ui/UiPanel.vue'
import type { NoteHistoryEntry } from '../../../../shared/api/apiTypes'
import { buildNoteHistoryComparison } from '../../lib/noteHistoryComparison'

/**
 * EditorNoteHistoryDialog
 *
 * Presentational modal for note history browsing and restore actions.
 * It keeps rendering concerns local and receives all data via props.
 */
const props = defineProps<{
  open: boolean
  pathLabel: string
  loading: boolean
  error: string
  entries: NoteHistoryEntry[]
  selectedSnapshotId: string
  currentContent: string
  snapshotContent: string
  currentUnavailableMessage: string
  snapshotLoading: boolean
  restorePending: boolean
  restoreDisabledReason: string
  currentIsDirty: boolean
}>()

const emit = defineEmits<{
  close: []
  'select-snapshot': [snapshotId: string]
  'restore-selected': []
}>()

const selectedEntry = computed(() =>
  props.entries.find((entry) => entry.snapshotId === props.selectedSnapshotId) ?? null
)

const comparison = computed(() =>
  buildNoteHistoryComparison(props.currentContent, props.snapshotContent)
)

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString()
}

function renderLines(lines: Array<{ text: string; changed: boolean }>) {
  return lines.map((line, index) => ({
    ...line,
    index: index + 1
  }))
}

const currentLines = computed(() => renderLines(comparison.value.currentLines))
const snapshotLines = computed(() => renderLines(comparison.value.snapshotLines))
</script>

<template>
  <UiModalShell
    :model-value="open"
    title="Note history"
    :description="pathLabel"
    width="xl"
    panel-class="editor-note-history-modal"
    @update:model-value="emit('close')"
    @close="emit('close')"
  >
    <div class="note-history-layout">
      <UiPanel tone="subtle" class-name="note-history-sidebar">
        <div class="note-history-sidebar-head">
          <div>
            <p class="note-history-kicker">Snapshots</p>
            <p class="note-history-muted">
              {{ loading ? 'Loading history...' : `${entries.length} saved version${entries.length === 1 ? '' : 's'}` }}
            </p>
          </div>
        </div>
        <div v-if="error" class="note-history-error">{{ error }}</div>
        <div v-else-if="!entries.length && !loading" class="note-history-empty">
          No snapshot has been recorded yet for this note.
        </div>
        <div v-else class="note-history-list" role="list" :aria-busy="loading ? 'true' : undefined">
          <button
            v-for="entry in entries"
            :key="entry.snapshotId"
            type="button"
            class="note-history-row"
            :class="{ 'note-history-row--active': entry.snapshotId === selectedSnapshotId }"
            @click="emit('select-snapshot', entry.snapshotId)"
          >
            <span class="note-history-row-main">
              <strong>{{ formatTimestamp(entry.createdAtMs) }}</strong>
              <span>{{ entry.reason }}</span>
            </span>
            <span class="note-history-row-meta">
              <span>{{ entry.contentSize }} bytes</span>
              <span>{{ entry.snapshotId.slice(0, 16) }}</span>
            </span>
          </button>
        </div>
      </UiPanel>

      <div class="note-history-main">
        <UiPanel class-name="note-history-summary">
          <div class="note-history-summary-head">
            <div>
              <p class="note-history-kicker">Compare</p>
              <h4>{{ selectedEntry ? formatTimestamp(selectedEntry.createdAtMs) : 'Select a snapshot' }}</h4>
            </div>
            <div class="note-history-summary-actions">
              <UiButton
                variant="danger"
                size="sm"
                :disabled="!selectedEntry || restorePending || Boolean(restoreDisabledReason)"
                :loading="restorePending"
                @click="emit('restore-selected')"
              >
                Restore version
              </UiButton>
            </div>
          </div>
          <div v-if="restoreDisabledReason" class="note-history-warning">{{ restoreDisabledReason }}</div>
          <div v-else-if="currentIsDirty" class="note-history-warning">
            Save or discard current changes before restoring a snapshot.
          </div>
          <div v-else-if="currentUnavailableMessage" class="note-history-warning">
            {{ currentUnavailableMessage }}
          </div>
          <div v-else-if="snapshotLoading" class="note-history-muted">
            Loading the selected snapshot...
          </div>
          <p class="note-history-muted">
            Changed lines are highlighted in the middle block only. This keeps the compare simple and readable.
          </p>
        </UiPanel>

        <div class="note-history-compare">
          <UiPanel class-name="note-history-compare-panel">
            <div class="note-history-compare-head">
              <strong>Current file</strong>
              <span>{{ comparison.currentLineCount }} line{{ comparison.currentLineCount === 1 ? '' : 's' }}</span>
            </div>
            <div class="note-history-compare-body">
              <div
                v-for="line in currentLines"
                :key="`current-${line.index}`"
                class="note-history-line"
                :class="{ 'note-history-line--changed': line.changed }"
              >
                <span class="note-history-line-number">{{ line.index }}</span>
                <span class="note-history-line-text">{{ line.text || ' ' }}</span>
              </div>
            </div>
          </UiPanel>

          <UiPanel class-name="note-history-compare-panel">
            <div class="note-history-compare-head">
              <strong>Selected snapshot</strong>
              <span>{{ comparison.snapshotLineCount }} line{{ comparison.snapshotLineCount === 1 ? '' : 's' }}</span>
            </div>
            <div class="note-history-compare-body">
              <div
                v-for="line in snapshotLines"
                :key="`snapshot-${line.index}`"
                class="note-history-line"
                :class="{ 'note-history-line--changed': line.changed }"
              >
                <span class="note-history-line-number">{{ line.index }}</span>
                <span class="note-history-line-text">{{ line.text || ' ' }}</span>
              </div>
            </div>
          </UiPanel>
        </div>
      </div>
    </div>
  </UiModalShell>
</template>

<style scoped>
:deep(.ui-modal-shell__panel.editor-note-history-modal) {
  width: min(96vw, 96rem);
  max-width: none;
  margin-top: -2rem;
  max-height: calc(100vh - 3rem);
}

:deep(.ui-modal-shell__panel.editor-note-history-modal .ui-modal-shell__body) {
  min-height: 0;
  padding-block: 0.875rem 0.875rem;
}

.note-history-layout {
  display: grid;
  grid-template-columns: 20rem minmax(0, 1fr);
  gap: 1rem;
  min-height: 0;
  align-items: stretch;
  min-height: min(72vh, 44rem);
}

.note-history-sidebar,
.note-history-summary,
.note-history-compare-panel {
  min-height: 0;
}

.note-history-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: min(68vh, 42rem);
}

.note-history-sidebar-head,
.note-history-summary-head,
.note-history-compare-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.note-history-kicker {
  margin: 0;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.note-history-muted,
.note-history-empty,
.note-history-warning,
.note-history-error {
  font-size: 0.82rem;
}

.note-history-muted,
.note-history-empty {
  color: var(--text-dim);
}

.note-history-warning {
  color: var(--warning);
}

.note-history-error {
  color: var(--danger);
}

.note-history-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  overflow: auto;
  min-height: 0;
}

.note-history-row {
  border: 1px solid var(--border-subtle);
  border-radius: 0.7rem;
  background: var(--surface-bg);
  padding: 0.65rem 0.75rem;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  cursor: pointer;
}

.note-history-row:hover {
  border-color: var(--border-strong);
}

.note-history-row--active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
}

.note-history-row-main,
.note-history-row-meta {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.note-history-row-meta {
  color: var(--text-dim);
}

.note-history-main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.75rem;
  min-height: 0;
  align-self: stretch;
  height: 100%;
}

.note-history-summary {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.note-history-summary h4 {
  margin: 0.1rem 0 0;
  font-size: 0.95rem;
  font-weight: 650;
}

.note-history-summary-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.note-history-compare {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.75rem;
  min-height: 0;
  align-items: stretch;
  flex: 1 1 auto;
}

.note-history-compare-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
  height: 100%;
}

.note-history-compare-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 0.7rem;
  background: var(--surface-bg);
  padding: 0.55rem 0;
}

.note-history-line {
  display: grid;
  grid-template-columns: 3.25rem minmax(0, 1fr);
  gap: 0.5rem;
  padding: 0.2rem 0.75rem;
  font-family: var(--font-code);
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.note-history-line--changed {
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.note-history-line-number {
  color: var(--text-dim);
  text-align: right;
  user-select: none;
}

.note-history-line-text {
  min-width: 0;
}

@media (max-width: 1080px) {
  .note-history-layout,
  .note-history-compare {
    grid-template-columns: 1fr;
  }
}
</style>
