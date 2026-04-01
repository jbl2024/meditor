<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { PencilSquareIcon, ArrowUturnLeftIcon } from '@heroicons/vue/24/outline'
import { NodeViewWrapper, type Editor } from '@tiptap/vue-3'
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
    }
  }
}>()

const previewHtml = ref('')
const previewPath = ref('')
const loading = ref(false)
const restoring = ref(false)
const error = ref('')
const requestToken = ref(0)

const target = computed(() => String(props.node.attrs.target ?? '').trim())
const label = computed(() => {
  const parsed = parseWikilinkTarget(target.value)
  return parsed.notePath || target.value
})

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

watch(target, () => {
  void refreshPreview()
}, { immediate: true })

onBeforeUnmount(() => {
  requestToken.value += 1
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
        class="tomosona-note-embed-preview"
        v-html="previewHtml"
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
