<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { PencilSquareIcon, ArrowUturnLeftIcon } from '@heroicons/vue/24/outline'
import { NodeViewWrapper, type Editor } from '@tiptap/vue-3'
import { readImageDataUrl } from '../../../../../shared/api/workspaceApi'
import { decodeWorkspacePathSegments, isAbsoluteWorkspacePath } from '../../../../../domains/explorer/lib/workspacePaths'
import { parseRelativeMarkdownHref } from '../../../lib/markdownBlocks'
import { parseWikilinkTarget } from '../../../lib/wikilinks'

type EmbeddedNotePreview = {
  path: string
  html: string
}

const props = defineProps<{
  node: { attrs: { target?: string } }
  editor: Editor
  getPos?: () => number
    extension: {
      options?: {
        loadEmbeddedNotePreview?: (target: string) => Promise<EmbeddedNotePreview | null>
        openEmbeddedNote?: (target: string) => Promise<void>
        restoreEmbeddedNoteInline?: (target: string, editor: Editor, getPos: () => number) => Promise<void>
        openLinkTarget?: (target: string) => Promise<void>
        openExternalUrl?: (value: string) => Promise<void>
      }
    }
  }>()

const previewHtml = ref('')
const previewPath = ref('')
const previewRoot = ref<HTMLDivElement | null>(null)
const loading = ref(false)
const restoring = ref(false)
const error = ref('')
const requestToken = ref(0)
let previewHydrationToken = 0
const LOCAL_IMAGE_PLACEHOLDER_SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

const target = computed(() => String(props.node.attrs.target ?? '').trim())
const label = computed(() => {
  const parsed = parseWikilinkTarget(target.value)
  return parsed.notePath || target.value
})
const renderedPreviewHtml = computed(() => rewriteLocalImageSources(previewHtml.value, previewPath.value))

function splitAbsolutePath(path: string): { prefix: string; segments: string[] } | null {
  const normalized = decodeWorkspacePathSegments(path)
  if (!normalized || !isAbsoluteWorkspacePath(normalized)) return null
  if (/^[A-Za-z]:\//.test(normalized)) {
    return {
      prefix: normalized.slice(0, 3),
      segments: normalized.slice(3).split('/').filter(Boolean)
    }
  }
  if (normalized.startsWith('/')) {
    return {
      prefix: '/',
      segments: normalized.slice(1).split('/').filter(Boolean)
    }
  }
  return null
}

function resolvePreviewImagePath(notePath: string, rawSrc: string): string | null {
  const src = decodeWorkspacePathSegments(rawSrc)
  if (!src) return null
  if (/^(?:https?|data|blob|asset|tauri|file):/i.test(src)) return null
  if (isAbsoluteWorkspacePath(src)) return src

  const base = splitAbsolutePath(notePath)
  if (!base || base.segments.length === 0) return null
  const segments = base.segments.slice(0, -1)

  for (const segment of src.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (!segments.length) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  return base.prefix === '/'
    ? `/${segments.join('/')}`
    : `${base.prefix}${segments.join('/')}`
}

function resolvePreviewMarkdownPath(notePath: string, href: string): string | null {
  const parsed = parseRelativeMarkdownHref(href)
  if (!parsed) return null

  const base = splitAbsolutePath(notePath)
  if (!base || base.segments.length === 0) return null
  const segments = base.segments.slice(0, -1)
  const relativePath = decodeWorkspacePathSegments(parsed.path)

  for (const segment of relativePath.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (!segments.length) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  const resolvedPath = base.prefix === '/'
    ? `/${segments.join('/')}`
    : `${base.prefix}${segments.join('/')}`
  return parsed.fragment ? `${resolvedPath}#${parsed.fragment}` : resolvedPath
}

function rewriteLocalImageSources(html: string, notePath: string): string {
  if (!html || !html.includes('<img')) return html

  const root = document.createElement('div')
  root.innerHTML = html

  const images = Array.from(root.querySelectorAll('img'))
  for (const image of images) {
    const rawSrc = image.getAttribute('src')?.trim() ?? ''
    const resolvedPath = resolvePreviewImagePath(notePath, rawSrc)
    if (!resolvedPath) continue
    image.setAttribute('data-local-src', resolvedPath)
    image.setAttribute('src', LOCAL_IMAGE_PLACEHOLDER_SRC)
  }

  return root.innerHTML
}

async function hydrateLocalPreviewImages() {
  const token = ++previewHydrationToken
  await nextTick()
  if (token !== previewHydrationToken) return

  const root = previewRoot.value
  if (!root) return

  const images = Array.from(root.querySelectorAll('img'))
  for (const image of images) {
    const rawSrc = image.getAttribute('data-local-src')?.trim() ?? ''
    const normalizedPath = decodeWorkspacePathSegments(rawSrc)
    if (!normalizedPath || !isAbsoluteWorkspacePath(normalizedPath)) continue

    try {
      const dataUrl = await readImageDataUrl(normalizedPath)
      if (token !== previewHydrationToken) return
      if (image.isConnected) {
        image.setAttribute('src', dataUrl)
        image.removeAttribute('data-local-src')
      }
    } catch (error) {
      console.warn('[editor] note-embed image preview failed', {
        notePath: previewPath.value,
        src: rawSrc,
        normalizedPath,
        error
      })
      // Embedded note previews stay best-effort and fall back to the placeholder.
    }
  }
}

async function refreshPreview() {
  const loader = props.extension.options?.loadEmbeddedNotePreview
  const noteTarget = target.value
  requestToken.value += 1
  const token = requestToken.value

  if (!loader || !noteTarget) {
    previewHtml.value = ''
    previewPath.value = ''
    error.value = noteTarget ? 'Preview unavailable.' : ''
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''

  try {
    const preview = await loader(noteTarget)
    if (token !== requestToken.value) return
    previewHtml.value = preview?.html ?? ''
    previewPath.value = preview?.path ?? ''
    error.value = preview ? '' : 'Preview unavailable.'
  } catch {
    if (token !== requestToken.value) return
    previewHtml.value = ''
    previewPath.value = ''
    error.value = 'Preview unavailable.'
  } finally {
    if (token !== requestToken.value) return
    loading.value = false
  }
}

async function openTargetInTab() {
  const opener = props.extension.options?.openEmbeddedNote
  const noteTarget = target.value
  if (!opener || !noteTarget) return
  try {
    await opener(noteTarget)
  } catch {
    // Keep the preview read-only; opening the note is a best-effort action.
  }
}

async function restoreTargetInline() {
  const restorer = props.extension.options?.restoreEmbeddedNoteInline
  const noteTarget = target.value
  const getPos = props.getPos
  if (!restorer || !noteTarget || !getPos || !props.editor.isEditable || restoring.value) return

  restoring.value = true
  try {
    await restorer(noteTarget, props.editor, getPos)
  } catch {
    // Keep the preview read-only; restoring inline is a best-effort action.
  } finally {
    restoring.value = false
  }
}

function findPreviewAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  const element = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null
  return element?.closest('a') as HTMLAnchorElement | null
}

function onPreviewClick(event: MouseEvent) {
  const anchor = findPreviewAnchor(event.target)
  if (!anchor) return

  const markdownTarget = anchor.getAttribute('data-markdown-target')?.trim() ?? ''
  if (markdownTarget) {
    if (event.metaKey || event.ctrlKey) return
    event.preventDefault()
    event.stopPropagation()
    void props.extension.options?.openLinkTarget?.(markdownTarget)
    return
  }

  const href = anchor.getAttribute('href')?.trim() ?? ''
  if (!href) return

  if (event.metaKey || event.ctrlKey) return

  event.preventDefault()
  event.stopPropagation()

  const resolvedMarkdownTarget = resolvePreviewMarkdownPath(previewPath.value, href)
  if (resolvedMarkdownTarget) {
    void props.extension.options?.openLinkTarget?.(resolvedMarkdownTarget)
    return
  }

  const safeExternalHref = href.trim()
  if (/^(?:https?|mailto:)/i.test(safeExternalHref)) {
    void props.extension.options?.openExternalUrl?.(safeExternalHref)
  }
}

watch(target, () => {
  void refreshPreview()
}, { immediate: true })

watch([renderedPreviewHtml, previewPath], () => {
  if (!renderedPreviewHtml.value) return
  void hydrateLocalPreviewImages()
}, { immediate: true })

onBeforeUnmount(() => {
  requestToken.value += 1
  previewHydrationToken += 1
})
</script>

<template>
  <NodeViewWrapper class="tomosona-note-embed" data-note-embed-node="true">
    <div class="tomosona-note-embed-surface" :class="{ 'is-editable': editor.isEditable }">
      <header class="tomosona-note-embed-header">
        <span class="tomosona-note-embed-title-row">
          <span class="tomosona-note-embed-label">{{ label }}</span>
        </span>
        <span class="tomosona-note-embed-actions">
          <button
            type="button"
            class="tomosona-note-embed-action-btn"
            aria-label="Edit note"
            title="Edit note"
            @mousedown.prevent
            @click.stop="void openTargetInTab()"
          >
            <PencilSquareIcon class="h-3.5 w-3.5" />
          </button>
          <button
            v-if="editor.isEditable"
            type="button"
            class="tomosona-note-embed-action-btn"
            aria-label="Restore inline"
            title="Restore inline"
            :disabled="restoring"
            @mousedown.prevent
            @click.stop="void restoreTargetInline()"
          >
            <ArrowUturnLeftIcon class="h-3.5 w-3.5" />
          </button>
        </span>
        <span v-if="loading" class="tomosona-note-embed-state">Loading</span>
      </header>
      <div
        v-if="previewHtml"
        ref="previewRoot"
        class="tomosona-note-embed-preview"
        v-html="renderedPreviewHtml"
        @click="onPreviewClick"
      />
      <p v-else class="tomosona-note-embed-fallback">
        {{ error || 'Preview unavailable.' }}
      </p>
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.tomosona-note-embed {
  margin: 0.75rem 0;
}

.tomosona-note-embed-surface {
  border: 1px solid var(--editor-source-border);
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--editor-overlay-panel) 50%, transparent);
  padding: 0.85rem 0.95rem;
}

.tomosona-note-embed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.7rem;
  font-size: 0.78rem;
  color: var(--editor-source-text);
}

.tomosona-note-embed-title-row {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  flex: 1 1 auto;
}

.tomosona-note-embed-label {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tomosona-note-embed-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0;
  pointer-events: none;
  transform: translateX(0.15rem);
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.tomosona-note-embed-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 999px;
  color: var(--editor-source-text);
  opacity: 0.7;
  transition: opacity 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}

.tomosona-note-embed-action-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--editor-overlay-panel) 30%, transparent);
  color: var(--text-main);
  opacity: 1;
}

.tomosona-note-embed-action-btn:disabled {
  cursor: default;
  opacity: 0.45;
}

.tomosona-note-embed-surface:hover .tomosona-note-embed-actions,
.tomosona-note-embed-surface:focus-within .tomosona-note-embed-actions {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
}

.tomosona-note-embed-state {
  flex-shrink: 0;
  opacity: 0.75;
}

.tomosona-note-embed-preview {
  display: grid;
  gap: 0.5rem;
}

.tomosona-note-embed-preview :deep(p) {
  margin: 0;
}

.tomosona-note-embed-preview :deep(ul),
.tomosona-note-embed-preview :deep(ol) {
  margin: 0.25rem 0 0;
  padding-left: 1.2rem;
}

.tomosona-note-embed-preview :deep(blockquote) {
  margin: 0.25rem 0 0;
  padding-left: 0.75rem;
  border-left: 2px solid var(--editor-source-border);
}

.tomosona-note-embed-fallback {
  margin: 0;
  font-size: 0.9rem;
  color: var(--editor-source-text);
  opacity: 0.75;
}
</style>
