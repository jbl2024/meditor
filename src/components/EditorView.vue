<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorJS, { type OutputBlockData } from '@editorjs/editorjs'
import CodeTool from '@editorjs/code'
import Delimiter from '@editorjs/delimiter'
import Header from '@editorjs/header'
import InlineCode from '@editorjs/inline-code'
import List from '@editorjs/list'
import Paragraph from '@editorjs/paragraph'
import Quote from '@editorjs/quote'
import { editorDataToMarkdown, markdownToEditorData } from '../lib/markdownBlocks'

const AUTOSAVE_IDLE_MS = 1800

type SlashCommand = {
  id: string
  label: string
  type: string
  data: Record<string, unknown>
}

type HeadingNode = {
  level: 1 | 2 | 3
  text: string
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

const emit = defineEmits<{
  status: [payload: { path: string; dirty: boolean; saving: boolean; saveError: string }]
  outline: [payload: HeadingNode[]]
}>()

const holder = ref<HTMLDivElement | null>(null)
let editor: EditorJS | null = null
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let outlineTimer: ReturnType<typeof setTimeout> | null = null
let suppressOnChange = false

const loadedTextByPath = ref<Record<string, string>>({})
const dirtyByPath = ref<Record<string, boolean>>({})
const scrollTopByPath = ref<Record<string, number>>({})
const savingByPath = ref<Record<string, boolean>>({})
const saveErrorByPath = ref<Record<string, string>>({})

const slashOpen = ref(false)
const slashIndex = ref(0)
const slashLeft = ref(0)
const slashTop = ref(0)

const currentPath = computed(() => props.path?.trim() || '')
const isDirty = computed(() => Boolean(dirtyByPath.value[currentPath.value]))
const isSaving = computed(() => Boolean(savingByPath.value[currentPath.value]))
const saveError = computed(() => saveErrorByPath.value[currentPath.value] ?? '')
const statusText = computed(() => {
  if (!currentPath.value) return 'Select a file'
  if (saveError.value) return saveError.value
  if (isSaving.value) return 'Saving...'
  if (isDirty.value) return 'Editing'
  return 'Saved'
})

function setDirty(path: string, dirty: boolean) {
  dirtyByPath.value = {
    ...dirtyByPath.value,
    [path]: dirty
  }
  emitStatus(path)
}

function setSaving(path: string, saving: boolean) {
  savingByPath.value = {
    ...savingByPath.value,
    [path]: saving
  }
  emitStatus(path)
}

function setSaveError(path: string, message: string) {
  saveErrorByPath.value = {
    ...saveErrorByPath.value,
    [path]: message
  }
  emitStatus(path)
}

function emitStatus(path: string) {
  if (!path) return
  emit('status', {
    path,
    dirty: Boolean(dirtyByPath.value[path]),
    saving: Boolean(savingByPath.value[path]),
    saveError: saveErrorByPath.value[path] ?? ''
  })
}

function clearAutosaveTimer() {
  if (!autosaveTimer) return
  clearTimeout(autosaveTimer)
  autosaveTimer = null
}

function clearOutlineTimer() {
  if (!outlineTimer) return
  clearTimeout(outlineTimer)
  outlineTimer = null
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

function focusEditor() {
  if (!holder.value) return
  const editable = holder.value.querySelector('[contenteditable="true"]') as HTMLElement | null
  editable?.focus()
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

function parseOutlineFromDom(): HeadingNode[] {
  if (!holder.value) return []
  const headers = Array.from(holder.value.querySelectorAll('.ce-header')) as HTMLElement[]
  const out: HeadingNode[] = []

  for (const header of headers) {
    const text = header.innerText.trim()
    if (!text) continue
    const tag = header.tagName.toLowerCase()
    const levelRaw = Number.parseInt(tag.replace('h', ''), 10)
    const level = (levelRaw >= 1 && levelRaw <= 3 ? levelRaw : 3) as 1 | 2 | 3
    out.push({ level, text })
  }

  return out
}

function emitOutlineSoon() {
  clearOutlineTimer()
  outlineTimer = setTimeout(() => {
    emit('outline', parseOutlineFromDom())
  }, 120)
}

function getVisibleText(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function revealSnippet(snippet: string) {
  if (!holder.value || !snippet) return
  await nextTick()

  const targetSnippet = getVisibleText(snippet).toLowerCase()
  if (!targetSnippet) return

  const nodes = Array.from(holder.value.querySelectorAll('[contenteditable="true"], .ce-code__textarea')) as HTMLElement[]
  const match = nodes.find((node) => getVisibleText(node.innerText).toLowerCase().includes(targetSnippet))
  if (!match) return

  match.scrollIntoView({ block: 'center', behavior: 'smooth' })
  match.focus()
}

async function ensureEditor() {
  if (!holder.value || editor) return

  editor = new EditorJS({
    holder: holder.value,
    autofocus: false,
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
      const path = currentPath.value
      if (suppressOnChange || !path) return
      setDirty(path, true)
      setSaveError(path, '')
      scheduleAutosave()
      emitOutlineSoon()
    }
  })

  await editor.isReady
  holder.value.addEventListener('keydown', onEditorKeydown)
  holder.value.addEventListener('paste', onEditorPaste, true)
}

async function destroyEditor() {
  clearAutosaveTimer()
  closeSlashMenu()

  if (holder.value) {
    holder.value.removeEventListener('keydown', onEditorKeydown)
    holder.value.removeEventListener('paste', onEditorPaste, true)
  }

  if (!editor) return
  await editor.destroy()
  editor = null
}

async function loadCurrentFile(path: string) {
  if (!path) return

  await ensureEditor()
  if (!editor) return

  clearAutosaveTimer()
  closeSlashMenu()
  setSaveError(path, '')

  try {
    const txt = await props.openFile(path)
    suppressOnChange = true
    loadedTextByPath.value = {
      ...loadedTextByPath.value,
      [path]: txt
    }
    await editor.render(markdownToEditorData(txt))
    setDirty(path, false)

    await nextTick()
    const remembered = scrollTopByPath.value[path] ?? 0
    if (holder.value) {
      holder.value.scrollTop = remembered
    }
    emitOutlineSoon()
  } catch (err) {
    setSaveError(path, err instanceof Error ? err.message : 'Could not read file.')
  } finally {
    suppressOnChange = false
  }
}

async function saveCurrentFile(manual = true) {
  const path = currentPath.value
  if (!path || !editor || savingByPath.value[path]) return

  setSaving(path, true)
  if (manual) setSaveError(path, '')

  try {
    const data = await editor.save()
    const md = editorDataToMarkdown(data)
    const lastLoaded = loadedTextByPath.value[path] ?? ''

    if (md === lastLoaded) {
      setDirty(path, false)
      return
    }

    const latestOnDisk = await props.openFile(path)
    if (latestOnDisk !== lastLoaded) {
      throw new Error('File changed on disk. Reload before saving to avoid overwrite.')
    }

    await props.saveFile(path, md)

    loadedTextByPath.value = {
      ...loadedTextByPath.value,
      [path]: md
    }
    setDirty(path, false)
  } catch (err) {
    setSaveError(path, err instanceof Error ? err.message : 'Could not save file.')
  } finally {
    setSaving(path, false)
    emitOutlineSoon()
  }
}

watch(
  () => props.path,
  async (next, prev) => {
    if (prev && holder.value) {
      scrollTopByPath.value = {
        ...scrollTopByPath.value,
        [prev]: holder.value.scrollTop
      }
    }

    const nextPath = next?.trim()
    if (!nextPath) {
      await destroyEditor()
      emit('outline', [])
      return
    }

    await nextTick()
    await ensureEditor()
    if (!editor) return
    await loadCurrentFile(nextPath)
  }
)

onMounted(async () => {
  if (currentPath.value) {
    await ensureEditor()
    await loadCurrentFile(currentPath.value)
  }
})

onBeforeUnmount(async () => {
  clearOutlineTimer()
  await destroyEditor()
})

defineExpose({
  saveNow: async () => {
    await saveCurrentFile(true)
  },
  reloadCurrent: async () => {
    if (!currentPath.value) return
    await loadCurrentFile(currentPath.value)
  },
  focusEditor,
  revealSnippet
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      v-if="!path"
      class="flex min-h-0 flex-1 items-center justify-center bg-white px-8 py-6 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400"
    >
      Open a file to start editing
    </div>

    <div
      v-else
      ref="holder"
      class="editor-holder relative min-h-0 flex-1 overflow-y-auto bg-white px-8 py-6 dark:bg-slate-950"
      @click="closeSlashMenu"
    >

      <div
        v-if="slashOpen"
        class="absolute z-20 w-52 rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900"
        :style="{ left: `${slashLeft}px`, top: `${slashTop}px` }"
      >
        <button
          v-for="(command, idx) in SLASH_COMMANDS"
          :key="command.id"
          type="button"
          class="block w-full rounded px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          :class="idx === slashIndex ? 'bg-slate-100 dark:bg-slate-800' : ''"
          @mousedown.prevent="slashIndex = idx"
          @click.prevent="closeSlashMenu(); replaceCurrentBlock(command.type, command.data)"
        >
          {{ command.label }}
        </button>
      </div>
    </div>

    <div class="flex h-7 items-center border-t border-slate-200 px-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
      {{ statusText }}
    </div>
  </div>
</template>
