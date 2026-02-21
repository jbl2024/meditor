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
  saveFile: (path: string, text: string, options: { explicit: boolean }) => Promise<{ persisted: boolean }>
  linkTargets: string[]
  openLinkTarget: (target: string) => Promise<boolean>
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
let suppressCollapseOnNextArrowKeyup = false

const loadedTextByPath = ref<Record<string, string>>({})
const dirtyByPath = ref<Record<string, boolean>>({})
const scrollTopByPath = ref<Record<string, number>>({})
const savingByPath = ref<Record<string, boolean>>({})
const saveErrorByPath = ref<Record<string, string>>({})

const slashOpen = ref(false)
const slashIndex = ref(0)
const slashLeft = ref(0)
const slashTop = ref(0)
const wikilinkOpen = ref(false)
const wikilinkIndex = ref(0)
const wikilinkLeft = ref(0)
const wikilinkTop = ref(0)
const wikilinkQuery = ref('')

const wikilinkResults = computed(() => {
  const query = wikilinkQuery.value.trim().toLowerCase()
  const base = props.linkTargets
    .filter((path) => !query || path.toLowerCase().includes(query))
    .slice(0, 12)
    .map((path) => ({ id: `existing:${path}`, label: path, target: path, isCreate: false }))

  const exact = base.some((item) => item.target.toLowerCase() === query)
  if (query && !exact) {
    base.unshift({
      id: `create:${query}`,
      label: `Create "${wikilinkQuery.value.trim()}"`,
      target: wikilinkQuery.value.trim(),
      isCreate: true
    })
  }

  return base
})

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

function closeWikilinkMenu() {
  wikilinkOpen.value = false
  wikilinkIndex.value = 0
  wikilinkQuery.value = ''
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

function openWikilinkMenuAtCaret(query: string, keepSelection = false) {
  if (!holder.value) return
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  const caretRect = range?.getBoundingClientRect()
  const holderRect = holder.value.getBoundingClientRect()

  wikilinkLeft.value = Math.max(8, (caretRect?.left ?? holderRect.left) - holderRect.left)
  wikilinkTop.value = Math.max(8, (caretRect?.bottom ?? holderRect.top) - holderRect.top + 8)
  const previousCount = wikilinkResults.value.length
  const previousIndex = wikilinkIndex.value
  wikilinkQuery.value = query
  if (keepSelection && previousCount > 0) {
    const nextCount = wikilinkResults.value.length
    wikilinkIndex.value = nextCount > 0 ? Math.min(previousIndex, nextCount - 1) : 0
  } else {
    wikilinkIndex.value = 0
  }
  wikilinkOpen.value = true
}

function readWikilinkQueryAtCaret(): string | null {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return null
  const node = selection.focusNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent ?? ''
  const offset = selection.focusOffset
  if (offset < 2) return null

  const uptoCaret = text.slice(0, offset)
  const start = uptoCaret.lastIndexOf('[[')
  if (start < 0) return null
  const closeFromStart = text.indexOf(']]', start + 2)
  if (closeFromStart >= 0 && offset >= closeFromStart + 2) return null
  if (uptoCaret.slice(start + 2).includes(']]')) return null
  const queryEnd = closeFromStart >= 0 ? Math.min(offset, closeFromStart) : offset
  const query = text.slice(start + 2, queryEnd)
  if (query.includes('\n')) return null
  if (query.includes('[') || query.includes(']')) return null
  return query
}

function parseWikilinkToken(token: string): { target: string; label: string } | null {
  if (!token.startsWith('[[') || !token.endsWith(']]')) return null
  const inner = token.slice(2, -2).trim()
  if (!inner) return null
  const [targetRaw, aliasRaw] = inner.split('|', 2)
  const target = targetRaw.trim()
  if (!target || target.includes('\n')) return null
  const label = (aliasRaw ?? '').trim() || target
  return { target, label }
}

function createWikilinkAnchor(target: string, label = target): HTMLAnchorElement {
  const anchor = document.createElement('a')
  anchor.href = `wikilink:${encodeURIComponent(target)}`
  anchor.dataset.wikilinkTarget = target
  anchor.textContent = label
  anchor.className = 'md-wikilink'
  return anchor
}

function readWikilinkTargetFromAnchor(anchor: HTMLAnchorElement): string {
  const dataTarget = anchor.dataset.wikilinkTarget?.trim()
  if (dataTarget) return dataTarget

  const href = anchor.getAttribute('href')?.trim() ?? ''
  if (href.toLowerCase().startsWith('wikilink:')) {
    try {
      const decoded = decodeURIComponent(href.slice('wikilink:'.length)).trim()
      if (decoded) return decoded
    } catch {
      return ''
    }
  }

  if (href === '#') {
    return anchor.textContent?.trim() ?? ''
  }

  return ''
}

function replaceActiveWikilinkQuery(target: string) {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false
  const node = selection.focusNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return false
  const textNode = node as Text
  const text = textNode.data
  const offset = selection.focusOffset

  const start = text.slice(0, offset).lastIndexOf('[[')
  if (start < 0) return false

  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, offset)
  range.deleteContents()

  const inserted = createWikilinkAnchor(target, target)
  range.insertNode(inserted)

  const nextRange = document.createRange()
  nextRange.setStartAfter(inserted)
  nextRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(nextRange)
  return true
}

function tokenForAnchor(anchor: HTMLAnchorElement): string {
  const target = readWikilinkTargetFromAnchor(anchor)
  return target ? `[[${target}]]` : ''
}

function nodeToWikilinkAnchor(node: Node | null): HTMLAnchorElement | null {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return null
  const element = node as HTMLElement
  if (element.tagName.toLowerCase() !== 'a') return null
  const anchor = element as HTMLAnchorElement
  return readWikilinkTargetFromAnchor(anchor) ? anchor : null
}

function adjacentWikilinkAnchor(selection: Selection, direction: 'left' | 'right'): HTMLAnchorElement | null {
  const node = selection.focusNode
  if (!node) return null
  const ownerElement =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : (node.parentElement as HTMLElement | null)
  const ownerAnchor = ownerElement?.closest('a') as HTMLAnchorElement | null
  if (ownerAnchor) {
    return readWikilinkTargetFromAnchor(ownerAnchor) ? ownerAnchor : null
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text
    if (direction === 'left' && selection.focusOffset === 0) {
      return nodeToWikilinkAnchor(textNode.previousSibling)
    }
    if (direction === 'right' && selection.focusOffset === textNode.length) {
      return nodeToWikilinkAnchor(textNode.nextSibling)
    }
    return null
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement
    const childIndex = selection.focusOffset
    if (direction === 'left' && childIndex > 0) {
      return nodeToWikilinkAnchor(element.childNodes.item(childIndex - 1))
    }
    if (direction === 'right' && childIndex < element.childNodes.length) {
      return nodeToWikilinkAnchor(element.childNodes.item(childIndex))
    }
  }

  return null
}

function expandAdjacentWikilinkForEditing(direction: 'left' | 'right'): boolean {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false

  const anchor = adjacentWikilinkAnchor(selection, direction)
  if (!anchor || !anchor.parentNode) return false

  const token = tokenForAnchor(anchor)
  if (!token) return false

  const textNode = document.createTextNode(token)
  anchor.parentNode.replaceChild(textNode, anchor)

  const range = document.createRange()
  if (direction === 'left') {
    range.setStart(textNode, token.length)
  } else {
    range.setStart(textNode, 0)
  }
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  suppressCollapseOnNextArrowKeyup = true
  return true
}

function replaceTokenRangeWithAnchor(textNode: Text, start: number, end: number, place: 'before' | 'after'): boolean {
  const token = textNode.data.slice(start, end)
  const parsed = parseWikilinkToken(token)
  if (!parsed) return false

  const selection = window.getSelection()
  if (!selection) return false

  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  range.deleteContents()

  const anchor = createWikilinkAnchor(parsed.target, parsed.label)
  range.insertNode(anchor)

  const next = document.createRange()
  if (place === 'before') {
    next.setStartBefore(anchor)
  } else {
    next.setStartAfter(anchor)
  }
  next.collapse(true)
  selection.removeAllRanges()
  selection.addRange(next)
  return true
}

function collapseClosedWikilinkNearCaret(): boolean {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false

  const node = selection.focusNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return false
  const textNode = node as Text
  const text = textNode.data
  const offset = selection.focusOffset

  if (offset >= 2 && text.slice(offset - 2, offset) === ']]') {
    const start = text.lastIndexOf('[[', offset - 2)
    if (start >= 0) {
      const close = text.indexOf(']]', start + 2)
      if (close >= 0 && close + 2 === offset) {
        return replaceTokenRangeWithAnchor(textNode, start, offset, 'after')
      }
    }
  }

  if (text.slice(offset, offset + 2) === '[[') {
    const close = text.indexOf(']]', offset + 2)
    if (close >= 0) {
      return replaceTokenRangeWithAnchor(textNode, offset, close + 2, 'before')
    }
  }

  return false
}

async function applyWikilinkSelection(target: string) {
  const replaced = replaceActiveWikilinkQuery(target)
  closeWikilinkMenu()
  if (!replaced) return

  const path = currentPath.value
  if (path) {
    setDirty(path, true)
    setSaveError(path, '')
    scheduleAutosave()
  }
  await nextTick()
}

function extractTokenAtCaret(): string {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return ''
  const node = selection.focusNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return ''

  const text = node.textContent ?? ''
  const offset = selection.focusOffset
  const isBoundary = (value: string) => /[^\w\-\[\]\/|#]/.test(value)

  let start = offset
  while (start > 0 && !isBoundary(text[start - 1])) {
    start -= 1
  }

  let end = offset
  while (end < text.length && !isBoundary(text[end])) {
    end += 1
  }

  return text.slice(start, end).trim()
}

async function openLinkedTokenAtCaret() {
  const token = extractTokenAtCaret()
  if (!token) return

  const wikilinkMatch = token.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/)
  if (wikilinkMatch) {
    await props.openLinkTarget(wikilinkMatch[1].trim())
    return
  }

  const dateMatch = token.match(/^\d{4}-\d{2}-\d{2}$/)
  if (!dateMatch) return
  await props.openLinkTarget(dateMatch[0])
}

function syncWikilinkMenuFromCaret() {
  const query = readWikilinkQueryAtCaret()
  if (query === null) {
    closeWikilinkMenu()
    return
  }
  openWikilinkMenuAtCaret(query, true)
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

  if (wikilinkOpen.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      if (wikilinkResults.value.length) {
        wikilinkIndex.value = (wikilinkIndex.value + 1) % wikilinkResults.value.length
      }
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      if (wikilinkResults.value.length) {
        wikilinkIndex.value = (wikilinkIndex.value - 1 + wikilinkResults.value.length) % wikilinkResults.value.length
      }
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const selected = wikilinkResults.value[wikilinkIndex.value]
      if (!selected) return
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      void applyWikilinkSelection(selected.target)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      closeWikilinkMenu()
      return
    }
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const direction = event.key === 'ArrowLeft' ? 'left' : 'right'
    if (expandAdjacentWikilinkForEditing(direction)) {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      return
    }
  }

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

  if (event.key === '[' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    window.setTimeout(syncWikilinkMenuFromCaret, 0)
  }

  if (event.key === '/' && block.name === 'paragraph' && isCurrentBlockEmpty()) {
    // Let EditorJS handle the native slash menu to avoid duplicate popovers.
    closeSlashMenu()
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

function onEditorKeyup(event: KeyboardEvent) {
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && suppressCollapseOnNextArrowKeyup) {
    suppressCollapseOnNextArrowKeyup = false
    return
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    collapseClosedWikilinkNearCaret()
    return
  }

  if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
    return
  }

  collapseClosedWikilinkNearCaret()
  syncWikilinkMenuFromCaret()
}

function onEditorClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.ce-block')) {
    return
  }
  const anchor = target.closest('a') as HTMLAnchorElement | null
  const wikilinkTarget = anchor ? readWikilinkTargetFromAnchor(anchor) : ''
  if (anchor && wikilinkTarget) {
    event.preventDefault()
    event.stopPropagation()
    void props.openLinkTarget(wikilinkTarget)
    return
  }
  collapseClosedWikilinkNearCaret()
  syncWikilinkMenuFromCaret()
  void openLinkedTokenAtCaret()
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
  holder.value.addEventListener('keydown', onEditorKeydown, true)
  holder.value.addEventListener('keyup', onEditorKeyup, true)
  holder.value.addEventListener('click', onEditorClick, true)
  holder.value.addEventListener('paste', onEditorPaste, true)
}

async function destroyEditor() {
  clearAutosaveTimer()
  closeSlashMenu()
  closeWikilinkMenu()

  if (holder.value) {
    holder.value.removeEventListener('keydown', onEditorKeydown, true)
    holder.value.removeEventListener('keyup', onEditorKeyup, true)
    holder.value.removeEventListener('click', onEditorClick, true)
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
  closeWikilinkMenu()
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

    if (!manual && md === lastLoaded) {
      setDirty(path, false)
      return
    }

    const latestOnDisk = await props.openFile(path)
    if (latestOnDisk !== lastLoaded) {
      throw new Error('File changed on disk. Reload before saving to avoid overwrite.')
    }

    const result = await props.saveFile(path, md, { explicit: manual })
    if (!result.persisted) {
      setDirty(path, true)
      return
    }

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
      @click="closeSlashMenu(); closeWikilinkMenu()"
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

      <div
        v-if="wikilinkOpen"
        class="absolute z-20 w-80 rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900"
        :style="{ left: `${wikilinkLeft}px`, top: `${wikilinkTop}px` }"
      >
        <button
          v-for="(item, idx) in wikilinkResults"
          :key="item.id"
          type="button"
          class="block w-full rounded px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          :class="idx === wikilinkIndex ? 'bg-slate-100 dark:bg-slate-800' : ''"
          @mousedown.prevent="wikilinkIndex = idx"
          @click.prevent="applyWikilinkSelection(item.target)"
        >
          {{ item.label }}
        </button>
        <div v-if="!wikilinkResults.length" class="px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400">No matches</div>
      </div>
    </div>

    <div class="flex h-7 items-center border-t border-slate-200 px-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
      {{ statusText }}
    </div>
  </div>
</template>

<style scoped>
.editor-holder :deep(a.md-wikilink) {
  color: #2563eb;
  text-decoration: underline;
}

.dark .editor-holder :deep(a.md-wikilink) {
  color: #60a5fa;
}
</style>
