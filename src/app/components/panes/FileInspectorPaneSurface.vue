<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FileMetadata } from '../../../shared/api/apiTypes'

const props = defineProps<{
  path: string
  readFileMetadata?: (path: string) => Promise<FileMetadata>
}>()

const metadata = ref<FileMetadata | null>(null)
const loading = ref(false)
const errorMessage = ref('')

const fileName = computed(() => {
  const normalized = props.path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || props.path
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
    const next = await props.readFileMetadata(path)
    metadata.value = next
  } catch {
    metadata.value = null
    errorMessage.value = 'Could not load file metadata.'
  } finally {
    loading.value = false
  }
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
    <header class="file-inspector-header">
      <p class="file-inspector-kicker">File inspector</p>
      <h2 class="file-inspector-title">{{ fileName }}</h2>
      <p class="file-inspector-path">{{ path }}</p>
    </header>

    <div v-if="loading" class="file-inspector-state">Loading metadata...</div>
    <div v-else-if="errorMessage" class="file-inspector-state file-inspector-state--error">{{ errorMessage }}</div>
    <div v-else class="file-inspector-grid">
      <div class="file-inspector-row">
        <span class="file-inspector-label">Path</span>
        <span class="file-inspector-value">{{ path }}</span>
      </div>
      <div class="file-inspector-row">
        <span class="file-inspector-label">Created</span>
        <span class="file-inspector-value">{{ createdAt }}</span>
      </div>
      <div class="file-inspector-row">
        <span class="file-inspector-label">Updated</span>
        <span class="file-inspector-value">{{ updatedAt }}</span>
      </div>
      <div class="file-inspector-row">
        <span class="file-inspector-label">Preview</span>
        <span class="file-inspector-value">Preview coming soon</span>
      </div>
    </div>

    <div class="file-inspector-preview">
      <p class="file-inspector-preview-label">Notes</p>
      <p class="file-inspector-preview-copy">
        Non-Markdown files now stay inside the app. This surface is metadata-first for now and can grow into a text or
        media preview later.
      </p>
    </div>
  </section>
</template>

<style scoped>
.file-inspector {
  height: 100%;
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: auto;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 10%, transparent), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-bg) 96%, transparent), var(--surface-bg));
}

.file-inspector-header {
  display: grid;
  gap: 0.2rem;
}

.file-inspector-kicker {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.file-inspector-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 650;
  color: var(--text-main);
  word-break: break-word;
}

.file-inspector-path {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-soft);
  word-break: break-word;
}

.file-inspector-state {
  padding: 0.9rem 1rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-subtle) 88%, transparent);
  color: var(--text-soft);
}

.file-inspector-state--error {
  border-color: color-mix(in srgb, var(--error) 38%, transparent);
  color: var(--error);
}

.file-inspector-grid {
  display: grid;
  gap: 0.6rem;
}

.file-inspector-row {
  display: grid;
  gap: 0.25rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-subtle) 82%, transparent);
}

.file-inspector-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.file-inspector-value {
  color: var(--text-main);
  word-break: break-word;
}

.file-inspector-preview {
  margin-top: auto;
  padding: 1rem;
  border: 1px dashed color-mix(in srgb, var(--border-strong) 45%, transparent);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-subtle) 72%, transparent);
}

.file-inspector-preview-label {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.file-inspector-preview-copy {
  margin: 0;
  color: var(--text-soft);
  line-height: 1.55;
}
</style>
