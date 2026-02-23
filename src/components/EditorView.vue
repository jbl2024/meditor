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
import Table from '@editorjs/table'
import CalloutTool from '../lib/editorjs/CalloutTool'
import MermaidTool from '../lib/editorjs/MermaidTool'
import { editorDataToMarkdown, markdownToEditorData, type EditorBlock } from '../lib/markdownBlocks'
import PropertyAddDropdown from './properties/PropertyAddDropdown.vue'
import PropertyTokenInput from './properties/PropertyTokenInput.vue'
import {
  composeMarkdownDocument,
  parseFrontmatter,
  serializeFrontmatter,
  type FrontmatterEnvelope,
  type FrontmatterField
} from '../lib/frontmatter'
import {
  defaultPropertyTypeForKey,
  normalizePropertyKey,
  sanitizePropertyTypeSchema,
  type PropertyType,
  type PropertyTypeSchema
} from '../lib/propertyTypes'
import {
  parseWikilinkTarget,
  normalizeBlockId,
  normalizeHeadingAnchor,
  slugifyHeading,
  type WikilinkAnchor
} from '../lib/wikilinks'

const AUTOSAVE_IDLE_MS = 1800
const VIRTUAL_TITLE_BLOCK_ID = '__virtual_title__'
type CorePropertyOption = {
  key: string
  label?: string
  description?: string
}
const CORE_PROPERTY_OPTIONS: CorePropertyOption[] = [
  { key: 'tags', label: 'tags', description: 'Tag list' },
  { key: 'aliases', label: 'aliases', description: 'Alternative names' },
  { key: 'cssclasses', label: 'cssclasses', description: 'Note CSS classes' },
  { key: 'date', label: 'date', description: 'Primary date (YYYY-MM-DD)' },
  { key: 'deadline', label: 'deadline', description: 'Due date (YYYY-MM-DD)' },
  { key: 'archive', label: 'archive', description: 'Archive flag' },
  { key: 'published', label: 'published', description: 'Publish flag' }
]

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

type EditableLinkToken =
  | { kind: 'wikilink'; target: string; label: string }
  | { kind: 'hyperlink'; href: string; label: string }

type EditableLinkRange = {
  start: number
  end: number
}

type ArrowLinkContext = {
  textNode: Text
  range: EditableLinkRange
}

type CaretSnapshot =
  | { kind: 'contenteditable'; blockIndex: number; offset: number }
  | { kind: 'text-input'; blockIndex: number; offset: number }

type ListStyle = 'unordered' | 'ordered' | 'checklist'

function emptyListData(style: ListStyle, checked = false) {
  return {
    style,
    meta: {},
    items: [
      {
        content: '',
        meta: style === 'checklist' ? { checked } : {},
        items: []
      }
    ]
  }
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'heading', label: 'Heading', type: 'header', data: { text: '', level: 2 } },
  { id: 'bullet', label: 'List', type: 'list', data: emptyListData('unordered') },
  { id: 'checklist', label: 'Checklist', type: 'list', data: emptyListData('checklist') },
  { id: 'table', label: 'Table', type: 'table', data: { withHeadings: true, content: [['', ''], ['', '']] } },
  { id: 'callout', label: 'Callout', type: 'callout', data: { kind: 'NOTE', message: '' } },
  { id: 'mermaid', label: 'Mermaid', type: 'mermaid', data: { code: 'flowchart TD\n  A[Start] --> B[End]' } },
  { id: 'code', label: 'Code', type: 'code', data: { code: '' } },
  { id: 'quote', label: 'Quote', type: 'quote', data: { text: '', caption: '', alignment: 'left' } },
  { id: 'divider', label: 'Divider', type: 'delimiter', data: {} }
]

const props = defineProps<{
  path: string
  openFile: (path: string) => Promise<string>
  saveFile: (path: string, text: string, options: { explicit: boolean }) => Promise<{ persisted: boolean }>
  renameFileFromTitle: (path: string, title: string) => Promise<{ path: string; title: string }>
  loadLinkTargets: () => Promise<string[]>
  loadLinkHeadings: (target: string) => Promise<string[]>
  loadPropertyTypeSchema: () => Promise<Record<string, string>>
  savePropertyTypeSchema: (schema: Record<string, string>) => Promise<void>
  openLinkTarget: (target: string) => Promise<boolean>
}>()

const emit = defineEmits<{
  status: [payload: { path: string; dirty: boolean; saving: boolean; saveError: string }]
  'path-renamed': [payload: { from: string; to: string; manual: boolean }]
  outline: [payload: HeadingNode[]]
  properties: [payload: { path: string; items: Array<{ key: string; value: string }>; parseErrorCount: number }]
}>()

const holder = ref<HTMLDivElement | null>(null)
let editor: EditorJS | null = null
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let outlineTimer: ReturnType<typeof setTimeout> | null = null
let titleLockTimer: ReturnType<typeof setTimeout> | null = null
let suppressOnChange = false
let suppressCollapseOnNextArrowKeyup = false
let expandedLinkContext: ArrowLinkContext | null = null

const loadedTextByPath = ref<Record<string, string>>({})
const dirtyByPath = ref<Record<string, boolean>>({})
const scrollTopByPath = ref<Record<string, number>>({})
const caretByPath = ref<Record<string, CaretSnapshot>>({})
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
const wikilinkTargets = ref<string[]>([])
const wikilinkHeadingResults = ref<Array<{ id: string; label: string; target: string; isCreate: boolean }>>([])
const wikilinkHeadingCache = ref<Record<string, string[]>>({})
let wikilinkLoadToken = 0
let wikilinkHeadingLoadToken = 0

const wikilinkResults = computed(() => {
  if (wikilinkHeadingResults.value.length > 0) {
    return wikilinkHeadingResults.value
  }
  const query = wikilinkQuery.value.trim().toLowerCase()
  const base = wikilinkTargets.value
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

function selectionDebugSnapshot(): { nodeType: string; offset: number; textPreview: string } {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount) {
    return { nodeType: 'none', offset: -1, textPreview: '' }
  }

  const node = selection.focusNode
  const offset = selection.focusOffset
  if (!node) {
    return { nodeType: 'null', offset, textPreview: '' }
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ')
    const preview = text.length > 80 ? `${text.slice(0, 77)}...` : text
    return { nodeType: 'text', offset, textPreview: preview }
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const text = ((node as HTMLElement).innerText ?? '').replace(/\s+/g, ' ')
    const preview = text.length > 80 ? `${text.slice(0, 77)}...` : text
    return { nodeType: 'element', offset, textPreview: preview }
  }

  return { nodeType: String(node.nodeType), offset, textPreview: '' }
}

function logWikilinkDebug(event: string, details: Record<string, unknown> = {}) {
  if (!import.meta.env.DEV) return
  const caret = selectionDebugSnapshot()
  console.debug('[wikilink]', event, {
    ...details,
    menuOpen: wikilinkOpen.value,
    query: wikilinkQuery.value,
    selectedIndex: wikilinkIndex.value,
    resultsCount: wikilinkResults.value.length,
    caret
  })
}

const currentPath = computed(() => props.path?.trim() || '')
const propertyEditorMode = ref<'structured' | 'raw'>('structured')
const frontmatterByPath = ref<Record<string, FrontmatterEnvelope>>({})
const rawYamlByPath = ref<Record<string, string>>({})
const propertiesExpandedByPath = ref<Record<string, boolean>>({})
const propertySchema = ref<PropertyTypeSchema>({})
const propertySchemaLoaded = ref(false)
const propertySchemaSaving = ref(false)
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
const mermaidReplaceDialog = ref<{
  visible: boolean
  templateLabel: string
  resolve: ((approved: boolean) => void) | null
}>({
  visible: false,
  templateLabel: '',
  resolve: null
})

const activeFrontmatter = computed<FrontmatterEnvelope | null>(() => {
  const path = currentPath.value
  if (!path) return null
  return frontmatterByPath.value[path] ?? null
})

const activeFields = computed(() => activeFrontmatter.value?.fields ?? [])
const activeParseErrors = computed(() => activeFrontmatter.value?.parseErrors ?? [])
const activeRawYaml = computed(() => {
  const path = currentPath.value
  if (!path) return ''
  return rawYamlByPath.value[path] ?? ''
})

const canUseStructuredProperties = computed(() => !activeParseErrors.value.length)
const structuredPropertyFields = computed(() => activeFields.value)
const structuredPropertyKeys = computed(() =>
  structuredPropertyFields.value
    .map((field) => field.key.trim().toLowerCase())
    .filter(Boolean)
)

function noteTitleFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  const name = parts[parts.length - 1] || normalized
  const stem = name.replace(/\.(md|markdown)$/i, '').trim()
  return stem || 'Untitled'
}

function extractPlainText(value: unknown): string {
  const html = String(value ?? '')
  if (!html.trim()) return ''
  const container = document.createElement('div')
  container.innerHTML = html
  return container.innerText.replace(/\u200B/g, ' ').replace(/\s+/g, ' ').trim()
}

function blockTextCandidate(block: OutputBlockData | undefined): string {
  if (!block) return ''
  const data = (block.data as Record<string, unknown>) ?? {}
  if (typeof data.text !== 'undefined') return extractPlainText(data.text)
  if (typeof data.code === 'string') return data.code.trim()
  return ''
}

function virtualTitleBlock(title: string): OutputBlockData {
  return {
    id: VIRTUAL_TITLE_BLOCK_ID,
    type: 'header',
    data: { level: 1, text: title.trim() || 'Untitled' }
  } as OutputBlockData
}

function stripVirtualTitle(blocks: OutputBlockData[]): OutputBlockData[] {
  return blocks.filter((block) => block.id !== VIRTUAL_TITLE_BLOCK_ID)
}

function readVirtualTitle(blocks: OutputBlockData[]): string {
  const virtual = blocks.find((block) => block.id === VIRTUAL_TITLE_BLOCK_ID)
  return blockTextCandidate(virtual)
}

function withVirtualTitle(blocks: OutputBlockData[], title: string): { blocks: OutputBlockData[]; changed: boolean } {
  const content = stripVirtualTitle(
    blocks.map((block) => ({
      ...block,
      data: { ...(block.data as Record<string, unknown>) }
    }))
  )
  const desired = title.trim() || 'Untitled'
  const next = [virtualTitleBlock(desired), ...content]

  const first = blocks[0]
  const firstLevel = Number(((first?.data as Record<string, unknown>)?.level ?? 0))
  const firstText = blockTextCandidate(first)
  const hasSingleLeadingVirtual =
    Boolean(first) &&
    first.id === VIRTUAL_TITLE_BLOCK_ID &&
    first.type === 'header' &&
    firstLevel === 1 &&
    firstText === desired &&
    !blocks.slice(1).some((block) => block.id === VIRTUAL_TITLE_BLOCK_ID)

  const changed = !hasSingleLeadingVirtual || blocks.length !== next.length
  return { blocks: next, changed }
}

function moveRecordKey<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
  if (!from || !to || from === to || !(from in record)) return record
  const next = { ...record }
  next[to] = next[from]
  delete next[from]
  return next
}

function movePathState(from: string, to: string) {
  if (!from || !to || from === to) return
  loadedTextByPath.value = moveRecordKey(loadedTextByPath.value, from, to)
  dirtyByPath.value = moveRecordKey(dirtyByPath.value, from, to)
  scrollTopByPath.value = moveRecordKey(scrollTopByPath.value, from, to)
  caretByPath.value = moveRecordKey(caretByPath.value, from, to)
  savingByPath.value = moveRecordKey(savingByPath.value, from, to)
  saveErrorByPath.value = moveRecordKey(saveErrorByPath.value, from, to)
  frontmatterByPath.value = moveRecordKey(frontmatterByPath.value, from, to)
  rawYamlByPath.value = moveRecordKey(rawYamlByPath.value, from, to)
}

function textOffsetWithinRoot(selection: Selection, root: HTMLElement): number | null {
  if (!selection.rangeCount || !selection.isCollapsed) return null
  const node = selection.focusNode
  if (!node || !root.contains(node)) return null

  const range = document.createRange()
  range.selectNodeContents(root)
  range.setEnd(node, selection.focusOffset)
  return range.toString().length
}

function resolveTextPosition(root: HTMLElement, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let current = walker.nextNode() as Text | null

  while (current) {
    const length = current.data.length
    if (remaining <= length) {
      return { node: current, offset: remaining }
    }
    remaining -= length
    current = walker.nextNode() as Text | null
  }

  if (!root.lastChild || root.lastChild.nodeType !== Node.TEXT_NODE) {
    root.appendChild(document.createTextNode(''))
  }
  const tail = root.lastChild as Text
  return { node: tail, offset: tail.data.length }
}

function isTextEntryElement(element: HTMLElement): element is HTMLTextAreaElement | HTMLInputElement {
  if (element instanceof HTMLTextAreaElement) return true
  if (!(element instanceof HTMLInputElement)) return false
  const type = (element.type || 'text').toLowerCase()
  return ['text', 'search', 'url', 'tel', 'password', 'email', 'number'].includes(type)
}

function captureCaret(path: string) {
  if (!path || !holder.value) return
  const blocks = Array.from(holder.value.querySelectorAll('.ce-block')) as HTMLElement[]

  const activeElement = document.activeElement as HTMLElement | null
  if (activeElement && holder.value.contains(activeElement)) {
    if (isTextEntryElement(activeElement)) {
      const block = activeElement.closest('.ce-block') as HTMLElement | null
      if (!block) return
      const blockIndex = blocks.indexOf(block)
      if (blockIndex < 0) return
      caretByPath.value = {
        ...caretByPath.value,
        [path]: {
          kind: 'text-input',
          blockIndex,
          offset: activeElement.selectionStart ?? 0
        }
      }
      return
    }
  }

  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return
  const node = selection.focusNode
  if (!node) return
  const parent = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  const block = parent?.closest('.ce-block') as HTMLElement | null
  if (!block) return
  const blockIndex = blocks.indexOf(block)
  if (blockIndex < 0) return
  const editable = block.querySelector('[contenteditable="true"]') as HTMLElement | null
  if (!editable) return
  const offset = textOffsetWithinRoot(selection, editable)
  if (offset === null) return

  caretByPath.value = {
    ...caretByPath.value,
    [path]: {
      kind: 'contenteditable',
      blockIndex,
      offset
    }
  }
}

function restoreCaret(path: string): boolean {
  if (!path || !holder.value) return false
  const snapshot = caretByPath.value[path]
  if (!snapshot) return false
  const blocks = Array.from(holder.value.querySelectorAll('.ce-block')) as HTMLElement[]
  const block = blocks[snapshot.blockIndex]
  if (!block) return false

  if (snapshot.kind === 'text-input') {
    const input = Array.from(block.querySelectorAll('textarea, input'))
      .find((element) => isTextEntryElement(element as HTMLElement)) as HTMLTextAreaElement | HTMLInputElement | undefined
    if (!input) return false
    const max = input.value.length
    const offset = Math.max(0, Math.min(snapshot.offset, max))
    input.focus()
    input.setSelectionRange(offset, offset)
    return true
  }

  const editable = block.querySelector('[contenteditable="true"]') as HTMLElement | null
  if (!editable) return false
  const resolved = resolveTextPosition(editable, snapshot.offset)
  if (!resolved) return false

  editable.focus()
  const selection = window.getSelection()
  if (!selection) return false
  const range = document.createRange()
  range.setStart(resolved.node, resolved.offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

async function ensurePropertySchemaLoaded() {
  if (propertySchemaLoaded.value) return
  const loaded = await props.loadPropertyTypeSchema()
  propertySchema.value = sanitizePropertyTypeSchema(loaded)
  propertySchemaLoaded.value = true
}

async function persistPropertySchema() {
  if (propertySchemaSaving.value) return
  propertySchemaSaving.value = true
  try {
    await props.savePropertyTypeSchema(propertySchema.value)
  } finally {
    propertySchemaSaving.value = false
  }
}

function parseAndStoreFrontmatter(path: string, sourceMarkdown: string) {
  const envelope = parseFrontmatter(sourceMarkdown, propertySchema.value)
  frontmatterByPath.value = {
    ...frontmatterByPath.value,
    [path]: envelope
  }
  rawYamlByPath.value = {
    ...rawYamlByPath.value,
    [path]: envelope.rawYaml
  }
  if (currentPath.value === path) {
    propertyEditorMode.value = envelope.parseErrors.length ? 'raw' : 'structured'
  }
  if (typeof propertiesExpandedByPath.value[path] === 'undefined') {
    propertiesExpandedByPath.value = {
      ...propertiesExpandedByPath.value,
      [path]: envelope.fields.some((field) => field.key.trim().length > 0)
    }
  }
  emitProperties(path)
}

function serializableFrontmatterFields(fields: FrontmatterField[]): FrontmatterField[] {
  return fields.filter((field) => field.key.trim().length > 0)
}

function updateFrontmatterFields(path: string, nextFields: FrontmatterField[]) {
  const current = frontmatterByPath.value[path]
  if (!current) return

  const normalized = nextFields.map((field, index) => ({
    ...field,
    order: index
  }))

  const serializable = serializableFrontmatterFields(normalized)
  const rawYaml = serializeFrontmatter(serializable)
  const parseErrors = (() => {
    const seen = new Set<string>()
    const out: Array<{ line: number; message: string }> = []
    normalized.forEach((field, index) => {
      const key = field.key.trim().toLowerCase()
      if (!key) return
      if (seen.has(key) && key) out.push({ line: index + 1, message: `Duplicate property key: ${field.key}` })
      seen.add(key)
      if (field.type === 'date' && typeof field.value === 'string' && field.value && !DATE_ONLY_RE.test(field.value)) {
        out.push({ line: index + 1, message: `Invalid date value for ${field.key}. Use YYYY-MM-DD.` })
      }
    })
    return out
  })()

  frontmatterByPath.value = {
    ...frontmatterByPath.value,
    [path]: {
      ...current,
      hasFrontmatter: serializable.length > 0,
      fields: normalized,
      rawYaml,
      parseErrors
    }
  }
  rawYamlByPath.value = {
    ...rawYamlByPath.value,
    [path]: rawYaml
  }
  emitProperties(path)
}

function propertyValuePreview(value: FrontmatterField['value']): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  return String(value ?? '').replace(/\n/g, ' ')
}

function emitProperties(path: string) {
  const envelope = frontmatterByPath.value[path]
  if (!envelope) {
    emit('properties', { path, items: [], parseErrorCount: 0 })
    return
  }
  const items = envelope.fields
    .filter((field) => field.key.trim().length > 0)
    .map((field) => ({
      key: field.key,
      value: propertyValuePreview(field.value)
    }))
  emit('properties', {
    path,
    items,
    parseErrorCount: envelope.parseErrors.length
  })
}

function setPropertyDirty(path: string) {
  setDirty(path, true)
  setSaveError(path, '')
  scheduleAutosave()
}

function updatePropertyField(index: number, patch: Partial<FrontmatterField>) {
  const path = currentPath.value
  if (!path) return
  const fields = [...activeFields.value]
  const current = fields[index]
  if (!current) return
  fields[index] = {
    ...current,
    ...patch
  }
  updateFrontmatterFields(path, fields)
  setPropertyDirty(path)
}

function removePropertyField(index: number) {
  const path = currentPath.value
  if (!path) return
  const fields = [...activeFields.value]
  if (index < 0 || index >= fields.length) return
  fields.splice(index, 1)
  updateFrontmatterFields(path, fields)
  setPropertyDirty(path)
}

function addPropertyField(initialKey = '') {
  const path = currentPath.value
  if (!path) return
  const fields = [...activeFields.value]
  const normalizedKey = initialKey.trim()
  const lockedType = lockedPropertyTypeForKey(normalizedKey)
  const inferredType =
    lockedType ??
    propertySchema.value[normalizePropertyKey(normalizedKey)] ??
    suggestedPropertyTypeForKey(normalizedKey) ??
    'text'
  const initialValue: FrontmatterField['value'] =
    inferredType === 'checkbox'
      ? false
      : inferredType === 'number'
        ? 0
        : inferredType === 'list' || inferredType === 'tags'
          ? []
          : ''
  fields.push({
    key: normalizedKey,
    value: initialValue,
    type: inferredType,
    order: fields.length,
    styleHint: inferredType === 'list' || inferredType === 'tags' ? 'inline-list' : 'plain'
  })
  updateFrontmatterFields(path, fields)
  propertiesExpandedByPath.value = {
    ...propertiesExpandedByPath.value,
    [path]: true
  }
  if (normalizedKey) {
    const normalizedSchemaKey = normalizePropertyKey(normalizedKey)
    if (normalizedSchemaKey) {
      propertySchema.value = {
        ...propertySchema.value,
        [normalizedSchemaKey]: inferredType
      }
      void persistPropertySchema()
    }
  }
  setPropertyDirty(path)
}

function coerceValueForType(type: PropertyType, input: string): string | number | boolean | string[] {
  if (type === 'checkbox') return input === 'true'
  if (type === 'number') {
    const parsed = Number(input)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (type === 'list' || type === 'tags') {
    return input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return input
}

function lockedPropertyTypeForKey(key: string): PropertyType | null {
  return defaultPropertyTypeForKey(key)
}

function suggestedPropertyTypeForKey(key: string): PropertyType | null {
  const normalized = normalizePropertyKey(key)
  if (normalized === 'date' || normalized === 'deadline') return 'date'
  if (normalized === 'archive' || normalized === 'published') return 'checkbox'
  return null
}

function isPropertyTypeLocked(key: string): boolean {
  return Boolean(lockedPropertyTypeForKey(key))
}

async function onPropertyTypeChange(index: number, nextTypeRaw: string) {
  const path = currentPath.value
  if (!path) return
  const field = activeFields.value[index]
  if (!field) return
  if (isPropertyTypeLocked(field.key)) return
  const nextType = nextTypeRaw as PropertyType
  const normalizedKey = normalizePropertyKey(field.key)
  if (normalizedKey) {
    propertySchema.value = {
      ...propertySchema.value,
      [normalizedKey]: nextType
    }
    await persistPropertySchema()
  }

  let nextValue: FrontmatterField['value'] = field.value
  if (nextType === 'checkbox') {
    nextValue = Boolean(field.value)
  } else if (nextType === 'number') {
    const parsed = Number(field.value)
    nextValue = Number.isFinite(parsed) ? parsed : 0
  } else if (nextType === 'list' || nextType === 'tags') {
    nextValue = Array.isArray(field.value)
      ? field.value
      : String(field.value ?? '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
  } else {
    nextValue = Array.isArray(field.value) ? field.value.join(', ') : String(field.value ?? '')
  }

  updatePropertyField(index, {
    type: nextType,
    value: nextValue,
    styleHint: nextType === 'list' || nextType === 'tags' ? 'inline-list' : field.styleHint
  })
}

async function onPropertyKeyInput(index: number, nextKey: string) {
  const field = activeFields.value[index]
  const previousKey = normalizePropertyKey(field?.key ?? '')
  const normalizedNext = normalizePropertyKey(nextKey)
  const lockedType = lockedPropertyTypeForKey(normalizedNext)
  const currentValue = field?.value
  const nextValue = (() => {
    if (!field) return ''
    if (!lockedType) return currentValue ?? ''
    if (lockedType === 'list' || lockedType === 'tags') {
      if (Array.isArray(currentValue)) return currentValue
      return String(currentValue ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }
    if (lockedType === 'checkbox') return Boolean(currentValue)
    if (lockedType === 'number') {
      const parsed = Number(currentValue)
      return Number.isFinite(parsed) ? parsed : 0
    }
    return String(currentValue ?? '')
  })()
  updatePropertyField(index, {
    key: nextKey,
    ...(lockedType ? { type: lockedType, value: nextValue, styleHint: lockedType === 'list' || lockedType === 'tags' ? 'inline-list' : 'plain' } : {})
  })
  if (!normalizedNext) return

  const nextSchema: PropertyTypeSchema = {
    ...propertySchema.value,
    [normalizedNext]: lockedType ?? (field?.type ?? 'text')
  }
  if (previousKey && previousKey !== normalizedNext) {
    delete nextSchema[previousKey]
  }
  propertySchema.value = nextSchema
  await persistPropertySchema()
}

function onPropertyValueInput(index: number, rawInput: string) {
  const field = activeFields.value[index]
  if (!field) return
  const nextValue = coerceValueForType(effectiveTypeForField(field), rawInput)
  updatePropertyField(index, { value: nextValue })
}

function onPropertyCheckboxInput(index: number, checked: boolean) {
  updatePropertyField(index, { value: checked })
}

function onPropertyTokensChange(index: number, tokens: string[]) {
  const field = activeFields.value[index]
  if (!field) return
  const type = effectiveTypeForField(field)
  if (type !== 'list' && type !== 'tags') return
  updatePropertyField(index, { value: tokens, styleHint: 'inline-list' })
}

function effectiveTypeForField(field: FrontmatterField): PropertyType {
  return lockedPropertyTypeForKey(field.key) ?? field.type
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? ''
}

function selectValue(event: Event): string {
  return (event.target as HTMLSelectElement | null)?.value ?? ''
}

function checkboxValue(event: Event): boolean {
  return (event.target as HTMLInputElement | null)?.checked ?? false
}

function hasStructuredProperties(path: string): boolean {
  return (frontmatterByPath.value[path]?.fields ?? []).some((field) => field.key.trim().length > 0)
}

function propertiesExpanded(path: string): boolean {
  const stored = propertiesExpandedByPath.value[path]
  if (typeof stored === 'boolean') return stored
  return hasStructuredProperties(path)
}

function togglePropertiesVisibility() {
  const path = currentPath.value
  if (!path) return
  propertiesExpandedByPath.value = {
    ...propertiesExpandedByPath.value,
    [path]: !propertiesExpanded(path)
  }
}

function onRawYamlInput(nextRaw: string) {
  const path = currentPath.value
  if (!path) return
  rawYamlByPath.value = {
    ...rawYamlByPath.value,
    [path]: nextRaw
  }

  const body = frontmatterByPath.value[path]?.body ?? ''
  const markdown = composeMarkdownDocument(body, nextRaw)
  const parsed = parseFrontmatter(markdown, propertySchema.value)
  frontmatterByPath.value = {
    ...frontmatterByPath.value,
    [path]: parsed
  }
  emitProperties(path)
  setPropertyDirty(path)
}

async function renderBlocks(blocks: OutputBlockData[]) {
  if (!editor) return
  const rememberedScroll = holder.value?.scrollTop ?? 0
  suppressOnChange = true
  try {
    await editor.render({
      time: Date.now(),
      version: '2.0.0',
      blocks
    })
  } finally {
    suppressOnChange = false
  }
  await nextTick()
  if (holder.value) {
    holder.value.scrollTop = rememberedScroll
  }
}

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

function clearTitleLockTimer() {
  if (!titleLockTimer) return
  clearTimeout(titleLockTimer)
  titleLockTimer = null
}

function resolveMermaidReplaceDialog(approved: boolean) {
  const resolver = mermaidReplaceDialog.value.resolve
  mermaidReplaceDialog.value = {
    visible: false,
    templateLabel: '',
    resolve: null
  }
  resolver?.(approved)
}

function requestMermaidReplaceConfirm(payload: { templateLabel: string }): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (mermaidReplaceDialog.value.resolve) {
      mermaidReplaceDialog.value.resolve(false)
    }
    mermaidReplaceDialog.value = {
      visible: true,
      templateLabel: payload.templateLabel,
      resolve
    }
  })
}

function scheduleAutosave() {
  clearAutosaveTimer()
  autosaveTimer = setTimeout(() => {
    void saveCurrentFile(false)
  }, AUTOSAVE_IDLE_MS)
}

function isVirtualTitleDomValid(): boolean {
  if (!holder.value) return true
  const firstBlock = holder.value.querySelector('.ce-block') as HTMLElement | null
  if (!firstBlock) return false
  if (firstBlock.dataset.id !== VIRTUAL_TITLE_BLOCK_ID) return false
  const header = firstBlock.querySelector('.ce-header') as HTMLElement | null
  return Boolean(header && header.tagName.toLowerCase() === 'h1')
}

async function enforceVirtualTitleStructure() {
  if (!editor || suppressOnChange) return
  const path = currentPath.value
  if (!path) return

  const data = await editor.save()
  const rawBlocks = (data.blocks ?? []) as OutputBlockData[]
  const title = readVirtualTitle(rawBlocks) || blockTextCandidate(rawBlocks[0]) || noteTitleFromPath(path)
  const normalized = withVirtualTitle(rawBlocks, title)
  if (!normalized.changed) return
  await renderBlocks(normalized.blocks)
}

function scheduleVirtualTitleLock() {
  clearTitleLockTimer()
  titleLockTimer = setTimeout(() => {
    if (isVirtualTitleDomValid()) return
    void enforceVirtualTitleStructure()
  }, 80)
}

function closeSlashMenu() {
  slashOpen.value = false
  slashIndex.value = 0
}

function closeWikilinkMenu() {
  logWikilinkDebug('menu.close')
  wikilinkOpen.value = false
  wikilinkIndex.value = 0
  wikilinkQuery.value = ''
  wikilinkHeadingResults.value = []
  wikilinkLoadToken += 1
  wikilinkHeadingLoadToken += 1
}

async function refreshWikilinkTargets() {
  const token = ++wikilinkLoadToken
  logWikilinkDebug('targets.refresh.start', { token })
  try {
    const paths = await props.loadLinkTargets()
    if (token !== wikilinkLoadToken) {
      logWikilinkDebug('targets.refresh.stale', { token, activeToken: wikilinkLoadToken })
      return
    }
    wikilinkTargets.value = paths
    logWikilinkDebug('targets.refresh.success', { token, count: paths.length })
  } catch (error) {
    if (token !== wikilinkLoadToken) {
      logWikilinkDebug('targets.refresh.error.stale', { token, activeToken: wikilinkLoadToken })
      return
    }
    wikilinkTargets.value = []
    logWikilinkDebug('targets.refresh.error', {
      token,
      error: error instanceof Error ? error.message : String(error)
    })
  }
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

function firstEditableNonVirtualBlockId(): string | null {
  if (!holder.value) return null
  const blocks = Array.from(holder.value.querySelectorAll('.ce-block')) as HTMLElement[]
  for (const block of blocks) {
    const id = block.dataset.id ?? ''
    if (!id || id === VIRTUAL_TITLE_BLOCK_ID) continue
    const editable = block.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (editable) return id
  }
  return null
}

function focusEditor() {
  if (!holder.value) return
  const editable = holder.value.querySelector('[contenteditable="true"]') as HTMLElement | null
  editable?.focus()
}

async function focusFirstContentBlock() {
  if (!editor) return

  const existing = firstEditableNonVirtualBlockId()
  if (existing) {
    placeCaretInBlock(existing)
    return
  }

  // New/empty notes have only the virtual title block. Create one real paragraph
  // block for typing, but don't mark the document dirty until the user edits.
  suppressOnChange = true
  try {
    const inserted = editor.blocks.insert('paragraph', { text: '' }, undefined, 1, true, false)
    await nextTick()
    placeCaretInBlock(inserted.id)
  } finally {
    suppressOnChange = false
  }
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
  logWikilinkDebug('menu.open', {
    query,
    keepSelection,
    left: wikilinkLeft.value,
    top: wikilinkTop.value
  })
  void refreshWikilinkHeadingResults(query)
}

function parseWikilinkQuery(raw: string): { notePart: string; headingPart: string | null } {
  const targetPart = raw.split('|', 1)[0]?.trim() ?? ''
  if (!targetPart) return { notePart: '', headingPart: null }
  if (targetPart.startsWith('#')) {
    return { notePart: '', headingPart: targetPart.slice(1).trim() }
  }
  const hashIndex = targetPart.indexOf('#')
  if (hashIndex < 0) return { notePart: targetPart, headingPart: null }
  return {
    notePart: targetPart.slice(0, hashIndex).trim(),
    headingPart: targetPart.slice(hashIndex + 1).trim()
  }
}

function uniqueHeadings(headings: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const heading of headings) {
    const text = heading.trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

function headingResultsFor(baseTarget: string, headingQuery: string, headings: string[]) {
  const query = headingQuery.toLowerCase()
  return uniqueHeadings(headings)
    .filter((heading) => !query || heading.toLowerCase().includes(query))
    .slice(0, 24)
    .map((heading) => {
      const target = baseTarget ? `${baseTarget}#${heading}` : `#${heading}`
      return {
        id: `heading:${target}`,
        label: `#${heading}`,
        target,
        isCreate: false
      }
    })
}

async function refreshWikilinkHeadingResults(rawQuery: string) {
  if (!wikilinkOpen.value) return
  logWikilinkDebug('headings.refresh.start', { rawQuery })
  const parsed = parseWikilinkQuery(rawQuery)
  if (parsed.headingPart === null) {
    wikilinkHeadingResults.value = []
    logWikilinkDebug('headings.refresh.skip.no-heading', { rawQuery })
    return
  }

  if (!parsed.notePart) {
    const headings = parseOutlineFromDom().map((item) => item.text)
    wikilinkHeadingResults.value = headingResultsFor('', parsed.headingPart, headings)
    logWikilinkDebug('headings.refresh.from-outline', { count: headings.length })
    return
  }

  const cacheKey = parsed.notePart.toLowerCase()
  if (wikilinkHeadingCache.value[cacheKey]) {
    wikilinkHeadingResults.value = headingResultsFor(parsed.notePart, parsed.headingPart, wikilinkHeadingCache.value[cacheKey])
    logWikilinkDebug('headings.refresh.cache-hit', {
      notePart: parsed.notePart,
      count: wikilinkHeadingCache.value[cacheKey].length
    })
    return
  }

  const token = ++wikilinkHeadingLoadToken
  logWikilinkDebug('headings.refresh.fetch', { token, notePart: parsed.notePart })
  const headings = await props.loadLinkHeadings(parsed.notePart)
  if (token !== wikilinkHeadingLoadToken) {
    logWikilinkDebug('headings.refresh.stale', { token, activeToken: wikilinkHeadingLoadToken })
    return
  }
  wikilinkHeadingCache.value = {
    ...wikilinkHeadingCache.value,
    [cacheKey]: headings
  }
  wikilinkHeadingResults.value = headingResultsFor(parsed.notePart, parsed.headingPart, headings)
  logWikilinkDebug('headings.refresh.success', { token, notePart: parsed.notePart, count: headings.length })
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
  logWikilinkDebug('query.detected', { query })
  return query
}

function parseWikilinkToken(token: string): { target: string; label: string } | null {
  if (!token.startsWith('[[') || !token.endsWith(']]')) return null
  const inner = token.slice(2, -2).trim()
  if (!inner) return null
  const [targetRaw, aliasRaw] = inner.split('|', 2)
  const target = targetRaw.trim()
  if (!target || target.includes('\n')) return null
  const defaultLabel = (() => {
    const parsed = parseWikilinkTarget(target)
    if (parsed.anchor?.heading && !parsed.notePath) return parsed.anchor.heading
    return target
  })()
  const label = (aliasRaw ?? '').trim() || defaultLabel
  return { target, label }
}

function parseHyperlinkToken(token: string): { href: string; label: string } | null {
  const match = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
  if (!match) return null
  const label = match[1].trim()
  const href = match[2].trim()
  if (!label || !href || label.includes('\n') || href.includes('\n')) return null
  return { href, label }
}

function parseEditableLinkToken(token: string): EditableLinkToken | null {
  const wikilink = parseWikilinkToken(token)
  if (wikilink) {
    return { kind: 'wikilink', target: wikilink.target, label: wikilink.label }
  }

  const hyperlink = parseHyperlinkToken(token)
  if (hyperlink) {
    return { kind: 'hyperlink', href: hyperlink.href, label: hyperlink.label }
  }

  return null
}

function createWikilinkAnchor(target: string, label = target): HTMLAnchorElement {
  const anchor = document.createElement('a')
  anchor.href = `wikilink:${encodeURIComponent(target)}`
  anchor.dataset.wikilinkTarget = target
  anchor.textContent = label
  anchor.className = 'md-wikilink'
  return anchor
}

function createHyperlinkAnchor(href: string, label: string): HTMLAnchorElement {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.textContent = label
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  return anchor
}

function createAnchorFromToken(token: EditableLinkToken): HTMLAnchorElement {
  if (token.kind === 'wikilink') {
    return createWikilinkAnchor(token.target, token.label)
  }
  return createHyperlinkAnchor(token.href, token.label)
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
  const close = text.indexOf(']]', start + 2)
  const end = close >= 0 ? close + 2 : offset

  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  range.deleteContents()

  const rawToken = `[[${target}]]`
  const insertedText = document.createTextNode(rawToken)
  range.insertNode(insertedText)
  expandedLinkContext = { textNode: insertedText, range: { start: 0, end: rawToken.length } }

  const nextRange = document.createRange()
  // Place caret after the token so Enter/Tab continue normal editor flow (for example, lists).
  nextRange.setStart(insertedText, rawToken.length)
  nextRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(nextRange)
  logWikilinkDebug('query.replace', { target, rawToken, start, end })
  return true
}

function defaultWikilinkLabel(target: string): string {
  const parsed = parseWikilinkTarget(target)
  if (parsed.anchor?.heading && !parsed.notePath) return parsed.anchor.heading
  return target
}

function tokenForAnchor(anchor: HTMLAnchorElement): string {
  const target = readWikilinkTargetFromAnchor(anchor)
  if (target) {
    const label = anchor.textContent?.trim() ?? ''
    const defaultLabel = defaultWikilinkLabel(target)
    if (label && label !== defaultLabel) {
      return `[[${target}|${label}]]`
    }
    return `[[${target}]]`
  }

  const href = anchor.getAttribute('href')?.trim() ?? ''
  if (!href) return ''
  const label = anchor.textContent?.trim() ?? ''
  return `[${label || href}](${href})`
}

function nodeToEditableLinkAnchor(node: Node | null): HTMLAnchorElement | null {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return null
  const element = node as HTMLElement
  if (element.tagName.toLowerCase() !== 'a') return null
  const anchor = element as HTMLAnchorElement
  return tokenForAnchor(anchor) ? anchor : null
}

function adjacentEditableLinkAnchor(selection: Selection, direction: 'left' | 'right'): HTMLAnchorElement | null {
  const node = selection.focusNode
  if (!node) return null
  const ownerElement =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : (node.parentElement as HTMLElement | null)
  const ownerAnchor = ownerElement?.closest('a') as HTMLAnchorElement | null
  if (ownerAnchor) {
    return tokenForAnchor(ownerAnchor) ? ownerAnchor : null
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text
    if (direction === 'left' && selection.focusOffset === 0) {
      return nodeToEditableLinkAnchor(textNode.previousSibling)
    }
    if (direction === 'right' && selection.focusOffset === textNode.length) {
      return nodeToEditableLinkAnchor(textNode.nextSibling)
    }
    return null
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement
    const childIndex = selection.focusOffset
    if (direction === 'left' && childIndex > 0) {
      return nodeToEditableLinkAnchor(element.childNodes.item(childIndex - 1))
    }
    if (direction === 'right' && childIndex < element.childNodes.length) {
      return nodeToEditableLinkAnchor(element.childNodes.item(childIndex))
    }
  }

  return null
}

function expandAdjacentLinkForEditing(direction: 'left' | 'right'): boolean {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false

  const anchor = adjacentEditableLinkAnchor(selection, direction)
  if (!anchor || !anchor.parentNode) return false

  const token = tokenForAnchor(anchor)
  if (!token) return false

  const textNode = document.createTextNode(token)
  anchor.parentNode.replaceChild(textNode, anchor)

  const range = document.createRange()
  const nextOffset = direction === 'left' ? Math.max(0, token.length - 1) : Math.min(token.length, 1)
  range.setStart(textNode, nextOffset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  expandedLinkContext = { textNode, range: { start: 0, end: token.length } }
  suppressCollapseOnNextArrowKeyup = true
  logWikilinkDebug('link.expand-for-edit', { direction, token })
  return true
}

function placeCaretAdjacentToAnchor(anchor: HTMLAnchorElement, place: 'before' | 'after', selection: Selection) {
  const parent = anchor.parentNode
  if (!parent) return false

  let textNode: Text | null = null
  let offset = 0
  let insertedSpacer = false

  if (place === 'after') {
    const next = anchor.nextSibling
    if (next && next.nodeType === Node.TEXT_NODE) {
      textNode = next as Text
      if ((textNode.textContent ?? '').length === 0) {
        textNode.textContent = ' '
        insertedSpacer = true
        offset = 1
      } else {
        offset = 0
      }
    } else {
      textNode = document.createTextNode(' ')
      parent.insertBefore(textNode, next)
      insertedSpacer = true
      offset = 1
    }
  } else {
    const prev = anchor.previousSibling
    if (prev && prev.nodeType === Node.TEXT_NODE) {
      textNode = prev as Text
      if ((textNode.textContent ?? '').length === 0) {
        textNode.textContent = ' '
        insertedSpacer = true
      }
      offset = (textNode.textContent ?? '').length
    } else {
      textNode = document.createTextNode(' ')
      parent.insertBefore(textNode, anchor)
      insertedSpacer = true
      offset = 1
    }
  }

  const range = document.createRange()
  range.setStart(textNode, offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  logWikilinkDebug('caret.place-adjacent-anchor', { place, insertedSpacer, offset, textLength: textNode.data.length })
  return true
}

function replaceTokenRangeWithAnchor(textNode: Text, start: number, end: number, place: 'before' | 'after'): boolean {
  if (!textNode.parentNode) {
    logWikilinkDebug('token.collapse.skip.detached-node')
    return false
  }
  if (start < 0 || end <= start || end > textNode.data.length) {
    logWikilinkDebug('token.collapse.skip.invalid-range', { start, end, length: textNode.data.length })
    return false
  }
  const token = textNode.data.slice(start, end)
  const parsed = parseEditableLinkToken(token)
  if (!parsed) {
    logWikilinkDebug('token.collapse.skip.unparsed-token', { token })
    return false
  }

  const selection = window.getSelection()
  if (!selection) {
    logWikilinkDebug('token.collapse.skip.no-selection', { token })
    return false
  }

  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  range.deleteContents()

  const anchor = createAnchorFromToken(parsed)
  range.insertNode(anchor)

  if (!placeCaretAdjacentToAnchor(anchor, place, selection)) {
    logWikilinkDebug('token.collapse.skip.unable-to-place-caret', { place, token })
    return false
  }
  if (
    expandedLinkContext &&
    expandedLinkContext.textNode === textNode &&
    expandedLinkContext.range.start === start &&
    expandedLinkContext.range.end === end
  ) {
    expandedLinkContext = null
  }
  logWikilinkDebug('token.collapse.success', { token, place, kind: parsed.kind })
  return true
}

function caretRelationToTokenRange(selection: Selection, context: ArrowLinkContext): 'before' | 'inside' | 'after' {
  if (!selection.rangeCount || !selection.isCollapsed) return 'after'

  const tokenRange = document.createRange()
  tokenRange.setStart(context.textNode, context.range.start)
  tokenRange.setEnd(context.textNode, context.range.end)

  // Fast path: same text node, compare offsets directly.
  if (selection.focusNode === context.textNode) {
    const offset = selection.focusOffset
    if (offset < context.range.start) return 'before'
    if (offset > context.range.end) return 'after'
    return 'inside'
  }

  // Fallback for cross-node caret points.
  try {
    const position = tokenRange.comparePoint(selection.focusNode as Node, selection.focusOffset)
    if (position < 0) return 'before'
    if (position > 0) return 'after'
    return 'inside'
  } catch {
    // Keep a defensive fallback for browsers/editors that may throw on comparePoint.
  }

  const caretRange = selection.getRangeAt(0)
  const startCmp = caretRange.compareBoundaryPoints(Range.END_TO_START, tokenRange)
  const endCmp = caretRange.compareBoundaryPoints(Range.START_TO_END, tokenRange)

  if (startCmp < 0) return 'before'
  if (endCmp > 0) return 'after'
  return 'inside'
}

function collapseExpandedLinkIfCaretOutside(): boolean {
  if (!expandedLinkContext) return false

  const context = expandedLinkContext
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount || !selection.isCollapsed) {
    expandedLinkContext = null
    return false
  }

  const relation = caretRelationToTokenRange(selection, context)
  if (relation === 'inside') return false

  const place = relation === 'before' ? 'before' : 'after'
  const collapsed = replaceTokenRangeWithAnchor(context.textNode, context.range.start, context.range.end, place)
  if (!collapsed) {
    expandedLinkContext = null
  }
  logWikilinkDebug('expanded.collapse-on-caret-leave', { relation, collapsed })
  return collapsed
}

function findMarkdownLinkRangeEndingAt(
  text: string,
  offset: number
): { start: number; end: number } | null {
  if (offset < 1 || text[offset - 1] !== ')') return null
  const openParen = text.lastIndexOf('(', offset - 1)
  if (openParen < 0) return null
  const closeBracket = openParen - 1
  if (closeBracket < 0 || text[closeBracket] !== ']') return null
  const openBracket = text.lastIndexOf('[', closeBracket)
  if (openBracket < 0) return null
  if (openBracket > 0 && text[openBracket - 1] === '!') return null
  const token = text.slice(openBracket, offset)
  return parseHyperlinkToken(token) ? { start: openBracket, end: offset } : null
}

function findMarkdownLinkRangeStartingAt(
  text: string,
  offset: number
): { start: number; end: number } | null {
  if (text[offset] !== '[' || text[offset + 1] === '[') return null
  if (offset > 0 && text[offset - 1] === '!') return null
  const closeBracket = text.indexOf('](', offset + 1)
  if (closeBracket < 0) return null
  const closeParen = text.indexOf(')', closeBracket + 2)
  if (closeParen < 0) return null
  const token = text.slice(offset, closeParen + 1)
  return parseHyperlinkToken(token) ? { start: offset, end: closeParen + 1 } : null
}

function collapseClosedLinkNearCaret(): boolean {
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
        const collapsed = replaceTokenRangeWithAnchor(textNode, start, offset, 'after')
        if (collapsed) logWikilinkDebug('token.collapse.detect.trailing-wikilink', { start, end: offset })
        return collapsed
      }
    }
  }

  if (text.slice(offset, offset + 2) === '[[') {
    const close = text.indexOf(']]', offset + 2)
    if (close >= 0) {
      const collapsed = replaceTokenRangeWithAnchor(textNode, offset, close + 2, 'before')
      if (collapsed) logWikilinkDebug('token.collapse.detect.leading-wikilink', { start: offset, end: close + 2 })
      return collapsed
    }
  }

  const endingMarkdown = findMarkdownLinkRangeEndingAt(text, offset)
  if (endingMarkdown) {
    const collapsed = replaceTokenRangeWithAnchor(textNode, endingMarkdown.start, endingMarkdown.end, 'after')
    if (collapsed) logWikilinkDebug('token.collapse.detect.trailing-link', endingMarkdown)
    return collapsed
  }

  const startingMarkdown = findMarkdownLinkRangeStartingAt(text, offset)
  if (startingMarkdown) {
    const collapsed = replaceTokenRangeWithAnchor(textNode, startingMarkdown.start, startingMarkdown.end, 'before')
    if (collapsed) logWikilinkDebug('token.collapse.detect.leading-link', startingMarkdown)
    return collapsed
  }

  return false
}

async function applyWikilinkSelection(target: string) {
  logWikilinkDebug('selection.apply.start', { target })
  const replaced = replaceActiveWikilinkQuery(target)
  closeWikilinkMenu()
  if (!replaced) {
    logWikilinkDebug('selection.apply.abort.replace-failed', { target })
    return
  }

  const path = currentPath.value
  if (path) {
    setDirty(path, true)
    setSaveError(path, '')
    scheduleAutosave()
  }
  await nextTick()
  const collapsed = collapseClosedLinkNearCaret()
  logWikilinkDebug('selection.apply.done', { target, collapsed })
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

  const wikilink = parseWikilinkToken(token)
  if (wikilink) {
    await openLinkTargetWithAutosave(wikilink.target)
    return
  }

  const dateMatch = token.match(/^\d{4}-\d{2}-\d{2}$/)
  if (!dateMatch) return
  await openLinkTargetWithAutosave(dateMatch[0])
}

async function openLinkTargetWithAutosave(target: string) {
  const path = currentPath.value
  if (path && dirtyByPath.value[path]) {
    clearAutosaveTimer()
    await saveCurrentFile(false)
    if (dirtyByPath.value[path]) return
  }
  await props.openLinkTarget(target)
}

async function syncWikilinkMenuFromCaret() {
  const query = readWikilinkQueryAtCaret()
  if (query === null) {
    if (wikilinkOpen.value) logWikilinkDebug('menu.sync.close.no-query')
    closeWikilinkMenu()
    return
  }
  if (!wikilinkOpen.value) {
    await refreshWikilinkTargets()
  }
  openWikilinkMenuAtCaret(query, true)
}

function replaceCurrentBlock(type: string, data: Record<string, unknown>): boolean {
  if (!editor) return false
  const index = editor.blocks.getCurrentBlockIndex()
  if (index < 0) return false

  try {
    const inserted = editor.blocks.insert(type, data, undefined, index, true, true)
    const blockId = inserted?.id ?? editor.blocks.getBlockByIndex(index)?.id ?? null
    if (blockId) {
      if (!editor.caret.setToBlock(blockId, 'start')) {
        placeCaretInBlock(blockId)
      }
    } else {
      editor.caret.focus()
    }
    return true
  } catch (error) {
    console.error('Failed to replace current block', error)
    return false
  }
}

function applyMarkdownShortcut(marker: string) {
  const checklistMatch = marker.match(/^(-\s*)?\[([ xX]?)\]$/)
  if (checklistMatch) {
    return {
      type: 'list',
      data: emptyListData('checklist', checklistMatch[2].toLowerCase() === 'x')
    }
  }

  switch (marker) {
    case '-':
    case '*':
    case '+':
      return { type: 'list', data: emptyListData('unordered') }
    case '1.':
      return { type: 'list', data: emptyListData('ordered') }
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
  const target = event.target as HTMLElement | null
  if (target?.closest('.meditor-mermaid')) {
    return
  }

  if (wikilinkOpen.value) {
    logWikilinkDebug('keydown.menu', { key: event.key })
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
      logWikilinkDebug('keydown.menu.confirm', { key: event.key, selected })
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
    if (expandAdjacentLinkForEditing(direction)) {
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
      replaceCurrentBlock(command.type, command.data)
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

  if (block.id === VIRTUAL_TITLE_BLOCK_ID) {
    if (event.key === 'Backspace' && getCurrentBlockText(block).length === 0) {
      event.preventDefault()
      return
    }
  }

  if (event.key === '[' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    window.setTimeout(() => {
      void syncWikilinkMenuFromCaret()
    }, 0)
  }

  if (event.key === '/' && block.name === 'paragraph' && isCurrentBlockEmpty()) {
    // Let EditorJS handle the native slash menu to avoid duplicate popovers.
    closeSlashMenu()
    return
  }

  if ((event.key === ' ' || event.code === 'Space') && block.name === 'paragraph') {
    const marker = getCurrentBlockText(block)
    const transform = applyMarkdownShortcut(marker)
    if (transform) {
      if (replaceCurrentBlock(transform.type, transform.data)) {
        event.preventDefault()
        closeSlashMenu()
        return
      }
    }
  }

  if (event.key === 'Enter' && block.name === 'paragraph') {
    const marker = getCurrentBlockText(block)
    if (marker === '```') {
      event.preventDefault()
      closeSlashMenu()
      replaceCurrentBlock('code', { code: '' })
      return
    }
  }

  if (event.key === 'Backspace' && block.name === 'header' && getCurrentBlockText(block).length === 0) {
    const index = editor.blocks.getCurrentBlockIndex()
    if (index === 0) {
      event.preventDefault()
      closeSlashMenu()
      return
    }
    event.preventDefault()
    closeSlashMenu()
    replaceCurrentBlock('paragraph', { text: '' })
  }
}

function onEditorKeyup(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.meditor-mermaid')) {
    return
  }
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && suppressCollapseOnNextArrowKeyup) {
    suppressCollapseOnNextArrowKeyup = false
    return
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (collapseExpandedLinkIfCaretOutside()) {
      return
    }
    collapseClosedLinkNearCaret()
    return
  }

  if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
    if (wikilinkOpen.value) logWikilinkDebug('keyup.menu-ignored', { key: event.key })
    return
  }

  collapseClosedLinkNearCaret()
  captureCaret(currentPath.value)
  void syncWikilinkMenuFromCaret()
}

function onEditorClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.ce-block')) {
    return
  }
  if (target.closest('.meditor-mermaid')) {
    return
  }
  collapseExpandedLinkIfCaretOutside()
  const anchor = target.closest('a') as HTMLAnchorElement | null
  const wikilinkTarget = anchor ? readWikilinkTargetFromAnchor(anchor) : ''
  if (anchor && wikilinkTarget) {
    event.preventDefault()
    event.stopPropagation()
    void openLinkTargetWithAutosave(wikilinkTarget)
    return
  }
  collapseClosedLinkNearCaret()
  captureCaret(currentPath.value)
  void syncWikilinkMenuFromCaret()
  void openLinkedTokenAtCaret()
}

function onEditorContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return
  const block = target.closest('.ce-block') as HTMLElement | null
  if (!block || block.dataset.id !== VIRTUAL_TITLE_BLOCK_ID) return
  event.preventDefault()
  event.stopPropagation()
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
  const target = event.target as HTMLElement | null
  if (target?.closest('.meditor-mermaid')) {
    return
  }

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
    const block = header.closest('.ce-block') as HTMLElement | null
    if (block?.dataset.id === VIRTUAL_TITLE_BLOCK_ID) continue
    const text = header.innerText.trim()
    if (!text) continue
    const tag = header.tagName.toLowerCase()
    const levelRaw = Number.parseInt(tag.replace('h', ''), 10)
    const level = (levelRaw >= 1 && levelRaw <= 3 ? levelRaw : 3) as 1 | 2 | 3
    out.push({ level, text })
  }

  return out
}

function getOutlineHeaderByIndex(index: number): HTMLElement | null {
  if (!holder.value || index < 0) return null
  const headers = Array.from(holder.value.querySelectorAll('.ce-header')) as HTMLElement[]
  let visibleIndex = 0

  for (const header of headers) {
    const block = header.closest('.ce-block') as HTMLElement | null
    if (block?.dataset.id === VIRTUAL_TITLE_BLOCK_ID) continue
    const text = header.innerText.trim()
    if (!text) continue
    if (visibleIndex === index) return header
    visibleIndex += 1
  }

  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function headingMatchesAnchor(headerText: string, anchorHeading: string): boolean {
  const wanted = normalizeHeadingAnchor(anchorHeading)
  if (!wanted) return false
  const actual = normalizeHeadingAnchor(headerText)
  if (actual === wanted) return true

  const wantedSlug = slugifyHeading(anchorHeading)
  const actualSlug = slugifyHeading(headerText)
  return Boolean(wantedSlug && actualSlug && wantedSlug === actualSlug)
}

function getHeaderByAnchor(heading: string): HTMLElement | null {
  if (!holder.value) return null
  const headers = Array.from(holder.value.querySelectorAll('.ce-header')) as HTMLElement[]
  for (const header of headers) {
    const block = header.closest('.ce-block') as HTMLElement | null
    if (block?.dataset.id === VIRTUAL_TITLE_BLOCK_ID) continue
    const text = header.innerText.trim()
    if (!text) continue
    if (headingMatchesAnchor(text, heading)) return header
  }
  return null
}

function getBlockByAnchor(blockIdRaw: string): HTMLElement | null {
  if (!holder.value) return null
  const blockId = normalizeBlockId(blockIdRaw)
  if (!blockId) return null
  const matcher = new RegExp(`(^|\\s)\\^${escapeRegExp(blockId)}(\\s|$)`, 'i')
  const blocks = Array.from(holder.value.querySelectorAll('.ce-block')) as HTMLElement[]
  for (const block of blocks) {
    if (block.dataset.id === VIRTUAL_TITLE_BLOCK_ID) continue
    const text = (block.innerText ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (matcher.test(text)) return block
  }
  return null
}

async function revealAnchor(anchor: WikilinkAnchor): Promise<boolean> {
  if (!holder.value) return false
  if (!anchor.heading && !anchor.blockId) return false

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await nextTick()
    const target = anchor.blockId
      ? getBlockByAnchor(anchor.blockId)
      : anchor.heading
        ? getHeaderByAnchor(anchor.heading)
        : null
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      const focusTarget = target.matches('.ce-header')
        ? target
        : (target.querySelector('[contenteditable="true"], .ce-code__textarea') as HTMLElement | null)
      focusTarget?.focus()
      return true
    }
    await new Promise((resolve) => window.setTimeout(resolve, 35))
  }

  return false
}

async function revealOutlineHeading(index: number) {
  if (!holder.value) return
  await nextTick()
  const target = getOutlineHeaderByIndex(index)
  if (!target) return
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
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
      table: {
        class: Table as unknown as never,
        config: {
          rows: 2,
          cols: 2,
          withHeadings: true
        }
      },
      callout: {
        class: CalloutTool as unknown as never
      },
      mermaid: {
        class: MermaidTool as unknown as never,
        config: {
          confirmReplace: requestMermaidReplaceConfirm
        }
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
      scheduleVirtualTitleLock()
      emitOutlineSoon()
    }
  })

  await editor.isReady
  holder.value.addEventListener('keydown', onEditorKeydown, true)
  holder.value.addEventListener('keyup', onEditorKeyup, true)
  holder.value.addEventListener('click', onEditorClick, true)
  holder.value.addEventListener('contextmenu', onEditorContextMenu, true)
  holder.value.addEventListener('paste', onEditorPaste, true)
}

async function destroyEditor() {
  clearAutosaveTimer()
  clearTitleLockTimer()
  closeSlashMenu()
  closeWikilinkMenu()

  if (holder.value) {
    holder.value.removeEventListener('keydown', onEditorKeydown, true)
    holder.value.removeEventListener('keyup', onEditorKeyup, true)
    holder.value.removeEventListener('click', onEditorClick, true)
    holder.value.removeEventListener('contextmenu', onEditorContextMenu, true)
    holder.value.removeEventListener('paste', onEditorPaste, true)
  }

  if (!editor) return
  await editor.destroy()
  editor = null
}

async function loadCurrentFile(path: string) {
  if (!path) return

  await ensureEditor()
  await ensurePropertySchemaLoaded()
  if (!editor) return

  clearAutosaveTimer()
  closeSlashMenu()
  closeWikilinkMenu()
  setSaveError(path, '')

  try {
    const txt = await props.openFile(path)
    parseAndStoreFrontmatter(path, txt)
    const body = frontmatterByPath.value[path]?.body ?? txt
    const parsed = markdownToEditorData(body)
    const normalized = withVirtualTitle(parsed.blocks as OutputBlockData[], noteTitleFromPath(path))
    suppressOnChange = true
    loadedTextByPath.value = {
      ...loadedTextByPath.value,
      [path]: txt
    }
    await editor.render({
      time: Date.now(),
      version: parsed.version,
      blocks: normalized.blocks
    })
    setDirty(path, false)

    await nextTick()
    const remembered = scrollTopByPath.value[path]
    const hasRememberedScroll = typeof remembered === 'number'
    const targetScrollTop = remembered ?? 0
    if (holder.value) {
      holder.value.scrollTop = targetScrollTop
    }
    const restoredCaret = restoreCaret(path)
    if (!restoredCaret && (!hasRememberedScroll || targetScrollTop <= 1)) {
      await focusFirstContentBlock()
    }
    emitOutlineSoon()
  } catch (err) {
    setSaveError(path, err instanceof Error ? err.message : 'Could not read file.')
  } finally {
    suppressOnChange = false
  }
}

async function saveCurrentFile(manual = true) {
  const initialPath = currentPath.value
  if (!initialPath || !editor || savingByPath.value[initialPath]) return

  let savePath = initialPath
  setSaving(savePath, true)
  if (manual) setSaveError(savePath, '')

  try {
    const data = await editor.save()
    const rawBlocks = (data.blocks ?? []) as OutputBlockData[]
    const requestedTitle = readVirtualTitle(rawBlocks) || blockTextCandidate(rawBlocks[0]) || noteTitleFromPath(initialPath)
    const lastLoaded = loadedTextByPath.value[initialPath] ?? ''

    const latestOnDisk = await props.openFile(initialPath)
    if (latestOnDisk !== lastLoaded) {
      throw new Error('File changed on disk. Reload before saving to avoid overwrite.')
    }

    const renameResult = await props.renameFileFromTitle(initialPath, requestedTitle)
    savePath = renameResult.path
    const normalized = withVirtualTitle(rawBlocks, renameResult.title)
    const markdownBlocks = stripVirtualTitle(normalized.blocks)
    const bodyMarkdown = editorDataToMarkdown({ blocks: markdownBlocks as unknown as EditorBlock[] })
    const frontmatterState = frontmatterByPath.value[savePath] ?? frontmatterByPath.value[initialPath]
    const frontmatterYaml = propertyEditorMode.value === 'raw'
      ? (rawYamlByPath.value[savePath] ?? rawYamlByPath.value[initialPath] ?? '')
      : serializeFrontmatter(serializableFrontmatterFields(frontmatterState?.fields ?? []))
    const markdown = composeMarkdownDocument(bodyMarkdown, frontmatterYaml)

    if (!manual && savePath === initialPath && markdown === lastLoaded) {
      setDirty(savePath, false)
      return
    }

    if (savePath !== initialPath) {
      movePathState(initialPath, savePath)
      emit('path-renamed', { from: initialPath, to: savePath, manual })
    }

    if (normalized.changed) {
      await renderBlocks(normalized.blocks)
    }

    const result = await props.saveFile(savePath, markdown, { explicit: manual })
    if (!result.persisted) {
      setDirty(savePath, true)
      return
    }

    loadedTextByPath.value = {
      ...loadedTextByPath.value,
      [savePath]: markdown
    }
    parseAndStoreFrontmatter(savePath, markdown)
    if (savePath !== initialPath) {
      const nextLoaded = { ...loadedTextByPath.value }
      delete nextLoaded[initialPath]
      loadedTextByPath.value = nextLoaded
    }
    setDirty(savePath, false)
  } catch (err) {
    setSaveError(savePath, err instanceof Error ? err.message : 'Could not save file.')
  } finally {
    setSaving(savePath, false)
    emitOutlineSoon()
  }
}

watch(
  () => props.path,
  async (next, prev) => {
    if (prev && holder.value) {
      captureCaret(prev)
      scrollTopByPath.value = {
        ...scrollTopByPath.value,
        [prev]: holder.value.scrollTop
      }
    }

    const nextPath = next?.trim()
    if (!nextPath) {
      propertySchemaLoaded.value = false
      propertySchema.value = {}
      emit('properties', { path: '', items: [], parseErrorCount: 0 })
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
  clearTitleLockTimer()
  if (mermaidReplaceDialog.value.resolve) {
    mermaidReplaceDialog.value.resolve(false)
  }
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
  focusFirstContentBlock,
  revealSnippet,
  revealOutlineHeading,
  revealAnchor
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

    <div v-else class="editor-shell flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-slate-950">
      <section
        class="properties-panel border-b border-slate-200 dark:border-slate-800"
        :class="propertiesExpanded(path) ? 'px-8 py-3' : 'px-8 py-2'"
      >
        <div class="flex items-center justify-between gap-3" :class="propertiesExpanded(path) ? 'mb-2' : 'mb-0'">
          <button
            type="button"
            class="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100"
            @click="togglePropertiesVisibility"
          >
            <span aria-hidden="true">{{ propertiesExpanded(path) ? '▾' : '▸' }}</span>
            <span>Properties</span>
          </button>
          <div v-if="propertiesExpanded(path)" class="flex items-center gap-1.5">
            <button
              type="button"
              class="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:text-slate-200"
              :class="propertyEditorMode === 'structured' ? 'bg-slate-100 dark:bg-slate-800' : ''"
              :disabled="!canUseStructuredProperties"
              @click="propertyEditorMode = 'structured'"
            >
              Structured
            </button>
            <button
              type="button"
              class="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:text-slate-200"
              :class="propertyEditorMode === 'raw' ? 'bg-slate-100 dark:bg-slate-800' : ''"
              @click="propertyEditorMode = 'raw'"
            >
              Raw YAML
            </button>
          </div>
        </div>

        <div v-if="propertiesExpanded(path) && propertyEditorMode === 'structured'" class="space-y-2">
          <div
            v-for="(field, index) in structuredPropertyFields"
            :key="index"
            class="property-row grid grid-cols-[1fr_auto_2fr_auto] items-center gap-2"
          >
            <input
              :value="field.key"
              class="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              placeholder="key"
              @input="void onPropertyKeyInput(index, inputValue($event))"
            />
            <select
              :value="effectiveTypeForField(field)"
              class="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              :disabled="isPropertyTypeLocked(field.key)"
              @change="void onPropertyTypeChange(index, selectValue($event))"
            >
              <option value="text">Text</option>
              <option value="list">List</option>
              <option value="number">Number</option>
              <option value="checkbox">Checkbox</option>
              <option value="date">Date</option>
              <option value="tags">Tags</option>
            </select>
            <div class="min-w-0">
              <input
                v-if="effectiveTypeForField(field) === 'text' || effectiveTypeForField(field) === 'date'"
                :value="String(field.value ?? '')"
                class="w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                :placeholder="effectiveTypeForField(field) === 'date' ? 'YYYY-MM-DD' : 'value'"
                @input="onPropertyValueInput(index, inputValue($event))"
              />
              <input
                v-else-if="effectiveTypeForField(field) === 'number'"
                :value="String(field.value ?? 0)"
                class="w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                type="number"
                @input="onPropertyValueInput(index, inputValue($event))"
              />
              <PropertyTokenInput
                v-else-if="effectiveTypeForField(field) === 'list' || effectiveTypeForField(field) === 'tags'"
                :model-value="Array.isArray(field.value) ? field.value : []"
                :placeholder="effectiveTypeForField(field) === 'tags' ? 'add tag' : 'add value'"
                @update:modelValue="onPropertyTokensChange(index, $event)"
              />
              <label v-else class="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  :checked="Boolean(field.value)"
                  @change="onPropertyCheckboxInput(index, checkboxValue($event))"
                />
                true / false
              </label>
            </div>
            <button
              type="button"
              class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200"
              @click="removePropertyField(index)"
            >
              Remove
            </button>
          </div>

          <div class="flex items-center gap-2">
            <PropertyAddDropdown
              :options="CORE_PROPERTY_OPTIONS"
              :existing-keys="structuredPropertyKeys"
              @select="addPropertyField"
            />
          </div>
        </div>

        <div v-else-if="propertiesExpanded(path)">
          <textarea
            class="font-mono min-h-28 w-full rounded border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            :value="activeRawYaml"
            placeholder="title: My note"
            @input="onRawYamlInput(inputValue($event))"
          ></textarea>
        </div>

        <div v-if="propertiesExpanded(path) && activeParseErrors.length" class="mt-2 text-xs text-red-600 dark:text-red-400">
          <div v-for="(error, index) in activeParseErrors" :key="`${error.line}-${index}`">
            Line {{ error.line }}: {{ error.message }}
          </div>
        </div>
      </section>

      <div
        ref="holder"
        class="editor-holder relative min-h-0 flex-1 overflow-y-auto px-8 py-6"
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
        class="absolute z-20 w-80 max-w-[calc(100%-1rem)] rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900"
        :style="{ left: `${wikilinkLeft}px`, top: `${wikilinkTop}px` }"
      >
        <button
          v-for="(item, idx) in wikilinkResults"
          :key="item.id"
          type="button"
          class="block w-full min-w-0 overflow-hidden rounded px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          :class="idx === wikilinkIndex ? 'bg-slate-100 dark:bg-slate-800' : ''"
          :title="item.label"
          @mousedown.prevent="wikilinkIndex = idx"
          @click.prevent="applyWikilinkSelection(item.target)"
        >
          <span class="block min-w-0 truncate">{{ item.label }}</span>
        </button>
        <div v-if="!wikilinkResults.length" class="px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400">No matches</div>
      </div>
      </div>
    </div>

    <div
      v-if="mermaidReplaceDialog.visible"
      class="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/45 px-4"
      @click.self="resolveMermaidReplaceDialog(false)"
    >
      <div class="w-full max-w-sm rounded-2xl border border-slate-300/80 bg-white p-4 shadow-xl dark:border-slate-700/80 dark:bg-slate-900">
        <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Replace Mermaid diagram?</h3>
        <p class="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Replace current Mermaid content with template "{{ mermaidReplaceDialog.templateLabel }}"?
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200"
            @click="resolveMermaidReplaceDialog(false)"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-1.5 text-xs font-semibold text-white"
            @click="resolveMermaidReplaceDialog(true)"
          >
            Replace
          </button>
        </div>
      </div>
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
