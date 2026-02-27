<script setup lang="ts">
import mermaid from 'mermaid'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'

const props = defineProps<{
  node: { attrs: { code?: string } }
  updateAttributes: (attrs: Record<string, unknown>) => void
  editor: { isEditable: boolean }
  extension: { options?: { confirmReplace?: (payload: { templateLabel: string }) => Promise<boolean> } }
}>()

const code = computed(() => String(props.node.attrs.code ?? ''))
const error = ref('')
const previewEl = ref<HTMLDivElement | null>(null)
let mermaidInitialized = false
let renderCount = 0

const templates = [
  { id: 'flowchart', label: 'Flowchart', code: 'flowchart TD\n  A[Start] --> B[End]' },
  { id: 'sequence', label: 'Sequence', code: 'sequenceDiagram\n  User->>App: Request\n  App-->>User: Response' },
  { id: 'class', label: 'Class', code: 'classDiagram\n  class Note\n  class Workspace\n  Workspace --> Note' }
]

function ensureMermaid() {
  if (mermaidInitialized) return
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true })
  mermaidInitialized = true
}

async function renderPreview() {
  if (!previewEl.value) return
  const value = code.value.trim()
  if (!value) {
    previewEl.value.innerHTML = ''
    error.value = 'Diagram is empty.'
    return
  }

  ensureMermaid()
  try {
    const id = `meditor-mermaid-${++renderCount}`
    const rendered = await mermaid.render(id, value)
    previewEl.value.innerHTML = rendered.svg
    error.value = ''
  } catch (err) {
    previewEl.value.innerHTML = ''
    error.value = err instanceof Error ? err.message : 'Invalid Mermaid diagram.'
  }
}

function onInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement | null)?.value ?? ''
  props.updateAttributes({ code: value })
}

async function onTemplateChange(event: Event) {
  const target = event.target as HTMLSelectElement | null
  const selected = templates.find((item) => item.id === (target?.value ?? ''))
  if (!selected) return

  const current = code.value.trim()
  const nextCode = selected.code.trim()
  if (current && current !== nextCode) {
    const confirmReplace = props.extension.options?.confirmReplace
    const approved = confirmReplace ? await confirmReplace({ templateLabel: selected.label }) : true
    if (!approved) {
      if (target) target.value = ''
      return
    }
  }

  props.updateAttributes({ code: selected.code })
  if (target) target.value = ''
}

onMounted(() => {
  void renderPreview()
})

watch(code, () => {
  void nextTick().then(renderPreview)
})
</script>

<template>
  <NodeViewWrapper class="meditor-mermaid">
    <div class="meditor-mermaid-header">
      <span class="meditor-mermaid-title">Mermaid</span>
      <select v-if="editor.isEditable" class="meditor-mermaid-template" @change="onTemplateChange">
        <option value="">Template</option>
        <option v-for="item in templates" :key="item.id" :value="item.id">{{ item.label }}</option>
      </select>
    </div>

    <div class="meditor-mermaid-body">
      <textarea
        v-if="editor.isEditable"
        class="meditor-mermaid-code"
        :value="code"
        spellcheck="false"
        @input="onInput"
      />
      <pre v-else class="meditor-mermaid-code">{{ code }}</pre>
      <div ref="previewEl" class="meditor-mermaid-preview"></div>
      <div v-if="error" class="meditor-mermaid-error">{{ error }}</div>
    </div>
  </NodeViewWrapper>
</template>
