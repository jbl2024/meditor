<script setup lang="ts">
import { ArrowTopRightOnSquareIcon, DocumentIcon } from '@heroicons/vue/24/outline'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  readPdfDataUrl,
  renderPandocPreviewHtml,
  renderSpreadsheetPreviewHtml
} from '../../../shared/api/workspaceApi'
import UiButton from '../../../shared/components/ui/UiButton.vue'
import fileInspectorPreviewScriptUrl from './fileInspectorPreview.js?url'
import fileInspectorPreviewStylesheetUrl from './fileInspectorPreview.css?url'
import {
  buildPreviewDocumentHtml,
  type PreviewThemeSnapshot
} from './fileInspectorPreviewHtml'

const props = defineProps<{
  path: string
  openExternally?: () => Promise<void> | void
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

const isPdfPreview = computed(() => fileExtension.value === 'pdf')
const placeholderExtension = computed(() => (fileExtension.value || 'file').toUpperCase())
const pandocPreviewFormat = computed(() => {
  const supportedFormats: Record<string, string> = {
    docx: 'docx',
    odt: 'odt',
    csv: 'csv',
    tsv: 'tsv',
    html: 'html',
    htm: 'html',
    rst: 'rst',
    tex: 'latex',
    latex: 'latex',
    epub: 'epub',
    org: 'org',
    asciidoc: 'asciidoc',
    adoc: 'asciidoc'
  }

  return supportedFormats[fileExtension.value] ?? ''
})
const spreadsheetPreviewFormat = computed(() => {
  const supportedFormats: Record<string, string> = {
    xlsx: 'xlsx',
    ods: 'ods'
  }

  return supportedFormats[fileExtension.value] ?? ''
})
const isPandocPreview = computed(() => Boolean(pandocPreviewFormat.value))
const isSpreadsheetPreview = computed(() => Boolean(spreadsheetPreviewFormat.value))
const isHtmlPreview = computed(() => isPandocPreview.value || isSpreadsheetPreview.value)

const pdfPreviewSrc = ref('')
const pdfPreviewLoading = ref(false)
const pdfPreviewError = ref('')
const htmlPreviewRaw = ref('')
const htmlPreviewLoading = ref(false)
const htmlPreviewError = ref('')
const previewThemeSnapshot = ref<PreviewThemeSnapshot>(readPreviewThemeSnapshot())
let themeObserver: MutationObserver | null = null

function openNative() {
  void props.openExternally?.()
}

function readPreviewThemeSnapshot(): PreviewThemeSnapshot {
  const root = document.documentElement
  const styles = getComputedStyle(root)
  const vars: Record<string, string> = {}

  for (let index = 0; index < styles.length; index += 1) {
    const name = styles.item(index)
    if (!name || !name.startsWith('--')) continue
    const value = styles.getPropertyValue(name).trim()
    if (value) vars[name] = value
  }

  const colorScheme =
    root.dataset.colorScheme === 'dark' || root.classList.contains('dark') ? 'dark' : 'light'

  return { colorScheme, vars }
}

function buildPreviewDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function syncPandocPreviewTheme() {
  previewThemeSnapshot.value = readPreviewThemeSnapshot()
}

onMounted(() => {
  themeObserver = new MutationObserver(syncPandocPreviewTheme)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color-scheme']
  })
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
})

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

async function loadHtmlPreview(path: string) {
  if (!path || (!isPandocPreview.value && !isSpreadsheetPreview.value)) {
    htmlPreviewRaw.value = ''
    htmlPreviewError.value = ''
    htmlPreviewLoading.value = false
    return
  }

  htmlPreviewLoading.value = true
  htmlPreviewError.value = ''
  try {
    htmlPreviewRaw.value = isSpreadsheetPreview.value
      ? await renderSpreadsheetPreviewHtml(path)
      : await renderPandocPreviewHtml(path)
  } catch (error) {
    htmlPreviewRaw.value = ''
    htmlPreviewError.value = error instanceof Error ? error.message : 'Could not load preview.'
  } finally {
    htmlPreviewLoading.value = false
  }
}

const htmlPreviewSrc = computed(() => {
  if (!htmlPreviewRaw.value) {
    return ''
  }

  return buildPreviewDataUrl(
    buildPreviewDocumentHtml(
      htmlPreviewRaw.value,
      previewThemeSnapshot.value,
      {
        stylesheetUrl: fileInspectorPreviewStylesheetUrl,
        scriptUrl: fileInspectorPreviewScriptUrl
      },
      'Preview'
    )
  )
})

watch(
  () => props.path,
  (path) => {
    void loadPdfPreview(path)
    void loadHtmlPreview(path)
  },
  { immediate: true }
)
</script>

<template>
  <section class="file-inspector">
    <header class="file-inspector-toolbar" aria-label="File toolbar">
      <div class="file-inspector-actions" role="toolbar" aria-label="File actions">
        <UiButton
          size="sm"
          variant="secondary"
          :disabled="!openExternally"
          @click="openNative"
        >
          <ArrowTopRightOnSquareIcon class="file-inspector-action-icon" />
          Open natively
        </UiButton>
      </div>
    </header>

    <div class="file-inspector-preview-panel">
      <div v-if="pdfPreviewLoading" class="file-inspector-preview-status">Loading PDF preview...</div>
      <div v-else-if="htmlPreviewLoading" class="file-inspector-preview-status">Rendering preview...</div>
      <iframe
        v-else-if="isPdfPreview && pdfPreviewSrc"
        class="file-inspector-preview-frame"
        :src="pdfPreviewSrc"
        :title="`Preview for ${fileName}`"
      />
      <iframe
        v-else-if="isHtmlPreview && htmlPreviewSrc"
        class="file-inspector-preview-frame file-inspector-preview-frame--html"
        :src="htmlPreviewSrc"
        :title="`Preview for ${fileName}`"
        sandbox="allow-scripts"
      />
      <div v-else class="file-inspector-preview-stage">
        <div class="file-inspector-preview-stage-bg" aria-hidden="true"></div>
        <div
          v-if="pdfPreviewError || htmlPreviewError"
          class="file-inspector-preview-empty-state file-inspector-preview-empty-state--error"
        >
          <div class="file-inspector-preview-empty-mark" aria-hidden="true">
            <DocumentIcon class="file-inspector-preview-empty-icon" />
            <span>ERROR</span>
          </div>
          <div class="file-inspector-preview-empty-copy">
            <h2>Preview unavailable</h2>
            <p>{{ pdfPreviewError || htmlPreviewError }}</p>
          </div>
        </div>
        <div v-else class="file-inspector-preview-empty-state">
          <div class="file-inspector-preview-empty-mark" aria-hidden="true">
            <DocumentIcon class="file-inspector-preview-empty-icon" />
            <span>{{ placeholderExtension }}</span>
          </div>
          <div class="file-inspector-preview-empty-copy">
            <h2>Preview unavailable</h2>
            <p>This file opens natively for now. Use the toolbar action to inspect it in the system app.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.file-inspector {
  height: 100%;
  padding: 0.25rem 0.35rem 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  overflow: auto;
  background: var(--surface-bg);
}

.file-inspector-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0;
}

.file-inspector-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
}

.file-inspector-action-icon {
  width: 0.95rem;
  height: 0.95rem;
}

.file-inspector-preview-panel {
  display: grid;
  min-height: 0;
  flex: 1;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.file-inspector-preview-status {
  padding: 0.8rem 0.95rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-soft);
  font-size: 0.88rem;
}

.file-inspector-preview-status--error {
  color: var(--danger, #b54747);
}

.file-inspector-preview-frame {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
  background: var(--surface-bg);
}

.file-inspector-preview-stage {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 16%, transparent), transparent 42%),
    radial-gradient(circle at bottom right, color-mix(in srgb, var(--text-soft) 8%, transparent), transparent 38%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-bg) 98%, white), var(--surface-bg));
}

.file-inspector-preview-stage-bg {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(135deg, transparent 0%, color-mix(in srgb, var(--border-subtle) 18%, transparent) 50%, transparent 100%),
    linear-gradient(180deg, transparent, color-mix(in srgb, var(--surface-muted) 18%, transparent));
  opacity: 0.55;
  pointer-events: none;
}

.file-inspector-preview-empty-state {
  position: relative;
  z-index: 1;
  width: min(34rem, 100%);
  display: grid;
  gap: 1rem;
  justify-items: center;
  text-align: center;
  padding: clamp(1.5rem, 4vw, 3.25rem);
}

.file-inspector-preview-empty-state--error .file-inspector-preview-empty-mark {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--danger, #b54747) 16%, var(--surface-subtle)), color-mix(in srgb, var(--danger, #b54747) 6%, var(--surface-subtle))),
    color-mix(in srgb, var(--surface-bg) 50%, transparent);
  color: var(--danger, #b54747);
}

.file-inspector-preview-empty-state--error .file-inspector-preview-empty-copy h2 {
  color: var(--text-strong);
}

.file-inspector-preview-empty-state--error .file-inspector-preview-empty-copy p {
  color: var(--text-soft);
}

.file-inspector-preview-empty-mark {
  width: 5.5rem;
  height: 5.5rem;
  display: grid;
  place-items: center;
  gap: 0.2rem;
  border-radius: 22px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, var(--surface-subtle)), color-mix(in srgb, var(--accent) 6%, var(--surface-subtle))),
    color-mix(in srgb, var(--surface-bg) 50%, transparent);
  box-shadow:
    0 12px 40px color-mix(in srgb, var(--accent) 8%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 42%, transparent);
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.file-inspector-preview-empty-icon {
  width: 1.5rem;
  height: 1.5rem;
}

.file-inspector-preview-empty-copy {
  display: grid;
  gap: 0.35rem;
  max-width: 24rem;
}

.file-inspector-preview-empty-copy h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.file-inspector-preview-empty-copy p {
  margin: 0;
  color: var(--text-soft);
  font-size: 0.92rem;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .file-inspector-toolbar {
    justify-content: flex-end;
  }

  .file-inspector-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
