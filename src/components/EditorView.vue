<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorJS from '@editorjs/editorjs'

// Props: on passe les fonctions IO depuis App.vue pour garder le composant neutre
const props = defineProps<{
  path: string
  openFile: (path: string) => Promise<string>
  saveFile: (path: string, text: string) => Promise<void>
}>()

const holder = ref<HTMLDivElement | null>(null)
let editor: EditorJS | null = null
const loadedText = ref<string>('')

function markdownToBlocks(md: string) {
  // Conversion minimale pour bootstrap: tout dans un bloc paragraph.
  // Tu raffineras ensuite: headings, listes, code, etc.
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
  // Conversion minimale: concat des paragraphes en texte.
  // Tu remplaceras par un convertisseur plus serieux quand tu voudras.
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
    placeholder: 'Ecris ici...',
    tools: {
      // Bootstrap volontairement minimal.
      // Tu ajouteras Header, List, Code, etc.
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
  <div class="wrap">
    <div class="toolbar">
      <button :disabled="!path" @click="loadCurrentFile">Recharger</button>
      <button :disabled="!path" @click="saveCurrentFile">Sauvegarder</button>
      <span class="muted" v-if="!path">Selectionne un fichier</span>
    </div>
    <div ref="holder" class="holder"></div>
  </div>
</template>

<style scoped>
.wrap { display: flex; flex-direction: column; gap: 8px; height: 100%; }
.toolbar { display: flex; align-items: center; gap: 8px; }
.muted { color: #666; font-size: 12px; }
.holder { flex: 1; border: 1px solid #eee; border-radius: 10px; padding: 12px; overflow: auto; }
</style>
