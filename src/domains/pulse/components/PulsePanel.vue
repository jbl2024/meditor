<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDownIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import UiFilterableDropdown, { type FilterableDropdownItem } from '../../../shared/components/ui/UiFilterableDropdown.vue'
import { PULSE_APPLY_LABELS, type PulseActionSpec, type PulseApplyMode } from '../lib/pulse'
import { buildPulseDiff, renderPulseMarkdown } from '../lib/pulsePreview'

type PulsePanelState = 'configure' | 'running' | 'result' | 'error'
type PulsePreviewMode = 'diff' | 'preview' | 'markdown'

const TEXT_ACTION_IDS = new Set(['rewrite', 'condense', 'expand', 'change_tone'])

const props = defineProps<{
  title?: string
  sourceLabel?: string
  actionId: string
  actions: PulseActionSpec[]
  instruction: string
  previewMarkdown: string
  provenancePaths: string[]
  running: boolean
  error: string
  applyModes: PulseApplyMode[]
  primaryApplyMode?: PulseApplyMode
  compact?: boolean
  sourceText?: string
}>()

const emit = defineEmits<{
  'update:actionId': [value: string]
  'update:instruction': [value: string]
  run: []
  cancel: []
  close: []
  apply: [mode: PulseApplyMode]
}>()

const hasPreview = computed(() => props.previewMarkdown.trim().length > 0)
const canRun = computed(() => Boolean(props.actionId) && !props.running)
const activeAction = computed(() => props.actions.find((item) => item.id === props.actionId) ?? props.actions[0])
const panelState = computed<PulsePanelState>(() => {
  if (props.running) return 'running'
  if (props.error.trim()) return 'error'
  if (hasPreview.value) return 'result'
  return 'configure'
})
const isTextAction = computed(() => TEXT_ACTION_IDS.has(props.actionId))
const canShowDiff = computed(() => isTextAction.value && Boolean(props.sourceText?.trim()) && hasPreview.value)
const compactMenuOpen = ref(false)
const compactQuery = ref('')
const compactActiveIndex = ref(0)
const previewMode = ref<PulsePreviewMode>('preview')
const compactItems = computed<FilterableDropdownItem[]>(() =>
  props.actions.map((action) => ({
    id: action.id,
    label: action.label,
    description: action.description,
    aliases: [action.label, action.description, ...action.keywords]
  }))
)
const renderedPreviewHtml = computed(() => renderPulseMarkdown(props.previewMarkdown))
const diffSegments = computed(() => buildPulseDiff(props.sourceText ?? '', props.previewMarkdown))
const effectivePreviewMode = computed<PulsePreviewMode>(() => {
  if (previewMode.value === 'diff' && !canShowDiff.value) return 'preview'
  if (previewMode.value === 'preview' && !renderedPreviewHtml.value) return 'markdown'
  return previewMode.value
})
const applyModesVisible = computed(() => panelState.value === 'result' && !props.running)
const primaryApplyModeValue = computed(() => props.primaryApplyMode ?? props.applyModes[0] ?? null)
const helperText = computed(() => {
  if (panelState.value === 'running') return 'Pulse is generating a preview. Nothing is applied until you confirm.'
  if (panelState.value === 'result') return 'Review the result, then choose how to apply it.'
  return 'Will transform only the selected text. Nothing changes until you apply.'
})
function compactMatcher(item: FilterableDropdownItem, query: string): boolean {
  const tokens = Array.isArray(item.aliases) ? item.aliases.map((entry) => String(entry).toLowerCase()) : []
  return tokens.some((token) => token.includes(query))
}

function onCompactSelect(item: FilterableDropdownItem) {
  if (props.running) return
  emit('update:actionId', item.id)
}

function setPreviewMode(mode: PulsePreviewMode) {
  previewMode.value = mode
}

function onPromptKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    const mode = primaryApplyModeValue.value
    if (panelState.value === 'result' && mode) {
      event.preventDefault()
      emit('apply', mode)
      return
    }
    if (canRun.value) {
      event.preventDefault()
      emit('run')
    }
    return
  }
}

watch(
  () => props.previewMarkdown,
  () => {
    previewMode.value = canShowDiff.value ? 'diff' : 'preview'
  },
  { immediate: true }
)
</script>

<template>
  <section class="pulse-panel" :class="{ compact }" data-pulse-panel-state>
    <div class="pulse-compact-bar pulse-compact-bar--header">
      <UiFilterableDropdown
        class="pulse-compact-dropdown"
        :items="compactItems"
        :model-value="compactMenuOpen"
        :query="compactQuery"
        :active-index="compactActiveIndex"
        :matcher="compactMatcher"
        :show-filter="true"
        :disabled="running"
        :close-on-select="true"
        :menu-mode="'portal'"
        filter-placeholder="Filter Pulse actions..."
        @open-change="compactMenuOpen = $event"
        @query-change="compactQuery = $event"
        @active-index-change="compactActiveIndex = $event"
        @select="onCompactSelect($event)"
      >
        <template #trigger="{ toggleMenu, activeItem }">
          <button
            type="button"
            class="pulse-compact-trigger"
            :disabled="running"
            :title="activeAction?.description"
            @click="toggleMenu"
          >
            <span>{{ activeItem?.label || activeAction?.label || 'Action' }}</span>
            <ChevronDownIcon class="h-4 w-4" />
          </button>
        </template>
      </UiFilterableDropdown>

      <button type="button" class="pulse-close-btn" aria-label="Close Pulse" title="Close Pulse" @click="emit('close')">
        <XMarkIcon class="h-4 w-4" />
      </button>
    </div>

    <label class="pulse-field">
      <span>Prompt</span>
      <div class="pulse-input-surface">
        <textarea
          class="pulse-textarea"
          data-pulse-prompt="true"
          :value="instruction"
          :disabled="running"
          placeholder="Describe how Pulse should transform the selection..."
          @input="emit('update:instruction', ($event.target as HTMLTextAreaElement).value)"
          @keydown="onPromptKeydown"
        ></textarea>
      </div>
    </label>

    <p class="pulse-help">{{ helperText }}</p>

    <div class="pulse-actions">
      <button
        type="button"
        class="pulse-btn pulse-btn-strong"
        :disabled="!canRun"
        @click="emit('run')"
      >
        {{ panelState === 'result' ? 'Regenerate' : 'Generate' }}
      </button>
      <button v-if="running" type="button" class="pulse-btn" @click="emit('cancel')">Cancel</button>
    </div>

    <div class="pulse-section-divider" aria-hidden="true"></div>

    <div class="pulse-preview">
      <div class="pulse-preview-head">
        <strong>Preview</strong>
        <div v-if="panelState === 'result'" class="pulse-preview-tabs">
          <button
            v-if="canShowDiff"
            type="button"
            class="pulse-tab-btn"
            :data-active="effectivePreviewMode === 'diff'"
            @click="setPreviewMode('diff')"
          >
            Diff
          </button>
          <button
            type="button"
            class="pulse-tab-btn"
            :data-active="effectivePreviewMode === 'preview'"
            @click="setPreviewMode('preview')"
          >
            Preview
          </button>
          <button
            type="button"
            class="pulse-tab-btn"
            :data-active="effectivePreviewMode === 'markdown'"
            @click="setPreviewMode('markdown')"
          >
            Markdown
          </button>
        </div>
      </div>

      <div v-if="panelState === 'configure'" class="pulse-preview-body pulse-preview-empty">
        Choose an action, refine the prompt, then generate a preview.
      </div>

      <div v-else-if="panelState === 'running'" class="pulse-preview-body pulse-preview-loading">
        <div class="pulse-skeleton-line"></div>
        <div class="pulse-skeleton-line pulse-skeleton-line--short"></div>
        <div class="pulse-skeleton-line"></div>
        <p>Generating…</p>
      </div>

      <div v-else-if="panelState === 'error'" class="pulse-preview-body pulse-preview-error">
        {{ error }}
      </div>

      <div
        v-else-if="effectivePreviewMode === 'diff' && canShowDiff"
        class="pulse-preview-body pulse-diff"
        data-pulse-preview-mode="diff"
      >
        <span
          v-for="(segment, index) in diffSegments"
          :key="`${segment.kind}-${index}`"
          class="pulse-diff-segment"
          :class="`pulse-diff-segment--${segment.kind}`"
        >{{ segment.text }}</span>
      </div>

      <div
        v-else-if="effectivePreviewMode === 'preview' && renderedPreviewHtml"
        class="pulse-preview-body pulse-rendered-preview"
        data-pulse-preview-mode="preview"
        v-html="renderedPreviewHtml"
      ></div>

      <pre
        v-else
        class="pulse-preview-body pulse-raw-preview"
        data-pulse-preview-mode="markdown"
      >{{ previewMarkdown }}</pre>
    </div>

    <p v-if="provenancePaths.length" class="pulse-provenance">{{ provenancePaths.length }} source<span v-if="provenancePaths.length > 1">s</span></p>

    <div v-if="applyModesVisible" class="pulse-apply">
      <button
        v-for="mode in applyModes"
        :key="mode"
        type="button"
        class="pulse-btn"
        @click="emit('apply', mode)"
      >
        {{ PULSE_APPLY_LABELS[mode] }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.pulse-panel {
  --pulse-bg: var(--modal-bg);
  --pulse-border: var(--modal-border);
  --pulse-panel-bg: var(--modal-panel-bg);
  --pulse-panel-border: var(--modal-panel-border);
  --pulse-chip-bg: var(--modal-chip-bg);
  --pulse-chip-border: var(--modal-chip-border);
  --pulse-chip-active-bg: var(--modal-chip-active-bg);
  --pulse-chip-active-border: var(--modal-chip-active-border);
  --pulse-chip-active-text: var(--modal-chip-active-text);
  --pulse-muted-btn-bg: var(--modal-muted-btn-bg);
  --pulse-muted-btn-hover: var(--modal-muted-btn-hover);
  --pulse-copy: var(--modal-copy, var(--text-dim));
  --pulse-danger: var(--modal-danger-text, var(--danger-text));
  --pulse-shadow-soft: color-mix(in srgb, var(--text-main) 14%, transparent);
  --pulse-shadow-strong: color-mix(in srgb, var(--text-main) 24%, transparent);
  --pulse-shine-strong: color-mix(in srgb, var(--text-main) 10%, transparent);
  --pulse-shine-soft: color-mix(in srgb, var(--text-main) 4%, transparent);
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--pulse-border);
  border-radius: 18px;
  background: var(--pulse-bg);
  color: var(--text-primary);
  padding: 14px;
  box-shadow:
    0 1px 0 var(--pulse-shine-strong) inset,
    0 0 0 1px var(--pulse-shine-soft),
    0 34px 80px var(--pulse-shadow-strong),
    0 16px 34px var(--pulse-shadow-soft);
}

.pulse-panel.compact {
  gap: 10px;
  padding: 14px;
  border-color: var(--pulse-border);
}

.pulse-help,
.pulse-provenance {
  margin: 0;
}
.pulse-help,
.pulse-provenance {
  font-size: 12px;
  color: var(--pulse-copy);
}

.pulse-close-btn,
.pulse-btn,
.pulse-select,
.pulse-textarea,
.pulse-tab-btn {
  border: 1px solid var(--pulse-chip-border);
  border-radius: 8px;
  background: var(--pulse-chip-bg);
  color: var(--text-primary);
}

.pulse-close-btn,
.pulse-btn,
.pulse-tab-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 7px 12px;
  font-size: 12px;
  line-height: 1.2;
  font-weight: 600;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.pulse-btn:hover:not(:disabled),
.pulse-tab-btn:hover {
  background: var(--pulse-muted-btn-hover);
}

.pulse-btn-strong {
  border-color: var(--button-primary-border);
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
  box-shadow: 0 1px 0 var(--pulse-shine-soft) inset;
}

.pulse-btn-strong:hover:not(:disabled) {
  background: var(--button-primary-hover);
}

.pulse-close-btn {
  min-width: 34px;
  min-height: 34px;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--text-soft);
}

.pulse-close-btn:hover:not(:disabled) {
  background: var(--pulse-muted-btn-bg);
}

.pulse-close-btn:focus-visible,
.pulse-btn:focus-visible,
.pulse-compact-trigger:focus-visible,
.pulse-textarea:focus-visible,
.pulse-tab-btn:focus-visible {
  outline: none;
  border-color: var(--input-focus-border, var(--accent));
}

.pulse-btn:disabled,
.pulse-textarea:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.pulse-apply .pulse-btn {
  font-weight: 500;
  background: var(--pulse-muted-btn-bg);
  border-color: var(--pulse-panel-border);
}

.pulse-apply .pulse-btn:hover:not(:disabled) {
  background: var(--pulse-chip-active-bg);
  border-color: var(--pulse-chip-active-border);
  color: var(--pulse-chip-active-text);
}

.pulse-compact-bar,
.pulse-actions,
.pulse-apply {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pulse-compact-bar--header {
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
}

.pulse-compact-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 148px;
  min-height: 36px;
  padding: 7px 12px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--pulse-panel-border);
  border-radius: 10px;
  background: var(--pulse-panel-bg);
  color: var(--text-primary);
  text-align: left;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.pulse-compact-trigger:hover {
  background: var(--pulse-muted-btn-hover);
}

.pulse-compact-dropdown :deep(.ui-filterable-dropdown-menu) {
  --ui-dropdown-bg: var(--pulse-bg);
  --ui-dropdown-border: var(--pulse-panel-border);
  --ui-dropdown-hover: var(--pulse-chip-active-bg);
}

.pulse-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pulse-field > span {
  font-size: 12px;
  font-weight: 700;
  color: var(--modal-title, var(--text-primary));
}

.pulse-input-surface {
  border: 1px solid var(--pulse-panel-border);
  border-radius: 12px;
  background: var(--pulse-panel-bg);
  box-shadow:
    0 1px 0 var(--pulse-shine-soft) inset,
    0 0 0 1px color-mix(in srgb, var(--pulse-panel-border) 24%, transparent);
}

.pulse-textarea {
  width: 100%;
  min-height: 86px;
  resize: vertical;
  border: 0;
  border-radius: 12px;
  background: transparent;
  padding: 12px;
  font-size: 12px;
}

.pulse-section-divider {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--pulse-panel-border),
    transparent
  );
}

.pulse-preview {
  border: 1px solid var(--pulse-panel-border);
  border-radius: 14px;
  background: var(--pulse-panel-bg);
  overflow: hidden;
  box-shadow: 0 1px 0 var(--pulse-shine-soft) inset;
}

.pulse-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--pulse-panel-border) 44%, transparent);
}

.pulse-preview-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pulse-tab-btn {
  min-height: 24px;
  padding: 4px 8px;
  font-size: 11px;
}

.pulse-tab-btn[data-active="true"] {
  background: var(--modal-tab-active-bg);
  border-color: var(--modal-tab-active-border);
  color: var(--modal-tab-active-text);
}

.pulse-preview-body {
  margin: 0;
  padding: 14px 12px 12px;
  max-height: 240px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
}

.pulse-preview-empty,
.pulse-preview-loading,
.pulse-preview-error {
  color: var(--pulse-copy);
}

.pulse-preview-error {
  color: var(--pulse-danger);
}

.pulse-rendered-preview :deep(h1),
.pulse-rendered-preview :deep(h2),
.pulse-rendered-preview :deep(h3),
.pulse-rendered-preview :deep(h4),
.pulse-rendered-preview :deep(h5),
.pulse-rendered-preview :deep(h6) {
  margin: 0 0 8px;
  font-size: 1em;
}

.pulse-rendered-preview :deep(p),
.pulse-rendered-preview :deep(blockquote),
.pulse-rendered-preview :deep(pre),
.pulse-rendered-preview :deep(ul),
.pulse-rendered-preview :deep(ol) {
  margin: 0 0 8px;
}

.pulse-rendered-preview :deep(ul),
.pulse-rendered-preview :deep(ol) {
  padding-left: 18px;
}

.pulse-rendered-preview :deep(blockquote) {
  border-left: 3px solid color-mix(in srgb, var(--accent) 28%, var(--pulse-panel-border));
  padding-left: 10px;
  color: var(--pulse-copy);
}

.pulse-rendered-preview :deep(code) {
  font-family: var(--font-mono, 'SFMono-Regular', ui-monospace, monospace);
}

.pulse-rendered-preview :deep(pre) {
  border-radius: 8px;
  background: var(--modal-group-bg, var(--surface-muted));
  padding: 8px 10px;
  white-space: pre-wrap;
}

.pulse-raw-preview {
  white-space: pre-wrap;
}

.pulse-diff {
  white-space: pre-wrap;
}

.pulse-diff-segment--removed {
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
  background: color-mix(in srgb, var(--pulse-danger) 16%, transparent);
}

.pulse-diff-segment--added {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.pulse-skeleton-line {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--pulse-panel-border) 62%, transparent),
    color-mix(in srgb, var(--pulse-panel-bg) 80%, var(--pulse-bg)),
    color-mix(in srgb, var(--pulse-panel-border) 62%, transparent)
  );
  background-size: 220% 100%;
  animation: pulse-preview-shimmer 1.3s linear infinite;
}

.pulse-skeleton-line--short {
  width: 72%;
}

@keyframes pulse-preview-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -20% 0;
  }
}
</style>
