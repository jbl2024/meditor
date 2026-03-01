<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { common, createLowlight } from 'lowlight'
import { sanitizeHtmlForPreview } from '../../../lib/htmlSanitizer'

const INDENT = '  '
const lowlight = createLowlight(common)

type HastNode = {
  type?: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

const props = defineProps<{
  node: { attrs: { html?: string } }
  updateAttributes: (attrs: Record<string, unknown>) => void
  editor: { isEditable: boolean }
}>()

const sourceTextarea = ref<HTMLTextAreaElement | null>(null)
const sourcePre = ref<HTMLElement | null>(null)
const showSource = ref(false)

const html = computed(() => String(props.node.attrs.html ?? ''))
const sanitizedPreview = computed(() => sanitizeHtmlForPreview(html.value))
const highlightedSource = computed(() => highlightHtmlSource(html.value))

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function hastToHtml(node: HastNode): string {
  if (node.type === 'text') return escapeHtml(String(node.value ?? ''))
  if (node.type !== 'element') return ''
  const tag = String(node.tagName ?? 'span')
  const rawClasses = node.properties?.className
  const className = Array.isArray(rawClasses)
    ? rawClasses.map((entry) => String(entry)).join(' ')
    : typeof rawClasses === 'string'
      ? rawClasses
      : ''
  const attrs = className ? ` class="${escapeHtml(className)}"` : ''
  const children = Array.isArray(node.children) ? node.children.map((child) => hastToHtml(child)).join('') : ''
  return `<${tag}${attrs}>${children}</${tag}>`
}

function highlightHtmlSource(value: string): string {
  if (!value) return ''
  try {
    const tree = lowlight.highlight('xml', value)
    const nodes = Array.isArray(tree.children) ? tree.children as HastNode[] : []
    return nodes.map((node) => hastToHtml(node)).join('')
  } catch {
    return escapeHtml(value)
  }
}

function onInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement | null)?.value ?? ''
  props.updateAttributes({ html: value })
}

function onEditorToggle(event?: MouseEvent) {
  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }
  showSource.value = !showSource.value
  if (showSource.value) {
    void nextTick().then(() => sourceTextarea.value?.focus())
  }
}

function syncHighlightedScroll() {
  if (!sourceTextarea.value || !sourcePre.value) return
  sourcePre.value.scrollTop = sourceTextarea.value.scrollTop
  sourcePre.value.scrollLeft = sourceTextarea.value.scrollLeft
}

function commitValue(nextValue: string, start: number, end: number) {
  props.updateAttributes({ html: nextValue })
  void nextTick().then(() => {
    sourceTextarea.value?.setSelectionRange(start, end)
    syncHighlightedScroll()
  })
}

function applyTabIndentation(textarea: HTMLTextAreaElement, unindent: boolean) {
  const source = textarea.value
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? start

  if (!unindent) {
    if (start === end) {
      const next = `${source.slice(0, start)}${INDENT}${source.slice(end)}`
      commitValue(next, start + INDENT.length, start + INDENT.length)
      return
    }

    const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const selectedBlock = source.slice(lineStart, end)
    const lines = selectedBlock.split('\n')
    const indented = lines.map((line) => `${INDENT}${line}`).join('\n')
    const next = `${source.slice(0, lineStart)}${indented}${source.slice(end)}`
    const addedChars = INDENT.length * lines.length
    commitValue(next, start + INDENT.length, end + addedChars)
    return
  }

  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const selectedBlock = source.slice(lineStart, end)
  const lines = selectedBlock.split('\n')
  let removedTotal = 0
  let removedFirstLine = 0
  const updatedLines = lines.map((line, index) => {
    if (line.startsWith(INDENT)) {
      removedTotal += INDENT.length
      if (index === 0) removedFirstLine = INDENT.length
      return line.slice(INDENT.length)
    }
    if (line.startsWith('\t')) {
      removedTotal += 1
      if (index === 0) removedFirstLine = 1
      return line.slice(1)
    }
    if (line.startsWith(' ')) {
      removedTotal += 1
      if (index === 0) removedFirstLine = 1
      return line.slice(1)
    }
    return line
  })
  if (removedTotal === 0) return

  const next = `${source.slice(0, lineStart)}${updatedLines.join('\n')}${source.slice(end)}`
  const nextStart = Math.max(lineStart, start - removedFirstLine)
  const nextEnd = Math.max(nextStart, end - removedTotal)
  commitValue(next, nextStart, nextEnd)
}

function applyAutoIndent(textarea: HTMLTextAreaElement) {
  const source = textarea.value
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? start
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const currentLine = source.slice(lineStart, start)
  const indent = currentLine.match(/^[ \t]*/)?.[0] ?? ''
  const insertion = `\n${indent}`
  const next = `${source.slice(0, start)}${insertion}${source.slice(end)}`
  const nextPos = start + insertion.length
  commitValue(next, nextPos, nextPos)
}

function onEditorKeydown(event: KeyboardEvent) {
  if (!props.editor.isEditable) return
  const textarea = event.target as HTMLTextAreaElement | null
  if (!textarea) return

  if (event.key === 'Tab') {
    event.preventDefault()
    applyTabIndentation(textarea, event.shiftKey)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    applyAutoIndent(textarea)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    showSource.value = false
  }
}
</script>

<template>
  <NodeViewWrapper class="meditor-html-node" :class="{ 'is-editing': editor.isEditable && showSource }">
    <div class="meditor-html-surface">
      <div class="meditor-html-body">
        <button
          v-if="editor.isEditable"
          type="button"
          class="meditor-html-toggle-btn"
          contenteditable="false"
          @mousedown.stop.prevent="onEditorToggle($event)"
        >
          &lt;/&gt;
        </button>
        <div
          v-if="!showSource"
          class="meditor-html-preview"
          contenteditable="false"
          v-html="sanitizedPreview"
        ></div>

        <div v-else class="meditor-html-source-shell">
          <pre ref="sourcePre" class="meditor-html-source" aria-hidden="true"><code class="hljs language-xml" v-html="highlightedSource"></code></pre>
          <textarea
            ref="sourceTextarea"
            class="meditor-html-textarea"
            :value="html"
            spellcheck="false"
            @input="onInput"
            @scroll="syncHighlightedScroll"
            @keydown="onEditorKeydown"
          />
        </div>
      </div>
    </div>
   </NodeViewWrapper>
</template>

<style scoped>
.meditor-html-node {
  margin: 0.5rem 0;
}

.meditor-html-surface {
  position: relative;
}

.meditor-html-body {
  position: relative;
}

.meditor-html-toggle-btn {
  border: 1px solid rgb(203 213 225);
  border-radius: 0.4rem;
  background: white;
  color: rgb(51 65 85);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1;
  padding: 0.24rem 0.42rem;
  position: absolute;
  right: 0.58rem;
  top: 0.56rem;
  z-index: 2;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
  visibility: hidden;
}

.meditor-html-toggle-btn:hover {
  background: rgb(248 250 252);
}

.meditor-html-preview {
  border: 1px solid transparent;
  border-radius: 0.7rem;
  padding: 2.45rem 1.05rem 1rem;
  transition: border-color 120ms ease, background-color 120ms ease;
}

.meditor-html-source-shell {
  position: relative;
}

.meditor-html-source,
.meditor-html-textarea {
  border: 1px solid rgb(203 213 225);
  border-radius: 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  line-height: 1.45;
  margin: 0;
  min-height: 180px;
  overflow: auto;
  padding: 0.8rem 0.92rem;
  white-space: pre;
  width: 100%;
}

.meditor-html-source {
  color: rgb(15 23 42);
  pointer-events: none;
}

.meditor-html-textarea {
  background: transparent;
  caret-color: rgb(37 99 235);
  color: transparent;
  left: 0;
  position: absolute;
  resize: vertical;
  top: 0;
}

.meditor-html-textarea::selection {
  background: rgb(59 130 246 / 0.24);
}

.meditor-html-source code.hljs {
  color: #0f172a;
}

.meditor-html-source code :deep(.hljs-tag),
.meditor-html-source code :deep(.hljs-name),
.meditor-html-source code :deep(.hljs-selector-tag) {
  color: #dc2626;
}

.meditor-html-source code :deep(.hljs-attr) {
  color: #b45309;
}

.meditor-html-source code :deep(.hljs-string) {
  color: #0f766e;
}

.dark .meditor-html-toggle-btn {
  border-color: rgb(71 85 105);
  background: rgb(15 23 42);
  color: rgb(226 232 240);
}

.dark .meditor-html-toggle-btn:hover {
  background: rgb(30 41 59);
}

.dark .meditor-html-preview,
.dark .meditor-html-source,
.dark .meditor-html-textarea {
  border-color: rgb(71 85 105);
}

.meditor-html-node:hover .meditor-html-toggle-btn,
.meditor-html-node.is-editing .meditor-html-toggle-btn {
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
}

.meditor-html-node:hover .meditor-html-preview,
.meditor-html-node.is-editing .meditor-html-preview {
  border-color: rgb(203 213 225);
}

.dark .meditor-html-node:hover .meditor-html-preview,
.dark .meditor-html-node.is-editing .meditor-html-preview {
  border-color: rgb(71 85 105);
}

.dark .meditor-html-source {
  background: rgb(15 23 42);
  color: rgb(226 232 240);
}

.dark .meditor-html-source code.hljs {
  color: #e2e8f0;
}

.dark .meditor-html-source code :deep(.hljs-tag),
.dark .meditor-html-source code :deep(.hljs-name),
.dark .meditor-html-source code :deep(.hljs-selector-tag) {
  color: #fda4af;
}

.dark .meditor-html-source code :deep(.hljs-attr) {
  color: #fbbf24;
}

.dark .meditor-html-source code :deep(.hljs-string) {
  color: #34d399;
}
</style>
