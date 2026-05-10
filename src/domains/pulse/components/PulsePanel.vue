<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  ArrowsPointingOutIcon,
  ArrowsRightLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  CodeBracketSquareIcon,
  EyeIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline'
import UiFilterableDropdown, { type FilterableDropdownItem } from '../../../shared/components/ui/UiFilterableDropdown.vue'
import { PULSE_APPLY_LABELS, type PulseActionSpec, type PulseApplyMode } from '../lib/pulse'
import { buildPulseDiff, renderPulseMarkdown } from '../lib/pulsePreview'

type PulsePanelState = 'configure' | 'running' | 'result' | 'error'
type PulsePreviewMode = 'diff' | 'preview' | 'markdown'

const TEXT_ACTION_IDS = new Set(['format', 'rewrite', 'condense', 'expand', 'change_tone'])

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
  drawer?: boolean
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
const copyFeedback = ref(false)
const previewModalOpen = ref(false)
let copyResetTimer: number | null = null
const compactItems = computed<FilterableDropdownItem[]>(() =>
  props.actions.map((action) => ({
    id: action.id,
    label: action.label,
    description: action.description,
    group: action.family === 'text' ? 'Transform text' : 'Analyze context',
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
const canCopyPreview = computed(() => panelState.value === 'result' && hasPreview.value && !props.running)
const copyButtonLabel = computed(() => (copyFeedback.value ? 'Copied' : 'Copy'))
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

function openPreviewModal() {
  if (panelState.value !== 'result') return
  previewModalOpen.value = true
}

function closePreviewModal() {
  previewModalOpen.value = false
}

function resetCopyFeedback() {
  copyFeedback.value = false
  if (copyResetTimer !== null) {
    window.clearTimeout(copyResetTimer)
    copyResetTimer = null
  }
}

async function copyPreviewMarkdown() {
  if (!canCopyPreview.value) return

  try {
    await navigator.clipboard.writeText(props.previewMarkdown)
    copyFeedback.value = true
    if (copyResetTimer !== null) {
      window.clearTimeout(copyResetTimer)
    }
    copyResetTimer = window.setTimeout(() => {
      resetCopyFeedback()
    }, 1800)
  } catch {
    resetCopyFeedback()
  }
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
    resetCopyFeedback()
    previewModalOpen.value = false
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  resetCopyFeedback()
})
</script>

<template>
  <section class="pulse-panel" :class="{ compact, drawer }" data-pulse-panel-state>
    <template v-if="drawer">
      <div class="pulse-thread">
        <article class="pulse-message pulse-message-user">
          <div class="pulse-message-meta">
            <span>Request</span>
            <span class="pulse-action-pill">{{ activeAction?.label || 'Action' }}</span>
          </div>
          <p class="pulse-message-copy">{{ instruction || activeAction?.description || 'Describe what Pulse should do.' }}</p>
        </article>

        <article class="pulse-message pulse-message-assistant" :data-state="panelState">
          <div class="pulse-message-meta pulse-message-meta--result">
            <span>Pulse</span>
            <div v-if="panelState === 'result'" class="pulse-preview-controls pulse-preview-controls--drawer">
              <button
                type="button"
                class="pulse-tab-btn pulse-icon-btn pulse-expand-btn"
                title="Open large preview"
                aria-label="Open large preview"
                @click="openPreviewModal"
              >
                <ArrowsPointingOutIcon class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="pulse-tab-btn pulse-icon-btn pulse-copy-btn"
                :disabled="!canCopyPreview"
                :aria-label="copyFeedback ? 'Copied' : 'Copy preview as markdown'"
                :title="copyFeedback ? 'Copied' : 'Copy preview as markdown'"
                @click="copyPreviewMarkdown"
              >
                <CheckIcon v-if="copyFeedback" class="h-4 w-4" />
                <ClipboardDocumentIcon v-else class="h-4 w-4" />
              </button>
              <div class="pulse-preview-tabs">
                <button
                  v-if="canShowDiff"
                  type="button"
                  class="pulse-tab-btn pulse-icon-btn"
                  :data-active="effectivePreviewMode === 'diff'"
                  title="Show diff"
                  aria-label="Show diff"
                  @click="setPreviewMode('diff')"
                >
                  <ArrowsRightLeftIcon class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="pulse-tab-btn pulse-icon-btn"
                  :data-active="effectivePreviewMode === 'preview'"
                  title="Show preview"
                  aria-label="Show preview"
                  @click="setPreviewMode('preview')"
                >
                  <EyeIcon class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="pulse-tab-btn pulse-icon-btn"
                  :data-active="effectivePreviewMode === 'markdown'"
                  title="Show markdown"
                  aria-label="Show markdown"
                  @click="setPreviewMode('markdown')"
                >
                  <CodeBracketSquareIcon class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="panelState === 'configure'" class="pulse-message-body pulse-preview-empty">
            Choose an action, refine the prompt, then generate a preview.
          </div>

          <div v-else-if="panelState === 'running'" class="pulse-message-body pulse-preview-loading">
            <div class="pulse-skeleton-line"></div>
            <div class="pulse-skeleton-line pulse-skeleton-line--short"></div>
            <div class="pulse-skeleton-line"></div>
            <p>Generating…</p>
          </div>

          <div v-else-if="panelState === 'error'" class="pulse-message-body pulse-preview-error">
            {{ error }}
          </div>

          <div
            v-else-if="effectivePreviewMode === 'diff' && canShowDiff"
            class="pulse-message-body pulse-diff"
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
            class="pulse-message-body pulse-rendered-preview"
            data-pulse-preview-mode="preview"
            v-html="renderedPreviewHtml"
          ></div>

          <pre
            v-else
            class="pulse-message-body pulse-raw-preview"
            data-pulse-preview-mode="markdown"
          >{{ previewMarkdown }}</pre>

          <div v-if="panelState === 'result'" class="pulse-result-footer">
            <p v-if="provenancePaths.length" class="pulse-provenance">{{ provenancePaths.length }} source<span v-if="provenancePaths.length > 1">s</span></p>
            <div v-if="applyModesVisible" class="pulse-apply pulse-apply--drawer">
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
          </div>
        </article>
      </div>

      <div class="pulse-composer">
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
          :menu-class="'pulse-compact-dropdown-menu'"
          filter-placeholder="Filter Pulse actions..."
          @open-change="compactMenuOpen = $event"
          @query-change="compactQuery = $event"
          @active-index-change="compactActiveIndex = $event"
          @select="onCompactSelect($event)"
        >
          <template #trigger="{ toggleMenu, activeItem }">
            <button
              type="button"
              class="pulse-composer-action"
              :disabled="running"
              :title="activeAction?.description"
              @click="toggleMenu"
            >
              <span>{{ activeItem?.label || activeAction?.label || 'Action' }}</span>
              <ChevronDownIcon class="h-4 w-4" />
            </button>
          </template>
        </UiFilterableDropdown>

        <div class="pulse-composer-input">
          <textarea
            class="pulse-textarea pulse-textarea--composer"
            data-pulse-prompt="true"
            :value="instruction"
            :disabled="running"
            rows="3"
            placeholder="Ask Pulse to transform this..."
            @input="emit('update:instruction', ($event.target as HTMLTextAreaElement).value)"
            @keydown="onPromptKeydown"
          ></textarea>
          <div class="pulse-composer-actions">
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
        </div>
      </div>

      <div v-if="previewModalOpen" class="pulse-preview-modal-overlay" @click.self="closePreviewModal">
        <section
          class="pulse-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pulse-preview-modal-title"
          @keydown.esc="closePreviewModal"
        >
          <header class="pulse-preview-modal-header">
            <div>
              <p class="pulse-preview-modal-kicker">Pulse Preview</p>
              <h2 id="pulse-preview-modal-title">{{ activeAction?.label || 'Result' }}</h2>
            </div>
            <div class="pulse-preview-modal-tools">
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
              <button
                type="button"
                class="pulse-tab-btn pulse-copy-btn"
                :disabled="!canCopyPreview"
                :title="copyFeedback ? 'Copied' : 'Copy preview as markdown'"
                @click="copyPreviewMarkdown"
              >
                {{ copyButtonLabel }}
              </button>
              <button type="button" class="pulse-close-btn" aria-label="Close large preview" title="Close" @click="closePreviewModal">
                <XMarkIcon class="h-4 w-4" />
              </button>
            </div>
          </header>

          <div class="pulse-preview-modal-body">
            <div
              v-if="effectivePreviewMode === 'diff' && canShowDiff"
              class="pulse-modal-preview-body pulse-diff"
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
              class="pulse-modal-preview-body pulse-rendered-preview"
              data-pulse-preview-mode="preview"
              v-html="renderedPreviewHtml"
            ></div>

            <pre
              v-else
              class="pulse-modal-preview-body pulse-raw-preview"
              data-pulse-preview-mode="markdown"
            >{{ previewMarkdown }}</pre>
          </div>

          <footer class="pulse-preview-modal-footer">
            <p v-if="provenancePaths.length" class="pulse-provenance">{{ provenancePaths.length }} source<span v-if="provenancePaths.length > 1">s</span></p>
            <div v-if="applyModesVisible" class="pulse-apply pulse-apply--modal">
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
          </footer>
        </section>
      </div>
    </template>

    <template v-else>
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
        :menu-class="'pulse-compact-dropdown-menu'"
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
        <div v-if="panelState === 'result'" class="pulse-preview-controls">
          <button
            type="button"
            class="pulse-tab-btn pulse-copy-btn"
            :disabled="!canCopyPreview"
            :title="copyFeedback ? 'Copied' : 'Copy preview as markdown'"
            @click="copyPreviewMarkdown"
          >
            {{ copyButtonLabel }}
          </button>
          <div class="pulse-preview-tabs">
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
    </template>
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

.pulse-panel.drawer {
  --pulse-bg: var(--right-pane-card-bg);
  --pulse-border: var(--right-pane-card-border);
  --pulse-panel-bg: var(--right-pane-bg);
  --pulse-panel-border: var(--right-pane-card-border);
  --pulse-chip-bg: var(--right-pane-card-bg);
  --pulse-chip-border: var(--right-pane-card-border);
  --pulse-muted-btn-bg: var(--right-pane-item-hover);
  --pulse-muted-btn-hover: var(--right-pane-item-active);
  --pulse-copy: var(--right-pane-text-soft);
  min-height: 0;
  flex: 1;
  gap: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}

.pulse-thread {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding: 2px 2px 12px;
}

.pulse-message {
  border: 1px solid var(--pulse-panel-border);
  border-radius: 12px;
  background: var(--pulse-bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pulse-panel-border) 22%, transparent);
}

.pulse-message-user {
  margin-left: 22px;
  background: color-mix(in srgb, var(--button-primary-bg) 18%, var(--pulse-bg));
}

.pulse-message-assistant {
  margin-right: 14px;
}

.pulse-message-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pulse-copy);
}

.pulse-message-meta--result {
  align-items: center;
  flex-wrap: nowrap;
  padding-bottom: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--pulse-panel-border) 42%, transparent);
}

.pulse-message-meta--result > span {
  flex: 0 0 auto;
}

.pulse-action-pill {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid var(--pulse-panel-border);
  border-radius: 999px;
  padding: 3px 8px;
  background: var(--pulse-panel-bg);
  color: var(--text-primary);
  letter-spacing: 0;
  text-transform: none;
}

.pulse-message-copy {
  margin: 0;
  padding: 8px 12px 12px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.pulse-message-body {
  margin: 0;
  max-height: none;
  overflow: visible;
  padding: 12px;
  font-size: 12px;
  line-height: 1.5;
}

.pulse-result-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px 12px;
}

.pulse-apply--drawer {
  gap: 6px;
}

.pulse-apply--drawer .pulse-btn {
  flex: 1 1 auto;
  min-width: min(132px, 100%);
  justify-content: center;
}

.pulse-composer {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--pulse-panel-border);
  border-radius: 12px;
  background: var(--pulse-bg);
  padding: 10px;
  box-shadow:
    0 -14px 24px color-mix(in srgb, var(--right-pane-bg) 86%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--pulse-panel-border) 18%, transparent);
}

.pulse-composer-action {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  border: 1px solid var(--pulse-panel-border);
  border-radius: 8px;
  background: var(--pulse-panel-bg);
  color: var(--text-primary);
  padding: 6px 9px;
  font-size: 12px;
  font-weight: 700;
}

.pulse-composer-input {
  border: 1px solid var(--pulse-panel-border);
  border-radius: 10px;
  background: var(--pulse-panel-bg);
  overflow: hidden;
}

.pulse-textarea--composer {
  min-height: 66px;
  max-height: 130px;
  resize: vertical;
  border-radius: 0;
  padding: 10px;
}

.pulse-composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  border-top: 1px solid color-mix(in srgb, var(--pulse-panel-border) 42%, transparent);
  padding: 8px;
}

.pulse-preview-controls--drawer {
  gap: 4px;
  flex: 0 0 auto;
  justify-content: flex-end;
  flex-wrap: nowrap;
  margin-left: auto;
}

.pulse-preview-controls--drawer .pulse-preview-tabs {
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: 4px;
}

.pulse-preview-controls--drawer .pulse-tab-btn {
  flex: 0 0 auto;
}

.pulse-preview-controls--drawer .pulse-icon-btn {
  width: 32px;
  min-width: 32px;
  min-height: 30px;
  padding: 0;
}

.pulse-icon-btn svg {
  width: 16px;
  height: 16px;
}

.pulse-preview-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: color-mix(in srgb, var(--text-main) 42%, transparent);
}

.pulse-preview-modal {
  width: min(980px, calc(100vw - 64px));
  height: min(760px, calc(100vh - 64px));
  min-height: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--pulse-panel-border);
  border-radius: 14px;
  background: var(--pulse-bg);
  color: var(--text-primary);
  box-shadow:
    0 1px 0 var(--pulse-shine-strong) inset,
    0 30px 90px color-mix(in srgb, var(--text-main) 34%, transparent);
}

.pulse-preview-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid var(--pulse-panel-border);
  padding: 16px 18px 14px;
}

.pulse-preview-modal-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pulse-copy);
}

.pulse-preview-modal-header h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.pulse-preview-modal-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  flex-wrap: wrap;
}

.pulse-preview-modal-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  background: var(--pulse-panel-bg);
}

.pulse-modal-preview-body {
  margin: 0;
  padding: 24px 28px 32px;
  font-size: 15px;
  line-height: 1.62;
}

.pulse-preview-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid var(--pulse-panel-border);
  padding: 12px 18px;
  background: var(--pulse-bg);
}

.pulse-apply--modal {
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .pulse-preview-modal-overlay {
    padding: 12px;
  }

  .pulse-preview-modal {
    width: calc(100vw - 24px);
    height: calc(100vh - 24px);
  }

  .pulse-preview-modal-header,
  .pulse-preview-modal-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .pulse-preview-modal-tools,
  .pulse-apply--modal {
    justify-content: flex-start;
  }

  .pulse-modal-preview-body {
    padding: 18px;
    font-size: 14px;
  }
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
.pulse-tab-btn:hover:not(:disabled) {
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
.pulse-textarea:disabled,
.pulse-tab-btn:disabled {
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

.pulse-compact-dropdown-menu {
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

.pulse-preview-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
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

.pulse-copy-btn {
  min-width: 58px;
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
.pulse-rendered-preview :deep(table),
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

.pulse-rendered-preview :deep(table) {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--editor-table-border);
  border-collapse: collapse;
  border-radius: 8px;
  background: var(--editor-table-bg);
}

.pulse-rendered-preview :deep(thead) {
  background: var(--editor-table-header-bg, var(--editor-table-hover));
  color: var(--editor-table-header-text, var(--text-primary));
}

.pulse-rendered-preview :deep(th),
.pulse-rendered-preview :deep(td) {
  min-width: 96px;
  border: 1px solid var(--editor-table-cell-border);
  padding: 7px 9px;
  text-align: left;
  vertical-align: top;
}

.pulse-rendered-preview :deep(th) {
  font-weight: 700;
}

.pulse-rendered-preview :deep(tr:nth-child(even) td) {
  background: color-mix(in srgb, var(--editor-table-hover) 72%, transparent);
}

.pulse-rendered-preview :deep(th > :last-child),
.pulse-rendered-preview :deep(td > :last-child) {
  margin-bottom: 0;
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
