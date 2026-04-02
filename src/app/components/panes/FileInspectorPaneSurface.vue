<script setup lang="ts">
import { ArrowTopRightOnSquareIcon, DocumentIcon } from '@heroicons/vue/24/outline'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  readPdfDataUrl,
  renderPandocPreviewHtml,
  renderSpreadsheetPreviewHtml
} from '../../../shared/api/workspaceApi'
import UiButton from '../../../shared/components/ui/UiButton.vue'

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
type PreviewThemeSnapshot = {
  colorScheme: 'light' | 'dark'
  vars: Record<string, string>
}

const pdfPreviewSrc = ref('')
const pdfPreviewLoading = ref(false)
const pdfPreviewError = ref('')
const htmlPreviewRaw = ref('')
const htmlPreviewLoading = ref(false)
const htmlPreviewError = ref('')
const previewThemeSnapshot = ref<PreviewThemeSnapshot>(readPreviewThemeSnapshot())
let themeObserver: MutationObserver | null = null
const previewIframeCsp =
  "default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'self' data:; media-src data:"
const headCloseTag = '</' + 'head>'
const bodyCloseTag = '</' + 'body>'
const scriptCloseTag = '<' + '/script>'

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

function buildPreviewThemeStyle(theme: PreviewThemeSnapshot): string {
  const rootVars = Object.entries(theme.vars)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')

  return `
<style id="tomosona-pandoc-theme">
:root {
${rootVars}
}
html {
  color-scheme: ${theme.colorScheme};
  background: var(--app-bg, var(--surface-bg, #f9f9f8));
}
body {
  margin: 0;
  background: var(--app-bg, var(--surface-bg, #f9f9f8));
  color: var(--text-main, #1a1a18);
  font-family: var(--font-editor, var(--font-sans, ui-sans-serif, system-ui, sans-serif));
  line-height: var(--line-height-normal, 1.5);
  -webkit-font-variant-ligatures: none;
  font-variant-ligatures: none;
  font-feature-settings: "liga" 0;
}
.pandoc-preview-shell {
  margin: 0;
  padding: 0 0 2rem;
}
.pandoc-preview {
  width: 800px;
  margin: 0 auto;
  box-sizing: border-box;
  padding-left: 5rem;
  padding-right: 2rem;
  position: relative;
  min-height: 100%;
  --pandoc-scale: 0.88;
  outline: none;
  word-wrap: break-word;
  white-space: pre-wrap;
  white-space: break-spaces;
  -webkit-font-variant-ligatures: none;
  font-variant-ligatures: none;
  font-feature-settings: "liga" 0;
  color: var(--text-main, #1a1a18);
  font-family: var(--font-editor, var(--font-sans, ui-sans-serif, system-ui, sans-serif));
  line-height: var(--line-height-normal, 1.5);
}
.pandoc-preview p {
  font-size: calc(var(--editor-font-size-base, 1rem) * var(--editor-zoom, 1) * var(--pandoc-scale, 1));
  margin: 0.42rem 0;
}
.pandoc-preview strong,
.pandoc-preview b {
  font-weight: 600;
}
.pandoc-preview h1 {
  font-size: calc(var(--editor-heading-1-size, 1.9rem) * var(--editor-zoom, 1) * var(--pandoc-scale, 1));
  font-weight: 580;
  line-height: 1.35;
  margin: 0.68rem 0 0.45rem;
  color: var(--text-main, #1a1a18);
}
.pandoc-preview h2 {
  font-size: calc(var(--editor-heading-2-size, 1.6rem) * var(--editor-zoom, 1) * var(--pandoc-scale, 1));
  line-height: 1.35;
  margin: 0.95rem 0 0.8rem;
  color: var(--text-main, #1a1a18);
}
.pandoc-preview h3 {
  font-size: calc(var(--editor-heading-3-size, 1.35rem) * var(--editor-zoom, 1) * var(--pandoc-scale, 1));
  line-height: 1.35;
  margin: 0.75rem 0 0.45rem;
  color: var(--text-main, #1a1a18);
}
.pandoc-preview h4 {
  font-size: calc(var(--editor-heading-4-size, 1.18rem) * var(--editor-zoom, 1) * var(--pandoc-scale, 1));
  font-weight: 560;
  line-height: 1.35;
  margin: 0.62rem 0 0.35rem;
  color: var(--editor-heading-4, var(--text-main, #1a1a18));
}
.pandoc-preview h5 {
  font-size: calc(var(--editor-heading-5-size, 1.04rem) * var(--editor-zoom, 1) * var(--pandoc-scale, 1));
  font-weight: 540;
  line-height: 1.35;
  margin: 0.5rem 0 0.28rem;
  color: var(--editor-heading-5, var(--text-soft, #5c5c56));
}
.pandoc-preview h6 {
  font-size: calc(var(--editor-heading-6-size, 0.94rem) * var(--editor-zoom, 1) * var(--pandoc-scale, 1));
  font-weight: 520;
  line-height: 1.35;
  margin: 0.45rem 0 0.22rem;
  color: var(--editor-heading-6, var(--text-dim, #7b7b73));
}
.pandoc-preview :not(pre) > code {
  border-radius: 0.34rem;
  padding: 0.06rem 0.38rem;
  font-size: 0.92em;
  font-family: var(--font-code, ui-monospace, SFMono-Regular, monospace);
  background: var(--editor-code-bg, var(--surface-subtle, #edf2f8));
}
.pandoc-preview ul,
.pandoc-preview ol {
  margin: 0.32rem 0 0.45rem 1.35rem;
  padding: 0;
}
.pandoc-preview p + ul,
.pandoc-preview p + ol {
  margin-top: 0.18rem;
}
.pandoc-preview ul {
  list-style: disc;
}
.pandoc-preview ol {
  list-style: decimal;
}
.pandoc-preview ul ul {
  list-style: circle;
  margin-top: 0.24rem;
  margin-bottom: 0.24rem;
}
.pandoc-preview ul ul ul {
  list-style: square;
}
.pandoc-preview ol ol {
  list-style: lower-alpha;
  margin-top: 0.24rem;
  margin-bottom: 0.24rem;
}
.pandoc-preview ol ol ol {
  list-style: lower-roman;
}
.pandoc-preview li {
  margin: 0.2rem 0;
}
.pandoc-preview table {
  width: 100%;
  max-width: 100%;
  min-width: 100% !important;
  width: 100% !important;
  border-collapse: separate;
  border-spacing: 0;
  margin: 0.36rem 0;
  border: 1px solid var(--editor-table-border, var(--border-subtle, #d5dde8));
  border-radius: 0.52rem;
  overflow: hidden;
  background: var(--editor-table-bg, var(--surface-bg, #ffffff));
  font-size: calc(0.82rem * var(--editor-zoom, 1) * var(--pandoc-scale, 1));
  line-height: 1.3;
  table-layout: fixed;
}
.pandoc-preview th,
.pandoc-preview td {
  border-right: 1px solid var(--editor-table-cell-border, var(--border-subtle, #d5dde8));
  border-bottom: 1px solid var(--editor-table-cell-border, var(--border-subtle, #d5dde8));
  padding: 0.24rem 0.34rem;
  vertical-align: top;
  text-align: left;
  position: relative;
  min-width: 2.6rem;
}
.pandoc-preview table p {
  font-size: inherit;
  line-height: inherit;
  margin: 0;
}
.pandoc-preview tr:last-child > th,
.pandoc-preview tr:last-child > td {
  border-bottom: none;
}
.pandoc-preview tr > th:last-child,
.pandoc-preview tr > td:last-child {
  border-right: none;
}
.pandoc-preview th {
  font-weight: 640;
  background: var(
    --editor-table-header-bg,
    color-mix(in srgb, var(--surface-muted, #edf2f8) 70%, var(--surface-bg, #ffffff))
  );
  color: var(--editor-table-header-text, var(--text-main, #1a1a18));
}
.pandoc-preview tbody tr:hover td {
  background: var(--editor-table-hover, transparent);
}
.pandoc-preview td.selectedCell,
.pandoc-preview th.selectedCell {
  background: var(--editor-table-selection, transparent);
}
.pandoc-preview pre {
  border: 1px solid var(--editor-table-cell-border, var(--border-subtle, #d5dde8));
  border-radius: 0.6rem;
  padding: 0.8rem;
  overflow: auto;
  background: var(--surface-bg, #ffffff);
  font-family: var(--font-code, ui-monospace, SFMono-Regular, monospace);
}
.pandoc-preview blockquote {
  margin: 0.24rem 0;
  padding-left: 0;
  border-left: 0;
}
.pandoc-preview blockquote p {
  font-size: calc(0.95rem * var(--editor-zoom, 1) * var(--pandoc-scale, 1));
  line-height: 1.48;
}
.pandoc-preview img,
.pandoc-preview video,
.pandoc-preview svg,
.pandoc-preview canvas {
  max-width: 100%;
}
.pandoc-preview a {
  color: var(--editor-link, var(--accent, #1f5f9b));
}
@media (max-width: 840px) {
  .pandoc-preview-shell {
    padding: 0 1rem 1rem;
  }

  .pandoc-preview {
    width: 100%;
    padding-left: 1rem;
    padding-right: 1rem;
  }
}
</style>
`
}

function buildPreviewKeyboardGuardScript(): string {
  return `
<script>
(function () {
  function isModW(event) {
    return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && (event.key || '').toLowerCase() === 'w';
  }

  window.addEventListener('keydown', function (event) {
    if (!isModW(event)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
})();
${scriptCloseTag}
`
}

function decoratePandocPreviewHtml(html: string, theme: PreviewThemeSnapshot): string {
  const style = buildPreviewThemeStyle(theme)
  const guard = buildPreviewKeyboardGuardScript()
  if (html.includes(headCloseTag)) {
    const withStyle = html.replace(headCloseTag, `${style}\n${headCloseTag}`)
    if (withStyle.includes(bodyCloseTag)) {
      return withStyle.replace(bodyCloseTag, `${guard}\n${bodyCloseTag}`)
    }
    return `${withStyle}\n${guard}`
  }

  return `${style}\n${html}\n${guard}`
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

  return decoratePandocPreviewHtml(htmlPreviewRaw.value, previewThemeSnapshot.value)
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
        :srcdoc="htmlPreviewSrc"
        :title="`Preview for ${fileName}`"
        :csp="previewIframeCsp"
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
