<script setup lang="ts">
import UiButton from '../ui/UiButton.vue'
import type { IndexActivityRow, IndexLogFilter } from '../../lib/indexActivity'
import type { IndexRuntimeStatus } from '../../lib/api'

/**
 * IndexStatusModal
 *
 * Purpose:
 * - Render index runtime, progress, warnings, and recent activity.
 */

defineProps<{
  visible: boolean
  running: boolean
  busy: boolean
  runtimeStatus: IndexRuntimeStatus | null
  badgeLabel: string
  badgeClass: string
  showProgressBar: boolean
  progressPercent: number
  progressLabel: string
  progressSummary: string
  currentPathLabel: string
  modelStateClass: string
  modelStatusLabel: string
  showWarmupNote: boolean
  alert: { level: 'error' | 'warning'; title: string; message: string } | null
  logFilter: IndexLogFilter
  filteredRows: IndexActivityRow[]
  errorCount: number
  slowCount: number
  actionLabel: string
  formatDurationMs: (value: number | null) => string
  formatTimestamp: (value: number | null) => string
}>()

const emit = defineEmits<{
  close: []
  action: []
  'update:logFilter': [value: IndexLogFilter]
}>()
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
    <div
      class="modal confirm-modal index-status-modal"
      data-modal="index-status"
      role="dialog"
      aria-modal="true"
      aria-labelledby="index-status-title"
      tabindex="-1"
    >
      <h3 id="index-status-title" class="confirm-title">Index Status</h3>
      <div class="index-status-body">
        <section class="index-overview">
          <div class="index-overview-main">
            <span class="index-status-badge" :class="badgeClass">
              <span class="index-status-badge-dot"></span>
              {{ badgeLabel }}
            </span>
            <div
              v-if="showProgressBar"
              class="index-overview-progress-inline"
            >
              <div class="index-progress-track" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
                <div class="index-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
              </div>
              <div class="index-progress-meta">
                <span>{{ progressLabel }}</span>
                <span>{{ progressPercent }}%</span>
              </div>
            </div>
            <p v-else-if="progressSummary" class="index-overview-summary">{{ progressSummary }}</p>
            <p v-if="currentPathLabel" class="index-overview-current">
              Current: {{ currentPathLabel }}
            </p>
          </div>
        </section>

        <section class="index-model-card">
          <div class="index-model-head">
            <p class="index-model-label">Embedding model</p>
            <span class="index-model-state" :class="modelStateClass">{{ modelStatusLabel }}</span>
          </div>
          <p class="index-model-name">{{ runtimeStatus?.model_name || 'n/a' }}</p>
          <p v-if="runtimeStatus?.model_last_duration_ms != null" class="index-model-meta">
            Last init {{ formatDurationMs(runtimeStatus.model_last_duration_ms) }}
            <span v-if="runtimeStatus.model_last_finished_at_ms"> at {{ formatTimestamp(runtimeStatus.model_last_finished_at_ms) }}</span>
          </p>
          <p v-if="showWarmupNote" class="index-model-hint">
            First initialization can download model weights and take longer.
          </p>
        </section>

        <section v-if="alert" class="index-alert" :class="`index-alert-${alert.level}`">
          <div>
            <p class="index-alert-title">{{ alert.title }}</p>
            <p class="index-alert-message">{{ alert.message }}</p>
          </div>
          <UiButton
            v-if="!running"
            size="sm"
            variant="secondary"
            class-name="index-alert-action"
            :disabled="busy"
            @click="emit('action')"
          >
            Retry rebuild
          </UiButton>
        </section>

        <div class="index-status-sections">
          <div class="index-log-panel">
            <div class="index-log-header">
              <p class="index-log-title">Recent indexing activity</p>
              <div class="index-log-filters" role="tablist" aria-label="Index log filters">
                <button
                  type="button"
                  class="index-log-filter-btn"
                  :class="{ active: logFilter === 'all' }"
                  @click="emit('update:logFilter', 'all')"
                >
                  All
                </button>
                <button
                  type="button"
                  class="index-log-filter-btn"
                  :class="{ active: logFilter === 'errors' }"
                  @click="emit('update:logFilter', 'errors')"
                >
                  Errors ({{ errorCount }})
                </button>
                <button
                  type="button"
                  class="index-log-filter-btn"
                  :class="{ active: logFilter === 'slow' }"
                  @click="emit('update:logFilter', 'slow')"
                >
                  Slow >1s ({{ slowCount }})
                </button>
              </div>
            </div>
            <div v-if="!filteredRows.length" class="index-log-empty">No matching activity.</div>
            <div v-else class="index-log-list">
              <div
                v-for="row in filteredRows"
                :key="row.id"
                class="index-log-row"
                :class="`index-log-row-${row.state}`"
              >
                <span class="index-log-time">{{ row.timeLabel }}</span>
                <div class="index-log-copy">
                  <p class="index-log-main">
                    <span class="index-log-state-icon" aria-hidden="true">{{ row.state === 'done' ? '✅' : row.state === 'error' ? '⚠️' : '⏳' }}</span>
                    <span>{{ row.title }}</span>
                  </p>
                  <p v-if="row.path" class="index-log-path">
                    <span v-if="row.directory" class="index-log-dir">{{ row.directory }}/</span><strong>{{ row.fileName }}</strong>
                  </p>
                  <p v-if="row.detail" class="index-log-detail">{{ row.detail }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="confirm-actions">
        <UiButton
          size="sm"
          :variant="running ? 'secondary' : 'primary'"
          :class-name="running ? 'index-stop-btn' : ''"
          :disabled="busy"
          @click="emit('action')"
        >
          {{ actionLabel }}
        </UiButton>
        <UiButton size="sm" @click="emit('close')">Close</UiButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.index-status-modal {
  width: min(980px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at 0% 0%, rgba(191, 219, 254, 0.22), transparent 42%),
    radial-gradient(circle at 100% 100%, rgba(254, 215, 170, 0.18), transparent 36%),
    #f9fbff;
}

:global(.ide-root.dark) .index-status-modal {
  background:
    radial-gradient(circle at 0% 0%, rgba(30, 64, 175, 0.2), transparent 38%),
    radial-gradient(circle at 100% 100%, rgba(120, 53, 15, 0.16), transparent 42%),
    #1f2430;
}

.index-status-body {
  min-height: 0;
  overflow: auto;
  padding-right: 6px;
}

.index-overview {
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.88);
  padding: 12px;
  margin-bottom: 10px;
}

:global(.ide-root.dark) .index-overview {
  border-color: #334155;
  background: rgba(30, 41, 59, 0.72);
}

.index-overview-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.index-overview-progress-inline {
  flex: 1 1 260px;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.index-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
}

.index-status-badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.index-badge-ready {
  background: #dcfce7;
  color: #166534;
}

.index-badge-ready .index-status-badge-dot {
  background: #22c55e;
}

.index-badge-running {
  background: #dbeafe;
  color: #1d4ed8;
}

.index-badge-running .index-status-badge-dot {
  background: #2563eb;
  animation: indexStatusPulse 1.2s ease-in-out infinite;
}

.index-badge-error {
  background: #ffedd5;
  color: #9a3412;
}

.index-badge-error .index-status-badge-dot {
  background: #f97316;
}

.index-overview-summary {
  margin: 0;
  font-size: 12px;
  color: #1f2937;
  font-weight: 600;
}

.index-overview-current {
  margin: 0;
  width: 100%;
  font-size: 11px;
  color: #64748b;
}

:global(.ide-root.dark) .index-overview-summary {
  color: #e2e8f0;
}

:global(.ide-root.dark) .index-overview-current {
  color: #94a3b8;
}

.index-progress-track {
  margin-top: 10px;
  width: 100%;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: #e2e8f0;
}

:global(.ide-root.dark) .index-progress-track {
  background: #334155;
}

.index-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%);
  transition: width 180ms ease;
}

.index-progress-meta {
  margin-top: 6px;
  font-size: 11px;
  color: #475569;
  display: flex;
  justify-content: space-between;
}

.index-overview-progress-inline .index-progress-track,
.index-overview-progress-inline .index-progress-meta {
  margin-top: 0;
}

:global(.ide-root.dark) .index-progress-meta {
  color: #94a3b8;
}

.index-model-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.84);
  margin-bottom: 10px;
}

:global(.ide-root.dark) .index-model-card {
  border-color: #3e4451;
  background: rgba(30, 41, 59, 0.68);
}

.index-model-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.index-model-label {
  margin: 0;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  font-weight: 700;
}

.index-model-state {
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 700;
}

.index-model-ready {
  color: #166534;
  background: #dcfce7;
}

.index-model-busy {
  color: #1d4ed8;
  background: #dbeafe;
}

.index-model-failed {
  color: #9a3412;
  background: #ffedd5;
}

.index-model-idle {
  color: #334155;
  background: #e2e8f0;
}

.index-model-name {
  margin: 7px 0 0;
  font-size: 12px;
  color: #111827;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
}

.index-model-meta {
  margin: 6px 0 0;
  font-size: 11px;
  color: #64748b;
}

.index-model-hint {
  margin: 5px 0 0;
  font-size: 11px;
  color: #64748b;
}

:global(.ide-root.dark) .index-model-label,
:global(.ide-root.dark) .index-model-meta,
:global(.ide-root.dark) .index-model-hint {
  color: #94a3b8;
}

:global(.ide-root.dark) .index-model-name {
  color: #f1f5f9;
}

.index-alert {
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.index-alert-error {
  border: 1px solid #fdba74;
  background: #fff7ed;
}

.index-alert-warning {
  border: 1px solid #fcd34d;
  background: #fffbeb;
}

:global(.ide-root.dark) .index-alert-error {
  border-color: #ea580c;
  background: rgba(124, 45, 18, 0.28);
}

:global(.ide-root.dark) .index-alert-warning {
  border-color: #ca8a04;
  background: rgba(113, 63, 18, 0.28);
}

.index-alert-title {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: #9a3412;
}

.index-alert-message {
  margin: 3px 0 0;
  font-size: 11px;
  color: #7c2d12;
}

.index-alert-action {
  white-space: nowrap;
}

:global(.ide-root.dark) .index-alert-title {
  color: #fed7aa;
}

:global(.ide-root.dark) .index-alert-message {
  color: #fdba74;
}

.index-status-sections {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.index-log-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.86);
}

:global(.ide-root.dark) .index-log-panel {
  border-color: #3e4451;
  background: rgba(30, 41, 59, 0.72);
}

.index-log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.index-log-filters {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.index-log-filter-btn {
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #ffffff;
  color: #475569;
  padding: 3px 9px;
  font-size: 10px;
  line-height: 1.3;
}

.index-log-filter-btn.active {
  border-color: #2563eb;
  color: #1d4ed8;
  background: #dbeafe;
}

:global(.ide-root.dark) .index-log-filter-btn {
  border-color: #475569;
  color: #cbd5e1;
  background: #1e293b;
}

:global(.ide-root.dark) .index-log-filter-btn.active {
  border-color: #60a5fa;
  color: #bfdbfe;
  background: #1e3a8a;
}

.index-log-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

:global(.ide-root.dark) .index-log-title {
  color: #e2e8f0;
}

.index-log-empty {
  margin: 0;
  font-size: 11px;
  color: #64748b;
}

.index-log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 260px;
  margin-top: 8px;
  padding-right: 4px;
  overflow: auto;
}

.index-log-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px;
  align-items: start;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.72);
}

.index-log-row-running {
  border-color: #bfdbfe;
}

.index-log-row-error {
  border-color: #fdba74;
}

:global(.ide-root.dark) .index-log-row {
  border-color: #3e4451;
  background: rgba(30, 41, 59, 0.52);
}

:global(.ide-root.dark) .index-log-row-running {
  border-color: #2563eb;
}

:global(.ide-root.dark) .index-log-row-error {
  border-color: #ea580c;
}

.index-log-time {
  font-size: 10px;
  line-height: 1.2;
  color: #64748b;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
}

.index-log-copy {
  min-width: 0;
}

.index-log-main {
  margin: 0;
  font-size: 11px;
  color: #1f2937;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.index-log-state-icon {
  width: 14px;
  text-align: center;
}

.index-log-path {
  margin: 2px 0 0;
  font-size: 11px;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.index-log-dir {
  color: #64748b;
}

.index-log-detail {
  margin: 2px 0 0;
  font-size: 10px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:global(.ide-root.dark) .index-log-empty,
:global(.ide-root.dark) .index-log-time,
:global(.ide-root.dark) .index-log-detail {
  color: #94a3b8;
}

:global(.ide-root.dark) .index-log-path {
  color: #e2e8f0;
}

:global(.ide-root.dark) .index-log-dir {
  color: #94a3b8;
}

:global(.ide-root.dark) .index-log-main {
  color: #e2e8f0;
}

.index-stop-btn {
  border-color: #dc2626 !important;
  background: #fef2f2 !important;
  color: #b91c1c !important;
}

:global(.ide-root.dark) .index-stop-btn {
  border-color: #ef4444 !important;
  background: rgba(127, 29, 29, 0.36) !important;
  color: #fecaca !important;
}

@keyframes indexStatusPulse {
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

@media (max-width: 980px) {
  .index-status-modal {
    width: min(760px, calc(100vw - 20px));
  }

  .index-overview-main {
    align-items: flex-start;
  }

  .index-alert {
    flex-direction: column;
  }

  .index-log-header {
    align-items: flex-start;
  }

  .index-log-list {
    height: 220px;
  }

  .index-log-row {
    grid-template-columns: 1fr;
  }

  .index-log-time {
    white-space: normal;
  }
}
</style>
