<script setup lang="ts">
import { ArrowTopRightOnSquareIcon, DocumentIcon, StarIcon } from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import { readPdfDataUrl } from '../../../shared/api/workspaceApi'

const props = defineProps<{
  path: string
  isFavorite?: boolean
  openExternally?: () => Promise<void> | void
  toggleFavorite?: () => Promise<void> | void
}>()

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

const isPdfPreview = computed(() => fileExtension.value === 'pdf')
const pdfPreviewSrc = ref('')
const pdfPreviewLoading = ref(false)
const pdfPreviewError = ref('')

function openNative() {
  void props.openExternally?.()
}

function toggleFavorite() {
  void props.toggleFavorite?.()
}

async function loadPdfPreview(path: string) {
  if (!path || !isPdfPreview.value) {
    pdfPreviewSrc.value = ''
    pdfPreviewError.value = ''
    pdfPreviewLoading.value = false
    return
  }

  pdfPreviewLoading.value = true
  pdfPreviewError.value = ''
  try {
    pdfPreviewSrc.value = await readPdfDataUrl(path)
  } catch {
    pdfPreviewSrc.value = ''
    pdfPreviewError.value = 'Could not load PDF preview.'
  } finally {
    pdfPreviewLoading.value = false
  }
}

watch(
  () => props.path,
  (path) => {
    void loadPdfPreview(path)
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
        First-class workspace file. Markdown stays in the editor; this tab stays focused on native actions and preview.
      </div>
    </div>

    <div class="file-inspector-preview-panel">
      <div class="file-inspector-preview-head">
        <p class="file-inspector-preview-label">Preview</p>
        <p class="file-inspector-preview-subtitle">
          {{ isPdfPreview ? 'Rendered with the browser PDF viewer.' : 'Reserved for a richer native preview later. For now, the surface stays lean.' }}
        </p>
      </div>

      <div v-if="pdfPreviewLoading" class="file-inspector-preview-status">Loading PDF preview...</div>
      <div v-else-if="pdfPreviewError" class="file-inspector-preview-status file-inspector-preview-status--error">
        {{ pdfPreviewError }}
      </div>
      <iframe
        v-else-if="isPdfPreview && pdfPreviewSrc"
        class="file-inspector-preview-frame"
        :src="pdfPreviewSrc"
        :title="`Preview for ${fileName}`"
      />
      <div v-else class="file-inspector-preview-stage">
        <div class="file-inspector-preview-emblem">{{ fileExtension || 'file' }}</div>
        <div class="file-inspector-preview-text">
          <p class="file-inspector-preview-title">{{ fileKindLabel }}</p>
          <p class="file-inspector-preview-copy">
            This tab is for opening, favoriting, and eventually previewing non-Markdown files. File details already
            live in the right pane.
          </p>
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

.file-inspector-preview-panel {
  display: grid;
  gap: 0.7rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 80%, transparent);
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-subtle) 90%, transparent), var(--surface-subtle)),
    color-mix(in srgb, var(--surface-bg) 92%, transparent);
  box-shadow: var(--shadow-panel);
}

.file-inspector-preview-head {
  display: grid;
  gap: 0.15rem;
}

.file-inspector-preview-label {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.13em;
}

.file-inspector-preview-subtitle {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.8rem;
  line-height: 1.4;
}

.file-inspector-preview-stage {
  display: grid;
  grid-template-columns: 4.25rem minmax(0, 1fr);
  gap: 0.95rem;
  align-items: center;
  min-height: 12rem;
  padding: 1rem 1.05rem;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 68%, transparent);
  border-radius: 16px;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 12%, transparent), transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-bg) 94%, transparent), transparent);
}

.file-inspector-preview-status {
  padding: 0.8rem 0.95rem;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 68%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-bg) 90%, transparent);
  color: var(--text-soft);
  font-size: 0.88rem;
}

.file-inspector-preview-status--error {
  color: var(--danger, #b54747);
}

.file-inspector-preview-frame {
  width: 100%;
  min-height: 34rem;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 68%, transparent);
  border-radius: 16px;
  background: var(--surface-bg);
}

.file-inspector-preview-emblem {
  width: 4.25rem;
  height: 4.25rem;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 18%, var(--surface-subtle)),
    color-mix(in srgb, var(--accent) 8%, var(--surface-subtle))
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

@media (max-width: 900px) {
  .file-inspector-hero {
    flex-direction: column;
  }

  .file-inspector-actions {
    max-width: none;
    justify-content: flex-start;
  }

  .file-inspector-summary {
    grid-template-columns: 1fr;
  }

  .file-inspector-preview-stage {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .file-inspector-preview-frame {
    min-height: 24rem;
  }

  .file-inspector-preview-emblem {
    width: 3.5rem;
    height: 3.5rem;
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
