<script setup lang="ts">
import { EditorView, basicSetup } from 'codemirror'
import { indentWithTab } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  languageLabel: string
  readOnly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: []
  blur: []
}>()

const rootEl = ref<HTMLDivElement | null>(null)
const editorView = ref<EditorView | null>(null)
let suppressDocChange = false

const editorClass = computed(() => ({
  'tomosona-source-editor': true,
  'tomosona-source-editor--readonly': Boolean(props.readOnly)
}))

function buildState(value: string) {
  return EditorState.create({
    doc: value,
    extensions: [
      basicSetup,
      EditorView.lineWrapping,
      EditorView.editable.of(!props.readOnly),
      EditorView.domEventHandlers({
        focus: () => emit('focus'),
        blur: () => emit('blur')
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        if (suppressDocChange) return
        emit('update:modelValue', update.state.doc.toString())
      }),
      keymap.of([indentWithTab])
    ]
  })
}

function syncFromProp(value: string) {
  const view = editorView.value
  if (!view) return
  const current = view.state.doc.toString()
  if (current === value) return
  suppressDocChange = true
  try {
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value }
    })
  } finally {
    suppressDocChange = false
  }
}

function focus() {
  editorView.value?.focus()
}

onMounted(() => {
  if (!rootEl.value) return
  editorView.value = new EditorView({
    state: buildState(props.modelValue),
    parent: rootEl.value
  })
})

watch(
  () => props.modelValue,
  (value) => {
    syncFromProp(value)
  }
)

watch(
  () => props.readOnly,
  () => {
    const view = editorView.value
    if (!view) return
    const nextState = buildState(view.state.doc.toString())
    view.setState(nextState)
  }
)

onBeforeUnmount(() => {
  editorView.value?.destroy()
  editorView.value = null
})

defineExpose({
  focus
})
</script>

<template>
  <div
    ref="rootEl"
    :class="editorClass"
    :data-language-label="props.languageLabel"
  />
</template>

<style scoped>
.tomosona-source-editor {
  height: 100%;
  min-height: 100%;
  width: 100%;
}

.tomosona-source-editor :deep(.cm-scroller) {
  font-family: var(--font-code);
}

.tomosona-source-editor :deep(.cm-editor) {
  height: 100%;
  min-height: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
}

.tomosona-source-editor :deep(.cm-gutters) {
  background: color-mix(in srgb, var(--surface-muted) 70%, transparent);
  border-right-color: color-mix(in srgb, var(--border-subtle) 70%, transparent);
  color: var(--text-dim);
}

.tomosona-source-editor :deep(.cm-activeLineGutter),
.tomosona-source-editor :deep(.cm-activeLine) {
  background: color-mix(in srgb, var(--surface-subtle) 72%, transparent);
}
</style>
