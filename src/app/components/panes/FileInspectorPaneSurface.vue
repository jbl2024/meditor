<script setup lang="ts">
import { ArrowTopRightOnSquareIcon, DocumentIcon, StarIcon } from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import type { FileMetadata } from '../../../shared/api/apiTypes'

const props = defineProps<{
  path: string
  readFileMetadata?: (path: string) => Promise<FileMetadata>
  isFavorite?: boolean
  openExternally?: () => Promise<void> | void
  toggleFavorite?: () => Promise<void> | void
}>()

const metadata = ref<FileMetadata | null>(null)
const loading = ref(false)
const errorMessage = ref('')

const fileName = computed(() => {
  const normalized = props.path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || props.path
})

const fileExtension = computed(() => {
  const match = /\.([^.\\/]+)$/.exec(fileName.value)
  return match?.[1]?.toLowerCase() ?? ''
})

const fileKindLabel = computed(() => {
  if (!fileExtension.value) return 'Unknown file'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(fileExtension.value)) return 'Image'
  if (['csv', 'tsv', 'xlsx', 'xls', 'ods'].includes(fileExtension.value)) return 'Spreadsheet'
  if (['pdf'].includes(fileExtension.value)) return 'Document'
  if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(fileExtension.value)) return 'Structured data'
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(fileExtension.value)) return 'Archive'
  return `${fileExtension.value.toUpperCase()} file`
})

const createdAt = computed(() => formatTimestamp(metadata.value?.created_at_ms ?? null))
const updatedAt = computed(() => formatTimestamp(metadata.value?.updated_at_ms ?? null))

function formatTimestamp(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

async function loadMetadata(path: string) {
  if (!path) {
    metadata.value = null
    errorMessage.value = ''
    return
  }

  if (!props.readFileMetadata) {
    metadata.value = null
    errorMessage.value = 'Metadata loader unavailable.'
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    metadata.value = await props.readFileMetadata(path)
  } catch {
    metadata.value = null
    errorMessage.value = 'Could not load file metadata.'
  } finally {
    loading.value = false
  }
}

function openNative() {
  void props.openExternally?.()
}

function toggleFavorite() {
  void props.toggleFavorite?.()
}

watch(
  () => props.path,
  (path) => {
    void loadMetadata(path)
  },
  { immediate: true }
)
</script>

<template>
  <section class="file-inspector">
    <header class="file-inspector-hero">
      <div class="file-inspector-heading">
        <p class="file-inspector-kicker">Non-markdown file</p>
        <h2 class="file-inspector-title">{{ fileName }}</h2>
        <p class="file-inspector-path">{{ path }}</p>
      </div>

      <div class="file-inspector-actions" role="toolbar" aria-label="File actions">
        <button
          type="button"
          class="file-inspector-action file-inspector-action--primary"
          :disabled="!openExternally"
          @click="openNative"
        >
          <ArrowTopRightOnSquareIcon class="file-inspector-action-icon" />
          Open natively
        </button>
        <button
          type="button"
          class="file-inspector-action"
          :class="{ 'is-active': Boolean(isFavorite) }"
          :disabled="!toggleFavorite"
          @click="toggleFavorite"
        >
          <StarIcon class="file-inspector-action-icon" />
          {{ isFavorite ? 'Favorited' : 'Favorite' }}
        </button>
      </div>
    </header>

    <div class="file-inspector-summary">
      <div class="file-inspector-summary-badge">
        <DocumentIcon class="file-inspector-summary-icon" />
        <span>{{ fileKindLabel }}</span>
      </div>
      <div class="file-inspector-summary-copy">
        First-class workspace file. Markdown opens in the editor; this surface keeps everything else in context.
      </div>
    </div>

    <div class="file-inspector-layout">
      <div class="file-inspector-panel file-inspector-panel--meta">
        <div class="file-inspector-panel-head">
          <p class="file-inspector-panel-title">Metadata</p>
          <p class="file-inspector-panel-subtitle">Compact view of file state and timestamps.</p>
        </div>
        <div v-if="loading" class="file-inspector-state">Loading metadata...</div>
        <div v-else-if="errorMessage" class="file-inspector-state file-inspector-state--error">{{ errorMessage }}</div>
        <dl v-else class="file-inspector-grid">
          <div class="file-inspector-row">
            <dt class="file-inspector-label">Path</dt>
            <dd class="file-inspector-value">{{ path }}</dd>
          </div>
          <div class="file-inspector-row">
            <dt class="file-inspector-label">Created</dt>
            <dd class="file-inspector-value">{{ createdAt }}</dd>
          </div>
          <div class="file-inspector-row">
            <dt class="file-inspector-label">Updated</dt>
            <dd class="file-inspector-value">{{ updatedAt }}</dd>
          </div>
          <div class="file-inspector-row">
            <dt class="file-inspector-label">Type</dt>
            <dd class="file-inspector-value">{{ fileKindLabel }}</dd>
          </div>
        </dl>
      </div>

      <div class="file-inspector-panel file-inspector-panel--preview">
        <p class="file-inspector-preview-label">Preview</p>
        <div class="file-inspector-preview-stage">
          <div class="file-inspector-preview-emblem">{{ fileExtension || 'file' }}</div>
          <div class="file-inspector-preview-text">
            <p class="file-inspector-preview-title">Preview coming next</p>
            <p class="file-inspector-preview-copy">
              The surface is ready for text, image, or table preview. For now it stays lightweight and keeps the file
              in context.
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="file-inspector-footnote">
      <span class="file-inspector-footnote-label">Behavior</span>
      <span class="file-inspector-footnote-copy">Single click opens here. Double click opens natively.</span>
    </div>
  </section>
</template>

<style scoped>
.file-inspector {
  height: 100%;
  padding: 1rem 1.1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  overflow: auto;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 14%, transparent), transparent 40%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-bg) 94%, transparent), var(--surface-bg));
}

.file-inspector-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent);
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-subtle) 94%, transparent), var(--surface-subtle)),
    color-mix(in srgb, var(--surface-bg) 92%, transparent);
  box-shadow: var(--shadow-panel);
}

.file-inspector-heading {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.file-inspector-kicker {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.file-inspector-title {
  margin: 0;
  font-size: 1.48rem;
  font-weight: 700;
  color: var(--text-main);
  word-break: break-word;
}

.file-inspector-path {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-soft);
  word-break: break-word;
  max-width: 60ch;
}

.file-inspector-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
  max-width: 18rem;
}

.file-inspector-action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.15rem;
  padding: 0.42rem 0.72rem;
  border: 1px solid color-mix(in srgb, var(--border-strong) 56%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-subtle) 82%, transparent);
  color: var(--text-main);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
}

.file-inspector-action:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border-strong));
  box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 10%, transparent);
}

.file-inspector-action--primary {
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 12%, var(--surface-subtle)), var(--surface-subtle));
}

.file-inspector-action.is-active {
  border-color: color-mix(in srgb, var(--accent) 64%, transparent);
  color: var(--accent);
}

.file-inspector-action:disabled {
  opacity: 0.58;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.file-inspector-action-icon {
  width: 0.95rem;
  height: 0.95rem;
}

.file-inspector-summary {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.85rem;
  align-items: center;
  padding: 0.95rem 1rem;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent);
  border-radius: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent 58%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-subtle) 90%, transparent), transparent);
}

.file-inspector-summary-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  width: fit-content;
  min-height: 2.1rem;
  padding: 0.32rem 0.75rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-subtle));
  color: var(--text-main);
  font-size: 0.8rem;
  font-weight: 600;
}

.file-inspector-summary-icon {
  width: 0.95rem;
  height: 0.95rem;
}

.file-inspector-summary-copy {
  color: var(--text-soft);
  font-size: 0.92rem;
  line-height: 1.45;
}

.file-inspector-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.8rem;
}

.file-inspector-panel {
  border: 1px solid color-mix(in srgb, var(--border-subtle) 80%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-subtle) 88%, transparent);
  padding: 0.9rem;
  min-height: 0;
  box-shadow: var(--shadow-panel);
}

.file-inspector-panel-head {
  display: grid;
  gap: 0.15rem;
  margin-bottom: 0.7rem;
}

.file-inspector-panel-title {
  margin: 0;
  color: var(--text-main);
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.file-inspector-panel-subtitle {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.78rem;
  line-height: 1.35;
}

.file-inspector-grid {
  display: grid;
  gap: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-bg) 84%, transparent);
}

.file-inspector-row {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr);
  gap: 0.7rem;
  align-items: start;
  padding: 0.62rem 0.78rem;
  border-top: 1px solid color-mix(in srgb, var(--border-subtle) 60%, transparent);
  animation: file-inspector-fade-up 220ms ease both;
}

.file-inspector-row:first-child {
  border-top: 0;
}

.file-inspector-label {
  color: var(--text-dim);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  line-height: 1.35;
  padding-top: 0.08rem;
}

.file-inspector-value {
  margin: 0;
  color: var(--text-main);
  font-size: 0.85rem;
  line-height: 1.35;
  word-break: break-word;
}

.file-inspector-state {
  color: var(--text-soft);
  font-size: 0.88rem;
}

.file-inspector-state--error {
  color: var(--danger, #b54747);
}

.file-inspector-panel--preview {
  display: grid;
  gap: 0.7rem;
}

.file-inspector-preview-label {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.13em;
}

.file-inspector-preview-stage {
  display: grid;
  gap: 0.75rem;
  min-height: 10rem;
  padding: 0.9rem;
  border: 1px dashed color-mix(in srgb, var(--border-strong) 46%, transparent);
  border-radius: 14px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent 60%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-bg) 92%, transparent), transparent);
}

.file-inspector-preview-emblem {
  width: 100%;
  min-height: 2.6rem;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 16%, var(--surface-subtle)),
    color-mix(in srgb, var(--accent) 6%, var(--surface-subtle))
  );
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.file-inspector-preview-text {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.file-inspector-preview-title {
  margin: 0;
  color: var(--text-main);
  font-size: 0.98rem;
  font-weight: 600;
}

.file-inspector-preview-copy {
  margin: 0;
  color: var(--text-soft);
  font-size: 0.88rem;
  line-height: 1.45;
}

.file-inspector-footnote {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.55rem;
  align-items: center;
  padding: 0.8rem 0.92rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-subtle) 86%, transparent);
  color: var(--text-soft);
  font-size: 0.84rem;
}

.file-inspector-footnote-label {
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.11em;
  font-size: 0.68rem;
}

.file-inspector-footnote-copy {
  line-height: 1.4;
}

@keyframes file-inspector-fade-up {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 900px) {
  .file-inspector-hero {
    flex-direction: column;
  }

  .file-inspector-actions {
    max-width: none;
    justify-content: flex-start;
  }

  .file-inspector-layout {
    grid-template-columns: 1fr;
  }

  .file-inspector-row {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }

  .file-inspector-footnote {
    flex-direction: column;
    align-items: flex-start;
  }

  .file-inspector-footnote-copy {
    width: 100%;
  }
}
</style>
