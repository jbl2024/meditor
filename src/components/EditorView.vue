<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorJS from '@editorjs/editorjs'
import UiButton from './ui/UiButton.vue'

// IO functions are passed from App.vue so this component stays UI-focused.
const props = defineProps<{
  path: string
  openFile: (path: string) => Promise<string>
  saveFile: (path: string, text: string) => Promise<void>
}>()

const holder = ref<HTMLDivElement | null>(null)
let editor: EditorJS | null = null
const loadedText = ref<string>('')

function markdownToBlocks(md: string) {
  // Minimal bootstrap conversion: keep all content in one paragraph block.
  const text = md.trim()
  return {
    time: Date.now(),
    blocks: [
      { type: 'paragraph', data: { text: text.replace(/\n/g, '<br>') } }
    ],
    version: '2.0.0'
  }
}

function blocksToMarkdown(data: any) {
  // Minimal conversion: merge paragraph blocks as plain text.
  const parts: string[] = []
  for (const b of (data?.blocks ?? [])) {
    if (b.type === 'paragraph') {
      const t = String(b.data?.text ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
      parts.push(t)
    } else {
      parts.push('')
    }
  }
  return parts.join('\n\n').trim() + '\n'
}

async function ensureEditor() {
  if (!holder.value) return
  if (editor) return

  editor = new EditorJS({
    holder: holder.value,
    autofocus: true,
    placeholder: 'Write here...',
    tools: {
      // Intentionally minimal bootstrap.
    }
  })
}

async function loadCurrentFile() {
  const p = props.path?.trim()
  if (!p) return
  await ensureEditor()
  if (!editor) return

  const txt = await props.openFile(p)
  loadedText.value = txt
  await editor.render(markdownToBlocks(txt))
}

async function saveCurrentFile() {
  const p = props.path?.trim()
  if (!p || !editor) return
  const data = await editor.save()
  const md = blocksToMarkdown(data)
  await props.saveFile(p, md)
  loadedText.value = md
}

watch(() => props.path, async () => {
  if (!props.path) return
  await loadCurrentFile()
})

onMounted(async () => {
  await ensureEditor()
})

onBeforeUnmount(async () => {
  if (editor) {
    await editor.destroy()
    editor = null
  }
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3">
    <div class="flex items-center gap-2">
      <UiButton :disabled="!path" size="sm" @click="loadCurrentFile">Reload</UiButton>
      <UiButton :disabled="!path" size="sm" variant="primary" @click="saveCurrentFile">Save</UiButton>
      <span v-if="!path" class="text-xs text-slate-500 dark:text-slate-500">Select a file</span>
    </div>
    <div
      ref="holder"
      class="editor-holder min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/85 p-3 dark:border-slate-700/70 dark:bg-slate-950/65"
    ></div>
  </div>
</template>
