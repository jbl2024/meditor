<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorJS, { type OutputBlockData } from '@editorjs/editorjs'
import CodeTool from '@editorjs/code'
import Delimiter from '@editorjs/delimiter'
import Header from '@editorjs/header'
import InlineCode from '@editorjs/inline-code'
import List from '@editorjs/list'
import Paragraph from '@editorjs/paragraph'
import Quote from '@editorjs/quote'
import { editorDataToMarkdown, markdownToEditorData } from '../lib/markdownBlocks'
import UiButton from './ui/UiButton.vue'

const AUTOSAVE_IDLE_MS = 2500

type SlashCommand = {
  id: string
  label: string
  type: string
  data: Record<string, unknown>
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'heading', label: 'Heading', type: 'header', data: { text: '', level: 2 } },
  { id: 'bullet', label: 'List', type: 'list', data: { style: 'unordered', items: [] } },
  { id: 'checklist', label: 'Checklist', type: 'list', data: { style: 'checklist', items: [] } },
  { id: 'code', label: 'Code', type: 'code', data: { code: '' } },
  { id: 'quote', label: 'Quote', type: 'quote', data: { text: '', caption: '', alignment: 'left' } },
  { id: 'divider', label: 'Divider', type: 'delimiter', data: {} }
]

const props = defineProps<{
  path: string
  openFile: (path: string) => Promise<string>
  saveFile: (path: string, text: string) => Promise<void>
}>()

const holder = ref<HTMLDivElement | null>(null)
let editor: EditorJS | null = null
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let suppressOnChange = false

const loadedText = ref('')
const isDirty = ref(false)
const isSaving = ref(false)
const saveError = ref('')

const slashOpen = ref(false)
const slashIndex = ref(0)
const slashLeft = ref(0)
const slashTop = ref(0)

const saveLabel = computed(() => (isSaving.value ? 'Saving...' : 'Save'))
const statusText = computed(() => {
  if (!props.path) return 'Select a file'
  if (saveError.value) return saveError.value
  if (isSaving.value) return 'Autosaving...'
  if (isDirty.value) return 'Unsaved changes'
  return 'All changes saved'
})

function clearAutosaveTimer() {
  if (!autosaveTimer) return
  clearTimeout(autosaveTimer)
  autosaveTimer = null
}

function scheduleAutosave() {
  clearAutosaveTimer()
  autosaveTimer = setTimeout(() => {
    void saveCurrentFile(false)
  }, AUTOSAVE_IDLE_MS)
}

function closeSlashMenu() {
  slashOpen.value = false
  slashIndex.value = 0
}

function getCurrentBlock() {
  if (!editor) return null
  const index = editor.blocks.getCurrentBlockIndex()
  if (index < 0) return null
  return editor.blocks.getBlockByIndex(index) ?? null
}

function getEditableElement(block: { holder: HTMLElement }) {
  return block.holder.querySelector('[contenteditable="true"]') as HTMLElement | null
}

function getCurrentBlockText(block: { holder: HTMLElement }) {
  const editable = getEditableElement(block)
  return (editable?.innerText ?? '').replace(/\u200B/g, '').trim()
}

function isCurrentBlockEmpty() {
  const block = getCurrentBlock()
  if (!block) return false
  return getCurrentBlockText(block).length === 0
}

function placeCaretInBlock(blockId: string) {
  if (!editor) return
  const block = editor.blocks.getById(blockId)
  if (!block) return

  const editable = getEditableElement(block)
  if (!editable) return

  editable.focus()
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  range.selectNodeContents(editable)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function openSlashMenuAtCaret() {
  if (!holder.value) return

  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  const caretRect = range?.getBoundingClientRect()
  const holderRect = holder.value.getBoundingClientRect()

  slashLeft.value = Math.max(8, (caretRect?.left ?? holderRect.left) - holderRect.left)
  slashTop.value = Math.max(8, (caretRect?.bottom ?? holderRect.top) - holderRect.top + 8)
  slashIndex.value = 0
  slashOpen.value = true
}

async function replaceCurrentBlock(type: string, data: Record<string, unknown>) {
  if (!editor) return
  const index = editor.blocks.getCurrentBlockIndex()
  if (index < 0) return

  const inserted = editor.blocks.insert(type, data, undefined, index, true, true)
  placeCaretInBlock(inserted.id)
}

function applyMarkdownShortcut(marker: string) {
  const checklistMatch = marker.match(/^(-\s*)?\[([ xX]?)\]$/)
  if (checklistMatch) {
    return {
      type: 'list',
      data: {
        style: 'checklist',
        items: [{ content: '', meta: { checked: checklistMatch[2].toLowerCase() === 'x' }, items: [] }]
      }
    }
  }

  switch (marker) {
    case '-':
    case '*':
    case '+':
      return { type: 'list', data: { style: 'unordered', items: [] } }
    case '1.':
      return { type: 'list', data: { style: 'ordered', items: [] } }
    case '>':
      return { type: 'quote', data: { text: '', caption: '', alignment: 'left' } }
    case '```':
      return { type: 'code', data: { code: '' } }
    default:
      break
  }

  if (/^#{1,6}$/.test(marker)) {
    return {
      type: 'header',
      data: { text: '', level: marker.length }
    }
  }

  return null
}

function onEditorKeydown(event: KeyboardEvent) {
  if (!editor) return

  if (slashOpen.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      slashIndex.value = (slashIndex.value + 1) % SLASH_COMMANDS.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      slashIndex.value = (slashIndex.value - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const command = SLASH_COMMANDS[slashIndex.value]
      closeSlashMenu()
      void replaceCurrentBlock(command.type, command.data)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSlashMenu()
      return
    }
  }

  const block = getCurrentBlock()
  if (!block) return

  if (event.key === '/' && block.name === 'paragraph' && isCurrentBlockEmpty()) {
    event.preventDefault()
    openSlashMenuAtCaret()
    return
  }

  if (event.key === ' ' && block.name === 'paragraph') {
    const marker = getCurrentBlockText(block)
    const transform = applyMarkdownShortcut(marker)
    if (transform) {
      event.preventDefault()
      closeSlashMenu()
      void replaceCurrentBlock(transform.type, transform.data)
      return
    }
  }

  if (event.key === 'Enter' && block.name === 'paragraph') {
    const marker = getCurrentBlockText(block)
    if (marker === '```') {
      event.preventDefault()
      closeSlashMenu()
      void replaceCurrentBlock('code', { code: '' })
      return
    }
  }

  if (event.key === 'Backspace' && block.name === 'header' && getCurrentBlockText(block).length === 0) {
    event.preventDefault()
    closeSlashMenu()
    void replaceCurrentBlock('paragraph', { text: '' })
  }
}

function looksLikeMarkdown(text: string): boolean {
  return /(^#{1,6}\s)|(^\s*[-*+]\s)|(^\s*[-*+]\s+\[[ xX]?\])|(^\s*\d+\.\s)|(^>\s)|(```)|(\[[^\]]+\]\([^)]+\))/m.test(text)
}

function isLikelyMarkdownPaste(plain: string, html: string): boolean {
  if (!plain.trim()) return false
  if (!looksLikeMarkdown(plain)) return false

  // Even when HTML is present (many apps add it), prefer Markdown conversion
  // if the plain-text payload strongly resembles markdown syntax.
  if (!html) return true
  return true
}

function insertParsedMarkdownBlocks(parsedBlocks: OutputBlockData[]) {
  if (!editor || parsedBlocks.length === 0) return

  const index = editor.blocks.getCurrentBlockIndex()
  if (index < 0) return

  const current = editor.blocks.getBlockByIndex(index)
  const currentIsEmptyParagraph =
    Boolean(current) && current?.name === 'paragraph' && getCurrentBlockText(current).length === 0

  const [first, ...rest] = parsedBlocks

  if (currentIsEmptyParagraph) {
    const inserted = editor.blocks.insert(first.type, first.data, undefined, index, true, true)
    if (rest.length > 0) {
      editor.blocks.insertMany(rest, index + 1)
    }
    placeCaretInBlock(inserted.id)
    return
  }

  const insertionIndex = index + 1
  const inserted = editor.blocks.insert(first.type, first.data, undefined, insertionIndex, true, false)
  if (rest.length > 0) {
    editor.blocks.insertMany(rest, insertionIndex + 1)
  }
  placeCaretInBlock(inserted.id)
}

function onEditorPaste(event: ClipboardEvent) {
  if (!editor) return

  const plain = event.clipboardData?.getData('text/plain') ?? ''
  const html = event.clipboardData?.getData('text/html') ?? ''

  if (!isLikelyMarkdownPaste(plain, html)) {
    return
  }

  const parsed = markdownToEditorData(plain)
  if (!parsed.blocks.length) return

  event.preventDefault()
  event.stopPropagation()
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation()
  }
  insertParsedMarkdownBlocks(parsed.blocks as OutputBlockData[])
}

async function ensureEditor() {
  if (!holder.value || editor) return

  editor = new EditorJS({
    holder: holder.value,
    autofocus: true,
    defaultBlock: 'paragraph',
    inlineToolbar: ['bold', 'italic', 'link', 'inlineCode'],
    placeholder: 'Write here...',
    tools: {
      paragraph: {
        class: Paragraph as unknown as never,
        inlineToolbar: true,
        config: { preserveBlank: false }
      },
      header: {
        class: Header as unknown as never,
        inlineToolbar: ['bold', 'italic', 'link', 'inlineCode'],
        config: {
          levels: [1, 2, 3, 4, 5, 6],
          defaultLevel: 2
        }
      },
      list: {
        class: List,
        inlineToolbar: ['bold', 'italic', 'link', 'inlineCode'],
        config: {
          defaultStyle: 'unordered'
        }
      },
      quote: {
        class: Quote,
        inlineToolbar: ['bold', 'italic', 'link', 'inlineCode']
      },
      code: CodeTool,
      delimiter: Delimiter,
      inlineCode: InlineCode
    },
    async onChange() {
      if (suppressOnChange || !props.path) return
      isDirty.value = true
      saveError.value = ''
      scheduleAutosave()
    }
  })

  await editor.isReady
  holder.value.addEventListener('keydown', onEditorKeydown)
  holder.value.addEventListener('paste', onEditorPaste, true)
}

async function loadCurrentFile() {
  const p = props.path?.trim()
  if (!p) return

  await ensureEditor()
  if (!editor) return

  clearAutosaveTimer()
  closeSlashMenu()
  saveError.value = ''

  try {
    const txt = await props.openFile(p)
    suppressOnChange = true
    loadedText.value = txt
    await editor.render(markdownToEditorData(txt))
    isDirty.value = false
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Could not read file.'
  } finally {
    suppressOnChange = false
  }
}

async function saveCurrentFile(manual = true) {
  const p = props.path?.trim()
  if (!p || !editor || isSaving.value) return

  isSaving.value = true
  if (manual) saveError.value = ''

  try {
    const data = await editor.save()
    const md = editorDataToMarkdown(data)

    if (md === loadedText.value) {
      isDirty.value = false
      return
    }

    const latestOnDisk = await props.openFile(p)
    if (latestOnDisk !== loadedText.value) {
      throw new Error('File changed on disk. Reload before saving to avoid overwrite.')
    }

    await props.saveFile(p, md)
    loadedText.value = md
    isDirty.value = false
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Could not save file.'
  } finally {
    isSaving.value = false
  }
}

function onWindowKeydown(event: KeyboardEvent) {
  const isMod = event.metaKey || event.ctrlKey
  if (!isMod || event.key.toLowerCase() !== 's') return

  event.preventDefault()
  if (isDirty.value || isSaving.value) {
    void saveCurrentFile(true)
  }
}

watch(
  () => props.path,
  async () => {
    if (!props.path) return
    await loadCurrentFile()
  }
)

onMounted(async () => {
  await ensureEditor()
  window.addEventListener('keydown', onWindowKeydown)
})

onBeforeUnmount(async () => {
  clearAutosaveTimer()
  window.removeEventListener('keydown', onWindowKeydown)

  if (holder.value) {
    holder.value.removeEventListener('keydown', onEditorKeydown)
    holder.value.removeEventListener('paste', onEditorPaste, true)
  }

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
      <UiButton :disabled="!path || !isDirty || isSaving" size="sm" variant="primary" @click="saveCurrentFile(true)">{{ saveLabel }}</UiButton>
      <span class="text-xs" :class="saveError ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-500'">
        {{ statusText }}
      </span>
    </div>

    <div
      ref="holder"
      class="editor-holder relative min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/85 p-6 dark:border-slate-700/70 dark:bg-slate-950/65"
      @click="closeSlashMenu"
    >
      <div
        v-if="slashOpen"
        class="absolute z-20 w-52 rounded-xl border border-slate-200/90 bg-white/98 p-1 shadow-xl dark:border-slate-700/80 dark:bg-slate-900/95"
        :style="{ left: `${slashLeft}px`, top: `${slashTop}px` }"
      >
        <button
          v-for="(command, idx) in SLASH_COMMANDS"
          :key="command.id"
          type="button"
          class="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          :class="idx === slashIndex ? 'bg-slate-100 dark:bg-slate-800' : ''"
          @mousedown.prevent="slashIndex = idx"
          @click.prevent="closeSlashMenu(); replaceCurrentBlock(command.type, command.data)"
        >
          {{ command.label }}
        </button>
      </div>
    </div>
  </div>
</template>
