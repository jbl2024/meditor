<script setup lang="ts">
import { computed } from 'vue'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import UiButton from '../../../../shared/components/ui/UiButton.vue'
import UiInput from '../../../../shared/components/ui/UiInput.vue'
import UiPanel from '../../../../shared/components/ui/UiPanel.vue'

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
  <UiPanel
    v-if="open"
    tone="raised"
    class-name="editor-find-toolbar absolute bottom-4 left-1/2 z-40 flex w-[min(720px,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 px-3 py-2 shadow-lg"
  >
    <UiInput
      :ref="onInputRef"
      class-name="editor-find-toolbar-input min-w-0 flex-1"
      :model-value="query"
      type="text"
      placeholder="Find in note..."
      spellcheck="false"
      data-editor-find-input="true"
      @update:model-value="emit('update:query', $event)"
      @keydown="onInputKeydown"
    />

    <span class="editor-find-toolbar-count min-w-[72px] text-right text-xs tabular-nums">{{ matchLabel }}</span>

    <UiButton
      size="sm"
      variant="ghost"
      class-name="editor-find-toolbar-btn editor-find-toolbar-btn--toggle"
      :active="caseSensitive"
      title="Case sensitive"
      aria-label="Toggle case sensitive search"
      @click="emit('toggle-case-sensitive')"
    >
      Aa
    </UiButton>

    <UiButton
      size="sm"
      variant="ghost"
      class-name="editor-find-toolbar-btn editor-find-toolbar-btn--toggle"
      :active="wholeWord"
      title="Whole word"
      aria-label="Toggle whole word search"
      @click="emit('toggle-whole-word')"
    >
      W
    </UiButton>

    <UiButton
      size="sm"
      variant="secondary"
      class-name="editor-find-toolbar-btn"
      title="Previous match"
      aria-label="Previous match"
      @click="emit('prev')"
    >
      Prev
    </UiButton>

    <UiButton
      size="sm"
      variant="secondary"
      class-name="editor-find-toolbar-btn"
      title="Next match"
      aria-label="Next match"
      @click="emit('next')"
    >
      Next
    </UiButton>

    <UiButton
      size="sm"
      variant="ghost"
      class-name="editor-find-toolbar-btn editor-find-toolbar-btn--close"
      title="Close find"
      aria-label="Close find"
      @click="emit('close')"
    >
      <XMarkIcon class="h-4 w-4" aria-hidden="true" />
    </UiButton>
  </UiPanel>
</template>

<style scoped>
.editor-find-toolbar {
  backdrop-filter: blur(16px);
}

.editor-find-toolbar-input {
  min-width: 0;
}

.editor-find-toolbar-count {
  color: var(--text-dim);
}

.editor-find-toolbar-btn {
  font-size: 0.78rem;
  line-height: 1;
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
