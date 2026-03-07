<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  open: boolean
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  activeMatch: number
  matchCount: number
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  'toggle-case-sensitive': []
  'toggle-whole-word': []
  next: []
  prev: []
  close: []
  'input-ready': [value: HTMLInputElement | null]
}>()

const matchLabel = computed(() => {
  if (!props.query.trim()) return 'Type to search'
  if (!props.matchCount) return 'No results'
  return `${props.activeMatch}/${props.matchCount}`
})

function onInputRef(value: Element | { $el?: Element } | null) {
  const element = value instanceof HTMLInputElement
    ? value
    : value && '$el' in value && value.$el instanceof HTMLInputElement
      ? value.$el
      : null
  emit('input-ready', element)
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    if (event.shiftKey) emit('prev')
    else emit('next')
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  }
}
</script>

<template>
  <div
    v-if="open"
    class="editor-find-toolbar absolute bottom-4 left-1/2 z-40 flex w-[min(720px,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 rounded-xl border px-3 py-2 shadow-lg"
  >
    <input
      :ref="onInputRef"
      class="editor-find-toolbar-input min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
      :value="query"
      type="text"
      placeholder="Find in note..."
      spellcheck="false"
      data-editor-find-input="true"
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      @keydown="onInputKeydown"
    >

    <span class="editor-find-toolbar-count min-w-[72px] text-right text-xs tabular-nums">{{ matchLabel }}</span>

    <button
      type="button"
      class="editor-find-toolbar-btn editor-find-toolbar-btn--toggle"
      :class="{ active: caseSensitive }"
      title="Case sensitive"
      aria-label="Toggle case sensitive search"
      @click="emit('toggle-case-sensitive')"
    >
      Aa
    </button>

    <button
      type="button"
      class="editor-find-toolbar-btn editor-find-toolbar-btn--toggle"
      :class="{ active: wholeWord }"
      title="Whole word"
      aria-label="Toggle whole word search"
      @click="emit('toggle-whole-word')"
    >
      W
    </button>

    <button
      type="button"
      class="editor-find-toolbar-btn"
      title="Previous match"
      aria-label="Previous match"
      @click="emit('prev')"
    >
      Prev
    </button>

    <button
      type="button"
      class="editor-find-toolbar-btn"
      title="Next match"
      aria-label="Next match"
      @click="emit('next')"
    >
      Next
    </button>

    <button
      type="button"
      class="editor-find-toolbar-btn editor-find-toolbar-btn--close"
      title="Close find"
      aria-label="Close find"
      @click="emit('close')"
    >
      x
    </button>
  </div>
</template>

<style scoped>
.editor-find-toolbar {
  border-color: color-mix(in srgb, var(--border-subtle) 78%, transparent);
  background: color-mix(in srgb, var(--surface-bg) 86%, transparent);
  backdrop-filter: blur(16px);
}

.editor-find-toolbar-input {
  border-color: var(--border-subtle);
  background: color-mix(in srgb, var(--app-bg) 42%, var(--surface-bg));
  color: var(--text-main);
}

.editor-find-toolbar-input:focus {
  border-color: color-mix(in srgb, var(--editor-link) 55%, var(--border-subtle));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--editor-link) 28%, transparent);
}

.editor-find-toolbar-count {
  color: var(--text-dim);
}

.editor-find-toolbar-btn {
  border: 1px solid var(--border-subtle);
  border-radius: 0.7rem;
  background: color-mix(in srgb, var(--surface-bg) 72%, var(--app-bg));
  color: var(--text-main);
  font-size: 0.78rem;
  line-height: 1;
  min-height: 2.2rem;
  padding: 0.58rem 0.8rem;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease;
}

.editor-find-toolbar-btn:hover {
  border-color: color-mix(in srgb, var(--editor-link) 35%, var(--border-subtle));
  background: color-mix(in srgb, var(--surface-bg) 60%, var(--editor-link) 12%);
}

.editor-find-toolbar-btn:active {
  transform: translateY(1px);
}

.editor-find-toolbar-btn.active {
  border-color: color-mix(in srgb, var(--editor-link) 54%, var(--border-subtle));
  background: color-mix(in srgb, var(--editor-link) 18%, var(--surface-bg));
  color: var(--text-main);
}

.editor-find-toolbar-btn--toggle {
  min-width: 2.6rem;
  padding-left: 0.7rem;
  padding-right: 0.7rem;
}

.editor-find-toolbar-btn--close {
  min-width: 2.2rem;
  padding-left: 0.65rem;
  padding-right: 0.65rem;
}
</style>
