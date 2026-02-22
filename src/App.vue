<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ComputerDesktopIcon,
  CommandLineIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  StarIcon,
  SunIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline'
import EditorView from './components/EditorView.vue'
import ExplorerTree from './components/explorer/ExplorerTree.vue'
import UiButton from './components/ui/UiButton.vue'
import {
  backlinksForPath,
  createEntry,
  ftsSearch,
  initDb,
  listMarkdownFiles,
  listChildren,
  pathExists,
  readTextFile,
  rebuildWorkspaceIndex,
  renameEntry,
  reindexMarkdownFile,
  readPropertyTypeSchema,
  revealInFileManager,
  selectWorkingFolder,
  updateWikilinksForRename,
  writePropertyTypeSchema,
  writeTextFile
} from './lib/api'
import { useEditorState } from './composables/useEditorState'
import { useFilesystemState } from './composables/useFilesystemState'
import { useWorkspaceState, type SidebarMode } from './composables/useWorkspaceState'

type ThemePreference = 'light' | 'dark' | 'system'
type SearchHit = { path: string; snippet: string; score: number }
type PropertyPreviewRow = { key: string; value: string }

type EditorViewExposed = {
  saveNow: () => Promise<void>
  reloadCurrent: () => Promise<void>
  focusEditor: () => void
  focusFirstContentBlock: () => Promise<void>
  revealSnippet: (snippet: string) => Promise<void>
  revealOutlineHeading: (index: number) => Promise<void>
}

type SaveFileOptions = {
  explicit: boolean
}

type SaveFileResult = {
  persisted: boolean
}

type RenameFromTitleResult = {
  path: string
  title: string
}

type VirtualDoc = {
  content: string
  titleLine: string
}

const THEME_STORAGE_KEY = 'meditor.theme.preference'
const WORKING_FOLDER_STORAGE_KEY = 'meditor.working-folder.path'

const workspace = useWorkspaceState()
const editorState = useEditorState()
const filesystem = useFilesystemState()
const isMacOs = typeof navigator !== 'undefined' && /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform || navigator.userAgent)

const themePreference = ref<ThemePreference>('system')
const searchQuery = ref('')
const searchHits = ref<SearchHit[]>([])
const searchLoading = ref(false)
const hasSearched = ref(false)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let searchRequestToken = 0
const quickOpenVisible = ref(false)
const quickOpenQuery = ref('')
const quickOpenActiveIndex = ref(0)
const leftPaneWidth = ref(300)
const rightPaneWidth = ref(300)
const allWorkspaceFiles = ref<string[]>([])
const loadingAllFiles = ref(false)
const editorRef = ref<EditorViewExposed | null>(null)
const tabScrollRef = ref<HTMLElement | null>(null)
const overflowMenuRef = ref<HTMLElement | null>(null)
const backlinks = ref<string[]>([])
const backlinksLoading = ref(false)
const propertiesPreview = ref<PropertyPreviewRow[]>([])
const propertyParseErrorCount = ref(0)
const virtualDocs = ref<Record<string, VirtualDoc>>({})
const overflowMenuOpen = ref(false)
const wikilinkRewritePrompt = ref<{ fromPath: string; toPath: string } | null>(null)
const newFileModalVisible = ref(false)
const newFilePathInput = ref('')
const newFileModalError = ref('')
const newFolderModalVisible = ref(false)
const newFolderPathInput = ref('')
const newFolderModalError = ref('')
const openDateModalVisible = ref(false)
const openDateInput = ref('')
const openDateModalError = ref('')
const wikilinkRewriteQueue: Array<{
  fromPath: string
  toPath: string
  resolve: (approved: boolean) => void
}> = []
let wikilinkRewriteResolver: ((approved: boolean) => void) | null = null

const resizeState = ref<{
  side: 'left' | 'right'
  startX: number
  startWidth: number
} | null>(null)

const systemPrefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

const resolvedTheme = computed<'light' | 'dark'>(() => {
  if (themePreference.value === 'system') {
    return systemPrefersDark() ? 'dark' : 'light'
  }
  return themePreference.value
})

const tabView = computed(() =>
  workspace.openTabs.value.map((tab) => {
    const status = editorState.getStatus(tab.path)
    const unsavedVirtual = Boolean(virtualDocs.value[tab.path])
    return {
      ...tab,
      title: fileName(tab.path),
      dirty: status.dirty || unsavedVirtual,
      saving: status.saving,
      saveError: status.saveError
    }
  })
)

const activeFilePath = computed(() => workspace.activeTabPath.value)
const activeStatus = computed(() => editorState.getStatus(activeFilePath.value))
const groupedSearchResults = computed(() => {
  const groups: Array<{ path: string; items: SearchHit[] }> = []
  const byPath = new Map<string, SearchHit[]>()
  for (const hit of searchHits.value) {
    if (!byPath.has(hit.path)) {
      byPath.set(hit.path, [])
    }
    byPath.get(hit.path)!.push(hit)
  }
  for (const [path, items] of byPath.entries()) {
    groups.push({ path, items })
  }
  return groups
})

type QuickOpenResult =
  | { kind: 'file'; path: string; label: string }
  | { kind: 'daily'; date: string; path: string; label: string; exists: boolean }

type PaletteAction = {
  id: string
  label: string
  run: () => boolean | Promise<boolean>
}

const paletteActions = computed<PaletteAction[]>(() => [
  { id: 'open-workspace', label: 'Open Workspace', run: () => openWorkspaceFromPalette() },
  { id: 'close-workspace', label: 'Close Workspace', run: () => closeWorkspaceFromPalette() },
  { id: 'theme-light', label: 'Theme: Light', run: () => setThemeFromPalette('light') },
  { id: 'theme-dark', label: 'Theme: Dark', run: () => setThemeFromPalette('dark') },
  { id: 'theme-system', label: 'Theme: System', run: () => setThemeFromPalette('system') },
  { id: 'open-today', label: 'Open Today', run: () => openTodayNote() },
  { id: 'open-yesterday', label: 'Open Yesterday', run: () => openYesterdayNote() },
  { id: 'open-specific-date', label: 'Open Specific Date', run: () => openSpecificDateNote() },
  { id: 'create-new-file', label: 'New Note', run: () => createNewFileFromPalette() },
  { id: 'close-all-tabs', label: 'Close All Tabs', run: () => closeAllTabsFromPalette() },
  { id: 'close-other-tabs', label: 'Close Other Tabs', run: () => closeOtherTabsFromPalette() },
  { id: 'open-file', label: 'Open File', run: () => (quickOpenQuery.value = '', false) },
  { id: 'reveal-in-explorer', label: 'Reveal in Explorer', run: () => revealActiveInExplorer() }
])

const quickOpenIsActionMode = computed(() => quickOpenQuery.value.trimStart().startsWith('>'))
const quickOpenActionQuery = computed(() => quickOpenQuery.value.trimStart().slice(1).trim().toLowerCase())

const quickOpenResults = computed<QuickOpenResult[]>(() => {
  if (quickOpenIsActionMode.value) return []
  const q = quickOpenQuery.value.trim().toLowerCase()
  if (!q) return []

  const fileResults = allWorkspaceFiles.value
    .filter((path) => path.toLowerCase().includes(q) || toRelativePath(path).toLowerCase().includes(q))
    .map((path) => ({ kind: 'file' as const, path, label: toRelativePath(path) }))
    .slice(0, 80)

  if (!isIsoDate(q) || !filesystem.workingFolderPath.value) {
    return fileResults
  }

  const path = dailyNotePath(filesystem.workingFolderPath.value, q)
  const exists = allWorkspaceFiles.value.some((item) => item.toLowerCase() === path.toLowerCase())
  const dateResult: QuickOpenResult = {
    kind: 'daily',
    date: q,
    path,
    exists,
    label: exists ? `Open daily note ${q}` : `Create daily note ${q}`
  }

  return [dateResult, ...fileResults]
})

const quickOpenActionResults = computed(() => {
  if (!quickOpenIsActionMode.value) return []
  const q = quickOpenActionQuery.value
  if (!q) return paletteActions.value
  return paletteActions.value.filter((item) => item.label.toLowerCase().includes(q))
})

const quickOpenItemCount = computed(() =>
  quickOpenIsActionMode.value ? quickOpenActionResults.value.length : quickOpenResults.value.length
)

const metadataRows = computed(() => {
  if (!activeFilePath.value) return []
  const status = activeStatus.value
  const state = status.saving
    ? 'saving'
    : virtualDocs.value[activeFilePath.value]
      ? 'unsaved'
      : status.dirty
        ? 'editing'
        : 'saved'
  return [
    { label: 'Path', value: toRelativePath(activeFilePath.value) },
    { label: 'State', value: state },
    { label: 'Workspace', value: toRelativePath(filesystem.workingFolderPath.value) || filesystem.workingFolderPath.value }
  ]
})

const mediaQuery = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

const WINDOWS_RESERVED_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const FORBIDDEN_FILE_CHARS_RE = /[<>:"/\\|?*\u0000-\u001f]/g
const FORBIDDEN_FILE_NAME_CHARS_RE = /[<>:"\\|?*\u0000-\u001f]/
const MAX_FILE_STEM_LENGTH = 120

function fileName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

function applyTheme() {
  const root = document.documentElement
  root.classList.toggle('dark', resolvedTheme.value === 'dark')
}

function loadThemePreference() {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    themePreference.value = saved
  } else {
    themePreference.value = 'system'
  }
}

function toRelativePath(path: string): string {
  const root = filesystem.workingFolderPath.value
  if (!root) return path
  if (path === root) return '.'
  if (path.startsWith(`${root}/`)) {
    return path.slice(root.length + 1)
  }
  return path
}

function normalizeDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year <= 0 || month < 1 || month > 12 || day < 1 || day > 31) return false
  const value = new Date(year, month - 1, day)
  return value.getFullYear() === year && value.getMonth() + 1 === month && value.getDate() === day
}

function formatIsoDate(date: Date): string {
  return `${date.getFullYear()}-${normalizeDatePart(date.getMonth() + 1)}-${normalizeDatePart(date.getDate())}`
}

function isIsoDate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false
  const [yearRaw, monthRaw, dayRaw] = input.split('-')
  const year = Number.parseInt(yearRaw, 10)
  const month = Number.parseInt(monthRaw, 10)
  const day = Number.parseInt(dayRaw, 10)
  return isValidCalendarDate(year, month, day)
}

function parseIsoDateInput(input: string): string | null {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  if (!isValidCalendarDate(year, month, day)) return null
  return `${year}-${normalizeDatePart(month)}-${normalizeDatePart(day)}`
}

function dailyNotePath(root: string, date: string): string {
  return `${root}/journal/${date}.md`
}

function sanitizeRelativePath(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
}

function normalizeRelativeNotePath(raw: string): string | null {
  const cleaned = raw.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  if (!cleaned) return null

  const stack: string[] = []
  const segments = cleaned.split('/')
  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (stack.length === 0) {
        return null
      }
      stack.pop()
      continue
    }
    stack.push(segment)
  }

  if (!stack.length) return null
  return stack.join('/')
}

function isTitleOnlyContent(content: string, titleLine: string): boolean {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  return normalized === titleLine
}

function onSystemThemeChanged() {
  if (themePreference.value === 'system') {
    applyTheme()
  }
}

function toggleOverflowMenu() {
  overflowMenuOpen.value = !overflowMenuOpen.value
}

function closeOverflowMenu() {
  overflowMenuOpen.value = false
}

function onOverflowMenuPointerDown(event: MouseEvent) {
  if (!overflowMenuOpen.value) return
  const target = event.target as Node | null
  if (!target) return
  if (overflowMenuRef.value?.contains(target)) return
  closeOverflowMenu()
}

function setThemeFromOverflow(next: ThemePreference) {
  themePreference.value = next
  closeOverflowMenu()
}

function setThemeFromPalette(next: ThemePreference) {
  themePreference.value = next
  return true
}

function closeWorkspace() {
  if (!filesystem.hasWorkspace.value) return
  workspace.closeAllTabs()
  editorState.setActiveOutline([])
  searchHits.value = []
  allWorkspaceFiles.value = []
  backlinks.value = []
  backlinksLoading.value = false
  filesystem.selectedCount.value = 0
  filesystem.clearWorkspacePath()
  window.localStorage.removeItem(WORKING_FOLDER_STORAGE_KEY)
  closeOverflowMenu()
}

function beginResize(side: 'left' | 'right', event: MouseEvent) {
  event.preventDefault()
  resizeState.value = {
    side,
    startX: event.clientX,
    startWidth: side === 'left' ? leftPaneWidth.value : rightPaneWidth.value
  }
}

function onPointerMove(event: MouseEvent) {
  if (!resizeState.value) return
  const { side, startWidth, startX } = resizeState.value
  const delta = event.clientX - startX

  if (side === 'left') {
    leftPaneWidth.value = Math.min(520, Math.max(220, startWidth + delta))
    return
  }
  rightPaneWidth.value = Math.min(560, Math.max(220, startWidth - delta))
}

function stopResize() {
  resizeState.value = null
}

async function onSelectWorkingFolder() {
  filesystem.errorMessage.value = ''
  const path = await selectWorkingFolder()
  if (!path) return false
  await loadWorkingFolder(path)
  return true
}

async function loadWorkingFolder(path: string) {
  try {
    filesystem.setWorkspacePath(path)
    filesystem.indexingState.value = 'indexing'
    await initDb(path)
    searchHits.value = []
    allWorkspaceFiles.value = []
    window.localStorage.setItem(WORKING_FOLDER_STORAGE_KEY, path)

    if (workspace.activeTabPath.value && !workspace.activeTabPath.value.startsWith(path)) {
      workspace.closeAllTabs()
      editorState.setActiveOutline([])
    }
  } catch (err) {
    filesystem.clearWorkspacePath()
    workspace.closeAllTabs()
    searchHits.value = []
    window.localStorage.removeItem(WORKING_FOLDER_STORAGE_KEY)
    filesystem.errorMessage.value = err instanceof Error ? err.message : 'Could not open working folder.'
  } finally {
    filesystem.indexingState.value = 'idle'
  }
}

function onExplorerError(message: string) {
  filesystem.errorMessage.value = message
}

function onExplorerSelection(paths: string[]) {
  filesystem.selectedCount.value = paths.length
}

async function ensureActiveTabSavedBeforeSwitch(targetPath: string): Promise<boolean> {
  const target = targetPath.trim()
  const current = workspace.activeTabPath.value
  if (!target || !current || current === target) return true

  const status = editorState.getStatus(current)
  if (!status.dirty) return true

  await editorRef.value?.saveNow()

  const activeAfterSave = workspace.activeTabPath.value || current
  const statusAfterSave = editorState.getStatus(activeAfterSave)
  if (statusAfterSave.dirty) {
    filesystem.errorMessage.value = statusAfterSave.saveError || 'Could not save current note before switching tabs.'
    return false
  }

  return true
}

async function openTabWithAutosave(path: string): Promise<boolean> {
  const target = path.trim()
  if (!target) return false
  const canSwitch = await ensureActiveTabSavedBeforeSwitch(target)
  if (!canSwitch) return false
  workspace.openTab(target)
  return true
}

async function setActiveTabWithAutosave(path: string): Promise<boolean> {
  const target = path.trim()
  if (!target) return false
  const canSwitch = await ensureActiveTabSavedBeforeSwitch(target)
  if (!canSwitch) return false
  workspace.setActiveTab(target)
  return true
}

async function onExplorerOpen(path: string) {
  const opened = await openTabWithAutosave(path)
  if (!opened) return
  await nextTick()
  editorRef.value?.focusEditor()
}

async function openFile(path: string) {
  if (!filesystem.workingFolderPath.value) {
    throw new Error('Working folder is not set.')
  }
  const virtual = virtualDocs.value[path]
  if (virtual) return virtual.content
  return await readTextFile(filesystem.workingFolderPath.value, path)
}

async function ensureParentFolders(filePath: string) {
  const root = filesystem.workingFolderPath.value
  if (!root) throw new Error('Working folder is not set.')

  const relative = toRelativePath(filePath)
  const parts = relative.split('/').filter(Boolean)
  if (parts.length <= 1) return

  let current = root
  for (const segment of parts.slice(0, -1)) {
    const next = `${current}/${segment}`
    const exists = await pathExists(root, next)
    if (!exists) {
      await createEntry(root, current, segment, 'folder', 'fail')
    }
    current = next
  }
}

function noteTitleFromPath(path: string): string {
  const filename = fileName(path).replace(/\.(md|markdown)$/i, '')
  return filename || 'Untitled'
}

function markdownExtensionFromPath(path: string): string {
  const name = fileName(path)
  const match = name.match(/\.(md|markdown)$/i)
  return match ? match[0] : '.md'
}

function sanitizeTitleForFileName(raw: string): string {
  const cleaned = raw
    .replace(FORBIDDEN_FILE_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')

  const base = cleaned.slice(0, MAX_FILE_STEM_LENGTH).trim()
  if (!base) return 'Untitled'
  if (base === '.' || base === '..') return 'Untitled'
  if (WINDOWS_RESERVED_NAME_RE.test(base)) return `${base}-note`
  return base
}

function applyPathRenameLocally(payload: { from: string; to: string }) {
  const fromPath = payload.from
  const toPath = payload.to
  if (!fromPath || !toPath || fromPath === toPath) return

  workspace.replaceTabPath(fromPath, toPath)
  editorState.movePath(fromPath, toPath)

  if (virtualDocs.value[fromPath]) {
    const nextVirtual = { ...virtualDocs.value }
    nextVirtual[toPath] = nextVirtual[fromPath]
    delete nextVirtual[fromPath]
    virtualDocs.value = nextVirtual
  }

  if (allWorkspaceFiles.value.includes(fromPath) || !allWorkspaceFiles.value.includes(toPath)) {
    const moved = allWorkspaceFiles.value
      .map((path) => (path === fromPath ? toPath : path))
      .filter((path, index, source) => source.indexOf(path) === index)
      .sort((a, b) => a.localeCompare(b))
    allWorkspaceFiles.value = moved
  }

  backlinks.value = backlinks.value.map((path) => (path === fromPath ? toPath : path))
}

function openNextWikilinkRewritePrompt() {
  if (wikilinkRewritePrompt.value || wikilinkRewriteQueue.length === 0) return
  const next = wikilinkRewriteQueue.shift()
  if (!next) return
  wikilinkRewritePrompt.value = {
    fromPath: next.fromPath,
    toPath: next.toPath
  }
  wikilinkRewriteResolver = next.resolve
}

function promptWikilinkRewritePermission(fromPath: string, toPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    wikilinkRewriteQueue.push({
      fromPath,
      toPath,
      resolve
    })
    openNextWikilinkRewritePrompt()
  })
}

function resolveWikilinkRewritePrompt(approved: boolean) {
  const resolve = wikilinkRewriteResolver
  wikilinkRewriteResolver = null
  wikilinkRewritePrompt.value = null
  resolve?.(approved)
  openNextWikilinkRewritePrompt()
}

function clearWikilinkRewritePromptQueue() {
  if (wikilinkRewriteResolver) {
    wikilinkRewriteResolver(false)
    wikilinkRewriteResolver = null
  }
  wikilinkRewritePrompt.value = null
  while (wikilinkRewriteQueue.length) {
    const pending = wikilinkRewriteQueue.shift()
    pending?.resolve(false)
  }
}

async function maybeRewriteWikilinksForRename(fromPath: string, toPath: string) {
  const root = filesystem.workingFolderPath.value
  if (!root || fromPath === toPath) return
  const shouldRewrite = await promptWikilinkRewritePermission(fromPath, toPath)
  if (!shouldRewrite) return
  filesystem.indexingState.value = 'indexing'
  try {
    await updateWikilinksForRename(root, fromPath, toPath)
    await refreshBacklinks()
  } catch (err) {
    filesystem.errorMessage.value = err instanceof Error ? err.message : 'Could not update wikilinks.'
  } finally {
    filesystem.indexingState.value = 'idle'
  }
}

function onEditorPathRenamed(payload: { from: string; to: string; manual: boolean }) {
  applyPathRenameLocally(payload)
  void maybeRewriteWikilinksForRename(payload.from, payload.to)
}

function onExplorerPathRenamed(payload: { from: string; to: string }) {
  applyPathRenameLocally(payload)
  void maybeRewriteWikilinksForRename(payload.from, payload.to)
}

async function renameFileFromTitle(path: string, rawTitle: string): Promise<RenameFromTitleResult> {
  const root = filesystem.workingFolderPath.value
  if (!root) {
    throw new Error('Working folder is not set.')
  }

  const normalizedTitle = sanitizeTitleForFileName(rawTitle)
  const ext = markdownExtensionFromPath(path)
  const nextName = `${normalizedTitle}${ext}`

  if (fileName(path) === nextName) {
    return { path, title: normalizedTitle }
  }

  const exists = await pathExists(root, path)
  if (!exists) {
    const parent = path.replace(/\\/g, '/').replace(/\/[^/]+$/, '')
    let candidate = `${parent}/${nextName}`
    let idx = 1
    while (await pathExists(root, candidate)) {
      const alt = `${normalizedTitle} (${idx})${ext}`
      candidate = `${parent}/${alt}`
      idx += 1
      if (idx > 9_999) {
        throw new Error('Could not choose a unique filename.')
      }
    }
    return {
      path: candidate,
      title: noteTitleFromPath(candidate)
    }
  }

  const renamedPath = await renameEntry(root, path, nextName, 'rename')
  return {
    path: renamedPath,
    title: noteTitleFromPath(renamedPath)
  }
}

async function ensureVirtualMarkdown(path: string, titleLine: string) {
  if (virtualDocs.value[path]) return
  virtualDocs.value = {
    ...virtualDocs.value,
    [path]: {
      content: titleLine ? `${titleLine}\n` : '',
      titleLine
    }
  }
}

async function openOrPrepareMarkdown(path: string, titleLine: string) {
  const root = filesystem.workingFolderPath.value
  if (!root) {
    filesystem.errorMessage.value = 'Working folder is not set.'
    return false
  }

  let exists = false
  try {
    exists = await pathExists(root, path)
  } catch {
    // If parent folders do not exist yet (for example journal/), treat as non-existent
    // and open a virtual buffer. Folder creation is deferred until first write.
    exists = false
  }
  if (exists) {
    const nextVirtual = { ...virtualDocs.value }
    delete nextVirtual[path]
    virtualDocs.value = nextVirtual
    const opened = await openTabWithAutosave(path)
    if (!opened) return false
    await nextTick()
    editorRef.value?.focusEditor()
    return true
  }

  await ensureVirtualMarkdown(path, titleLine)
  const opened = await openTabWithAutosave(path)
  if (!opened) return false
  await nextTick()
  editorRef.value?.focusEditor()
  return true
}

async function saveFile(path: string, txt: string, options: SaveFileOptions): Promise<SaveFileResult> {
  if (!filesystem.workingFolderPath.value) {
    throw new Error('Working folder is not set.')
  }
  const virtual = virtualDocs.value[path]
  if (virtual && !options.explicit && isTitleOnlyContent(txt, virtual.titleLine)) {
    return { persisted: false }
  }

  await ensureParentFolders(path)
  await writeTextFile(filesystem.workingFolderPath.value, path, txt)

  if (virtual) {
    const nextVirtual = { ...virtualDocs.value }
    delete nextVirtual[path]
    virtualDocs.value = nextVirtual
  }

  if (/\.(md|markdown)$/i.test(path) && !allWorkspaceFiles.value.includes(path)) {
    allWorkspaceFiles.value = [...allWorkspaceFiles.value, path].sort((a, b) => a.localeCompare(b))
  }

  filesystem.indexingState.value = 'indexing'
  try {
    await reindexMarkdownFile(filesystem.workingFolderPath.value, path)
  } finally {
    filesystem.indexingState.value = 'idle'
  }
  await refreshBacklinks()
  return { persisted: true }
}

async function runGlobalSearch() {
  const q = searchQuery.value.trim()
  if (!q || !filesystem.workingFolderPath.value) {
    hasSearched.value = false
    searchHits.value = []
    return
  }

  const requestToken = ++searchRequestToken
  hasSearched.value = true
  filesystem.errorMessage.value = ''
  searchLoading.value = true
  try {
    if (!allWorkspaceFiles.value.length) {
      await loadAllFiles()
    }
    const ftsHits = await ftsSearch(filesystem.workingFolderPath.value, q)
    const qLower = q.toLowerCase()
    const filenameHits = allWorkspaceFiles.value
      .filter((path) => toRelativePath(path).toLowerCase().includes(qLower))
      .map((path) => ({
        path,
        snippet: `filename: <b>${toRelativePath(path)}</b>`,
        score: 0
      }))

    const merged = [...filenameHits, ...ftsHits]
    const dedupe = new Set<string>()
    const deduped = merged.filter((hit) => {
      const key = `${hit.path}::${hit.snippet}`
      if (dedupe.has(key)) return false
      dedupe.add(key)
      return true
    })
    if (requestToken === searchRequestToken) {
      searchHits.value = deduped
    }
  } catch (err) {
    if (requestToken === searchRequestToken) {
      filesystem.errorMessage.value = err instanceof Error ? err.message : 'Search failed.'
    }
  } finally {
    if (requestToken === searchRequestToken) {
      searchLoading.value = false
    }
  }
}

async function onSearchResultOpen(hit: SearchHit) {
  const opened = await openTabWithAutosave(hit.path)
  if (!opened) return
  editorState.setRevealSnippet(hit.path, hit.snippet)

  await nextTick()
  await editorRef.value?.revealSnippet(hit.snippet)
}

function onTabClick(path: string) {
  void setActiveTabWithAutosave(path)
}

async function openNextTabWithAutosave() {
  const tabs = workspace.openTabs.value
  if (!tabs.length) return
  const currentIndex = workspace.activeTabIndex.value
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % tabs.length
  const nextPath = tabs[nextIndex]?.path
  if (!nextPath) return
  await setActiveTabWithAutosave(nextPath)
}

async function onBacklinkOpen(path: string) {
  const opened = await openTabWithAutosave(path)
  if (!opened) return
  await nextTick()
  editorRef.value?.focusEditor()
}

function onTabAuxClick(event: MouseEvent, path: string) {
  if (event.button !== 1) return
  event.preventDefault()
  workspace.closeTab(path)
}

function onTabClose(path: string) {
  workspace.closeTab(path)
  editorState.clearStatus(path)
}

function onTabDragStart(index: number, event: DragEvent) {
  event.dataTransfer?.setData('text/tab-index', String(index))
  event.dataTransfer!.effectAllowed = 'move'
}

function onTabDrop(index: number, event: DragEvent) {
  const raw = event.dataTransfer?.getData('text/tab-index')
  if (!raw) return
  const from = Number.parseInt(raw, 10)
  if (Number.isNaN(from)) return
  workspace.moveTab(from, index)
}

function scrollActiveTabIntoView() {
  const container = tabScrollRef.value
  if (!container) return
  const activeTab = container.querySelector<HTMLElement>('.tab-item.active')
  activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
}

function onEditorStatus(payload: { path: string; dirty: boolean; saving: boolean; saveError: string }) {
  editorState.updateStatus(payload.path, {
    dirty: payload.dirty,
    saving: payload.saving,
    saveError: payload.saveError
  })
}

function onEditorOutline(payload: Array<{ level: 1 | 2 | 3; text: string }>) {
  editorState.setActiveOutline(payload)
}

function onEditorProperties(payload: { path: string; items: PropertyPreviewRow[]; parseErrorCount: number }) {
  if (!activeFilePath.value || payload.path !== activeFilePath.value) {
    if (!payload.path) {
      propertiesPreview.value = []
      propertyParseErrorCount.value = 0
    }
    return
  }
  propertiesPreview.value = payload.items
  propertyParseErrorCount.value = payload.parseErrorCount
}

async function onOutlineHeadingClick(index: number) {
  await editorRef.value?.revealOutlineHeading(index)
}

function setSidebarMode(mode: SidebarMode) {
  if (workspace.sidebarMode.value === mode) {
    workspace.toggleSidebar()
    return
  }
  workspace.setSidebarMode(mode)
}

function openSearchPanel() {
  closeOverflowMenu()
  workspace.setSidebarMode('search')
  nextTick(() => {
    document.querySelector<HTMLInputElement>('[data-search-input=\"true\"]')?.focus()
  })
}

async function refreshBacklinks() {
  const root = filesystem.workingFolderPath.value
  const path = workspace.activeTabPath.value
  if (!root || !path) {
    backlinks.value = []
    return
  }

  backlinksLoading.value = true
  try {
    const results = await backlinksForPath(root, path)
    backlinks.value = results.map((item) => item.path)
  } catch {
    backlinks.value = []
  } finally {
    backlinksLoading.value = false
  }
}

async function openDailyNote(date: string) {
  const root = filesystem.workingFolderPath.value
  if (!root) {
    filesystem.errorMessage.value = 'Working folder is not set.'
    return false
  }
  if (!isIsoDate(date)) {
    filesystem.errorMessage.value = 'Invalid date format. Use YYYY-MM-DD.'
    return false
  }
  const path = dailyNotePath(root, date)
  let exists = false
  try {
    exists = await pathExists(root, path)
  } catch {
    exists = false
  }

  if (!exists) {
    await ensureParentFolders(path)
    await writeTextFile(root, path, '')
    if (!allWorkspaceFiles.value.includes(path)) {
      allWorkspaceFiles.value = [...allWorkspaceFiles.value, path].sort((a, b) => a.localeCompare(b))
    }
  }

  return await openTabWithAutosave(path)
}

async function openTodayNote() {
  return await openDailyNote(formatIsoDate(new Date()))
}

async function openYesterdayNote() {
  const value = new Date()
  value.setDate(value.getDate() - 1)
  return await openDailyNote(formatIsoDate(value))
}

async function openSpecificDateNote() {
  openDateInput.value = formatIsoDate(new Date())
  openDateModalError.value = ''
  openDateModalVisible.value = true
  await nextTick()
  document.querySelector<HTMLInputElement>('[data-open-date-input=\"true\"]')?.focus()
  return true
}

function closeOpenDateModal() {
  openDateModalVisible.value = false
  openDateInput.value = ''
  openDateModalError.value = ''
}

async function submitOpenDateFromModal() {
  const isoDate = parseIsoDateInput(openDateInput.value.trim())
  if (!isoDate) {
    openDateModalError.value = 'Invalid date. Use YYYY-MM-DD (example: 2026-02-22).'
    return false
  }
  const opened = await openDailyNote(isoDate)
  if (!opened) return false
  closeOpenDateModal()
  return true
}

async function revealActiveInExplorer() {
  if (!workspace.activeTabPath.value) return false
  try {
    await revealInFileManager(workspace.activeTabPath.value)
    return true
  } catch (err) {
    filesystem.errorMessage.value = err instanceof Error ? err.message : 'Could not reveal file.'
    return false
  }
}

async function openWikilinkTarget(target: string) {
  const root = filesystem.workingFolderPath.value
  if (!root) return false
  const normalized = sanitizeRelativePath(target)
  if (!normalized) return false
  if (normalized.split('/').some((segment) => segment === '.' || segment === '..')) {
    filesystem.errorMessage.value = 'Invalid link target.'
    return false
  }

  if (isIsoDate(normalized)) {
    return await openDailyNote(normalized)
  }

  const markdownFiles = await loadWikilinkTargets()

  const withoutExtension = normalized.replace(/\.(md|markdown)$/i, '').toLowerCase()
  const existing = markdownFiles.find((path) => {
    const rel = path.replace(/\.(md|markdown)$/i, '').toLowerCase()
    return rel === withoutExtension
  })

  if (existing) {
    const opened = await openTabWithAutosave(`${root}/${existing}`)
    if (!opened) return false
    await nextTick()
    editorRef.value?.focusEditor()
    return true
  }

  const withExtension = /\.(md|markdown)$/i.test(normalized) ? normalized : `${normalized}.md`
  const fullPath = `${root}/${withExtension}`
  return await openOrPrepareMarkdown(fullPath, '')
}

async function loadWikilinkTargets(): Promise<string[]> {
  const root = filesystem.workingFolderPath.value
  if (!root) return []
  try {
    return await listMarkdownFiles(root)
  } catch (err) {
    filesystem.errorMessage.value = err instanceof Error ? err.message : 'Could not load wikilink targets.'
    return []
  }
}

async function loadPropertyTypeSchema(): Promise<Record<string, string>> {
  const root = filesystem.workingFolderPath.value
  if (!root) return {}
  try {
    return await readPropertyTypeSchema(root)
  } catch (err) {
    filesystem.errorMessage.value = err instanceof Error ? err.message : 'Could not load property types.'
    return {}
  }
}

async function savePropertyTypeSchema(schema: Record<string, string>): Promise<void> {
  const root = filesystem.workingFolderPath.value
  if (!root) return
  await writePropertyTypeSchema(root, schema)
}

async function loadAllFiles() {
  if (!filesystem.workingFolderPath.value || loadingAllFiles.value) return
  loadingAllFiles.value = true

  try {
    const files: string[] = []
    const queue: string[] = [filesystem.workingFolderPath.value]

    while (queue.length > 0) {
      const dir = queue.shift()!
      const children = await listChildren(filesystem.workingFolderPath.value, dir)
      for (const child of children) {
        if (child.is_dir) {
          queue.push(child.path)
          continue
        }
        if (child.is_markdown) {
          files.push(child.path)
        }
      }
    }

    allWorkspaceFiles.value = files.sort((a, b) => a.localeCompare(b))
  } catch (err) {
    filesystem.errorMessage.value = err instanceof Error ? err.message : 'Could not load file list.'
  } finally {
    loadingAllFiles.value = false
  }
}

async function openQuickOpen(initialQuery = '') {
  quickOpenVisible.value = true
  quickOpenQuery.value = initialQuery
  quickOpenActiveIndex.value = 0
  if (!allWorkspaceFiles.value.length) {
    await loadAllFiles()
  }
  await nextTick()
  document.querySelector<HTMLInputElement>('[data-quick-open-input=\"true\"]')?.focus()
}

function closeQuickOpen() {
  quickOpenVisible.value = false
  quickOpenQuery.value = ''
  quickOpenActiveIndex.value = 0
}

async function openQuickResult(item: QuickOpenResult) {
  if (item.kind === 'file') {
    const opened = await openTabWithAutosave(item.path)
    if (!opened) return
    closeQuickOpen()
    nextTick(() => editorRef.value?.focusEditor())
    return
  }
  void openDailyNote(item.date).then((opened) => {
    if (opened) closeQuickOpen()
  })
}

function openCommandPalette() {
  closeOverflowMenu()
  void openQuickOpen('>')
}

async function runQuickOpenAction(id: string) {
  const action = quickOpenActionResults.value.find((item) => item.id === id)
  if (!action) return
  const shouldClose = await action.run()
  if (!shouldClose) return
  closeQuickOpen()
  nextTick(() => {
    if (!newFileModalVisible.value && !newFolderModalVisible.value && !openDateModalVisible.value) {
      editorRef.value?.focusEditor()
    }
  })
}

async function createNewFileFromPalette() {
  const prefill = await suggestedNotePathPrefix()
  await openNewFileModal(prefill)
  return true
}

function closeNewFileModal() {
  newFileModalVisible.value = false
  newFilePathInput.value = ''
  newFileModalError.value = ''
}

async function openNewFileModal(prefill = '') {
  newFilePathInput.value = prefill
  newFileModalError.value = ''
  newFileModalVisible.value = true
  await nextTick()
  document.querySelector<HTMLInputElement>('[data-new-file-input=\"true\"]')?.focus()
}

function closeNewFolderModal() {
  newFolderModalVisible.value = false
  newFolderPathInput.value = ''
  newFolderModalError.value = ''
}

async function openNewFolderModal(prefill = '') {
  newFolderPathInput.value = prefill
  newFolderModalError.value = ''
  newFolderModalVisible.value = true
  await nextTick()
  document.querySelector<HTMLInputElement>('[data-new-folder-input=\"true\"]')?.focus()
}

function parentPrefixForModal(parentPath: string): string {
  const root = filesystem.workingFolderPath.value
  if (!root) return ''
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedParent = parentPath.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalizedParent || normalizedParent === normalizedRoot) return ''
  if (!normalizedParent.startsWith(`${normalizedRoot}/`)) return ''
  const relative = normalizedParent.slice(normalizedRoot.length + 1)
  return relative ? `${relative}/` : ''
}

async function suggestedNotePathPrefix(): Promise<string> {
  const root = filesystem.workingFolderPath.value
  if (!root) return ''

  try {
    const rootChildren = await listChildren(root, root)
    if (rootChildren.some((entry) => entry.is_dir && entry.name.toLowerCase() === 'notes')) {
      return 'notes/'
    }
  } catch {
    // Fall back to active path below.
  }

  const activePath = workspace.activeTabPath.value
  if (!activePath) return ''
  return parentPrefixForModal(activePath.replace(/\/[^/]+$/, ''))
}

async function ensureParentDirectoriesForRelativePath(relativePath: string): Promise<string> {
  const root = filesystem.workingFolderPath.value
  if (!root) {
    throw new Error('Working folder is not set.')
  }

  const parts = relativePath.split('/').filter(Boolean)
  if (parts.length <= 1) return root

  let current = root
  for (const segment of parts.slice(0, -1)) {
    const next = `${current}/${segment}`
    const exists = await pathExists(root, next)
    if (!exists) {
      await createEntry(root, current, segment, 'folder', 'fail')
    }
    current = next
  }

  return current
}

function onExplorerRequestCreate(payload: { parentPath: string; entryKind: 'file' | 'folder' }) {
  const prefill = parentPrefixForModal(payload.parentPath)
  if (payload.entryKind === 'folder') {
    void openNewFolderModal(prefill)
    return
  }
  void openNewFileModal(prefill)
}

async function submitNewFileFromModal() {
  const root = filesystem.workingFolderPath.value
  if (!root) {
    newFileModalError.value = 'Working folder is not set.'
    return false
  }

  const normalized = normalizeRelativeNotePath(newFilePathInput.value)
  if (!normalized || normalized.endsWith('/')) {
    newFileModalError.value = 'Invalid file path.'
    return false
  }
  if (normalized.startsWith('../') || normalized === '..') {
    newFileModalError.value = 'Path must stay inside the workspace.'
    return false
  }

  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => FORBIDDEN_FILE_NAME_CHARS_RE.test(part))) {
    newFileModalError.value = 'File names cannot include < > : " \\ | ? *'
    return false
  }

  const rawName = parts[parts.length - 1]
  const stem = rawName.replace(/\.(md|markdown)$/i, '')
  if (!stem) {
    newFileModalError.value = 'File name is required.'
    return false
  }
  if (WINDOWS_RESERVED_NAME_RE.test(stem)) {
    newFileModalError.value = 'That file name is reserved by the OS.'
    return false
  }
  const name = /\.(md|markdown)$/i.test(rawName) ? rawName : `${rawName}.md`
  const relativeWithExt = parts.length > 1
    ? `${parts.slice(0, -1).join('/')}/${name}`
    : name
  const fullPath = `${root}/${relativeWithExt}`
  const parentPath = parts.length > 1 ? `${root}/${parts.slice(0, -1).join('/')}` : root

  try {
    await ensureParentFolders(fullPath)
    const created = await createEntry(root, parentPath, name, 'file', 'fail')
    const opened = await openTabWithAutosave(created)
    if (!opened) return false
    if (/\.(md|markdown)$/i.test(created) && !allWorkspaceFiles.value.includes(created)) {
      allWorkspaceFiles.value = [...allWorkspaceFiles.value, created].sort((a, b) => a.localeCompare(b))
    }
    closeNewFileModal()
    return true
  } catch (err) {
    newFileModalError.value = err instanceof Error ? err.message : 'Could not create file.'
    return false
  }
}

async function submitNewFolderFromModal() {
  const root = filesystem.workingFolderPath.value
  if (!root) {
    newFolderModalError.value = 'Working folder is not set.'
    return false
  }

  const normalized = normalizeRelativeNotePath(newFolderPathInput.value)
  if (!normalized || normalized.endsWith('/')) {
    newFolderModalError.value = 'Invalid folder path.'
    return false
  }
  if (normalized.startsWith('../') || normalized === '..') {
    newFolderModalError.value = 'Path must stay inside the workspace.'
    return false
  }

  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => FORBIDDEN_FILE_NAME_CHARS_RE.test(part))) {
    newFolderModalError.value = 'Folder names cannot include < > : " \\ | ? *'
    return false
  }

  const name = parts[parts.length - 1]
  if (!name) {
    newFolderModalError.value = 'Folder name is required.'
    return false
  }
  if (WINDOWS_RESERVED_NAME_RE.test(name)) {
    newFolderModalError.value = 'That folder name is reserved by the OS.'
    return false
  }

  try {
    const parentPath = await ensureParentDirectoriesForRelativePath(normalized)
    await createEntry(root, parentPath, name, 'folder', 'fail')
    closeNewFolderModal()
    return true
  } catch (err) {
    newFolderModalError.value = err instanceof Error ? err.message : 'Could not create folder.'
    return false
  }
}

function closeAllTabsFromPalette() {
  workspace.closeAllTabs()
  editorState.setActiveOutline([])
  return true
}

async function openWorkspaceFromPalette() {
  return await onSelectWorkingFolder()
}

function closeWorkspaceFromPalette() {
  if (!filesystem.hasWorkspace.value) return false
  closeWorkspace()
  return true
}

async function rebuildIndexFromOverflow() {
  const root = filesystem.workingFolderPath.value
  if (!root) return
  closeOverflowMenu()
  filesystem.indexingState.value = 'indexing'
  try {
    const result = await rebuildWorkspaceIndex(root)
    await loadAllFiles()
    await refreshBacklinks()
    filesystem.notifySuccess(`Index rebuilt (${result.indexed_files} file${result.indexed_files === 1 ? '' : 's'}).`)
  } catch (err) {
    filesystem.notifyError(err instanceof Error ? err.message : 'Could not rebuild index.')
  } finally {
    filesystem.indexingState.value = 'idle'
  }
}

function closeOtherTabsFromPalette() {
  const active = workspace.activeTabPath.value
  if (!active) return false
  workspace.closeOtherTabs(active)
  return true
}

function onQuickOpenEnter() {
  if (quickOpenIsActionMode.value) {
    const action = quickOpenActionResults.value[quickOpenActiveIndex.value]
    if (action) {
      void runQuickOpenAction(action.id)
    }
    return
  }

  const item = quickOpenResults.value[quickOpenActiveIndex.value]
  if (item) {
    void openQuickResult(item)
  }
}

function onQuickOpenInputKeydown(event: KeyboardEvent) {
  if (event.metaKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    // Keep native caret/selection behavior in the input, but prevent app-level handlers.
    event.stopPropagation()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    moveQuickOpenSelection(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    moveQuickOpenSelection(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    onQuickOpenEnter()
  }
}

function onOpenDateInputKeydown(event: KeyboardEvent) {
  if (event.metaKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.stopPropagation()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeOpenDateModal()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    void submitOpenDateFromModal()
  }
}

function onNewFileInputKeydown(event: KeyboardEvent) {
  if (event.metaKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.stopPropagation()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeNewFileModal()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    void submitNewFileFromModal()
  }
}

function onNewFolderInputKeydown(event: KeyboardEvent) {
  if (event.metaKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.stopPropagation()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeNewFolderModal()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    void submitNewFolderFromModal()
  }
}

function moveQuickOpenSelection(delta: number) {
  const count = quickOpenItemCount.value
  if (!count) return
  quickOpenActiveIndex.value = (quickOpenActiveIndex.value + delta + count) % count
}

function setQuickOpenActiveIndex(index: number) {
  quickOpenActiveIndex.value = index
}

async function saveActiveTab() {
  await editorRef.value?.saveNow()
}

function onWindowKeydown(event: KeyboardEvent) {
  const isEscape = event.key === 'Escape' || event.key === 'Esc' || event.code === 'Escape'
  if (isEscape && wikilinkRewritePrompt.value) {
    event.preventDefault()
    event.stopPropagation()
    resolveWikilinkRewritePrompt(false)
    return
  }
  if (isEscape && newFileModalVisible.value) {
    event.preventDefault()
    event.stopPropagation()
    closeNewFileModal()
    return
  }
  if (isEscape && newFolderModalVisible.value) {
    event.preventDefault()
    event.stopPropagation()
    closeNewFolderModal()
    return
  }
  if (isEscape && openDateModalVisible.value) {
    event.preventDefault()
    event.stopPropagation()
    closeOpenDateModal()
    return
  }

  if (quickOpenVisible.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      moveQuickOpenSelection(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      moveQuickOpenSelection(-1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      onQuickOpenEnter()
      return
    }
  }

  if (isEscape) {
    if (overflowMenuOpen.value) {
      event.preventDefault()
      event.stopPropagation()
      closeOverflowMenu()
      return
    }
    if (quickOpenVisible.value) {
      event.preventDefault()
      event.stopPropagation()
      closeQuickOpen()
      return
    }
  }

  const isMod = event.metaKey || event.ctrlKey
  if (!isMod) return

  const key = event.key.toLowerCase()

  if (key === 'p' && !event.shiftKey) {
    event.preventDefault()
    void openQuickOpen()
    return
  }

  if (key === 'p' && event.shiftKey) {
    event.preventDefault()
    openCommandPalette()
    return
  }

  if (key === 'd') {
    event.preventDefault()
    void openTodayNote()
    return
  }

  if (key === 'w') {
    event.preventDefault()
    workspace.closeCurrentTab()
    return
  }

  if (key === 'tab') {
    event.preventDefault()
    void openNextTabWithAutosave()
    return
  }

  if (key === 'f' && event.shiftKey) {
    event.preventDefault()
    openSearchPanel()
    return
  }

  if (key === 'e') {
    event.preventDefault()
    workspace.setSidebarMode('explorer')
    return
  }

  if (key === 'b') {
    event.preventDefault()
    workspace.toggleSidebar()
    return
  }

  if (key === 'j') {
    event.preventDefault()
    workspace.toggleRightPane()
    return
  }

  if (key === 's') {
    event.preventDefault()
    void saveActiveTab()
    return
  }

  if (key === 'k') {
    event.preventDefault()
    openCommandPalette()
  }
}

watch(themePreference, (next) => {
  window.localStorage.setItem(THEME_STORAGE_KEY, next)
  applyTheme()
})

watch(quickOpenQuery, () => {
  quickOpenActiveIndex.value = 0
})

watch(searchQuery, (next) => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
  if (!next.trim() || !filesystem.workingFolderPath.value) {
    searchRequestToken += 1
    hasSearched.value = false
    searchLoading.value = false
    searchHits.value = []
    return
  }
  searchDebounceTimer = setTimeout(() => {
    void runGlobalSearch()
  }, 180)
})

watch(newFilePathInput, () => {
  if (newFileModalError.value) {
    newFileModalError.value = ''
  }
})

watch(newFolderPathInput, () => {
  if (newFolderModalError.value) {
    newFolderModalError.value = ''
  }
})

watch(openDateInput, () => {
  if (openDateModalError.value) {
    openDateModalError.value = ''
  }
})

watch(quickOpenItemCount, (count) => {
  if (count <= 0) {
    quickOpenActiveIndex.value = 0
    return
  }
  if (quickOpenActiveIndex.value >= count) {
    quickOpenActiveIndex.value = count - 1
  }
})

watch(
  () => filesystem.workingFolderPath.value,
  () => {
    allWorkspaceFiles.value = []
    backlinks.value = []
    virtualDocs.value = {}
  }
)

watch(
  () => workspace.activeTabPath.value,
  async () => {
    await nextTick()
    scrollActiveTabIntoView()
  }
)

watch(
  () => tabView.value.length,
  async () => {
    await nextTick()
    scrollActiveTabIntoView()
  }
)

watch(
  () => workspace.activeTabPath.value,
  async (path) => {
    if (!path) {
      editorState.setActiveOutline([])
      return
    }

    const snippet = editorState.consumeRevealSnippet(path)
    if (!snippet) return

    await nextTick()
    await editorRef.value?.revealSnippet(snippet)
    await refreshBacklinks()
  }
)

watch(
  () => workspace.activeTabPath.value,
  () => {
    void refreshBacklinks()
  }
)

onMounted(() => {
  loadThemePreference()
  applyTheme()
  mediaQuery?.addEventListener('change', onSystemThemeChanged)
  window.addEventListener('keydown', onWindowKeydown, true)
  window.addEventListener('mousedown', onOverflowMenuPointerDown, true)
  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('mouseup', stopResize)

  const savedFolder = window.localStorage.getItem(WORKING_FOLDER_STORAGE_KEY)
  if (savedFolder) {
    void loadWorkingFolder(savedFolder)
  }

  void nextTick(() => {
    scrollActiveTabIntoView()
  })
})

onBeforeUnmount(() => {
  clearWikilinkRewritePromptQueue()
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
  mediaQuery?.removeEventListener('change', onSystemThemeChanged)
  window.removeEventListener('keydown', onWindowKeydown, true)
  window.removeEventListener('mousedown', onOverflowMenuPointerDown, true)
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('mouseup', stopResize)
})
</script>

<template>
  <div class="ide-root" :class="{ dark: resolvedTheme === 'dark', 'macos-overlay': isMacOs }">
    <div class="body-row">
      <aside class="activity-bar">
        <button
          class="activity-btn"
          :class="{ active: workspace.sidebarMode.value === 'explorer' && workspace.sidebarVisible.value }"
          type="button"
          title="Explorer"
          aria-label="Explorer"
          @click="setSidebarMode('explorer')"
        >
          <FolderIcon class="activity-btn-icon" />
        </button>
        <button
          class="activity-btn"
          :class="{ active: workspace.sidebarMode.value === 'search' && workspace.sidebarVisible.value }"
          type="button"
          title="Search"
          aria-label="Search"
          @click="setSidebarMode('search')"
        >
          <MagnifyingGlassIcon class="activity-btn-icon" />
        </button>
        <button
          class="activity-btn"
          :class="{ active: workspace.sidebarMode.value === 'backlinks' && workspace.sidebarVisible.value }"
          type="button"
          title="Backlinks"
          aria-label="Backlinks"
          @click="setSidebarMode('backlinks')"
        >
          <LinkIcon class="activity-btn-icon" />
        </button>
        <button
          class="activity-btn"
          :class="{ active: workspace.sidebarMode.value === 'favorites' && workspace.sidebarVisible.value }"
          type="button"
          title="Favorites"
          aria-label="Favorites"
          @click="setSidebarMode('favorites')"
        >
          <StarIcon class="activity-btn-icon" />
        </button>
      </aside>

      <aside
        v-if="workspace.sidebarVisible.value"
        class="left-sidebar"
        :style="{ width: `${leftPaneWidth}px` }"
      >
        <div class="panel-header">
          <h2 class="panel-title">{{ workspace.sidebarMode.value }}</h2>
        </div>

        <div class="panel-body">
          <div v-if="workspace.sidebarMode.value === 'explorer'" class="panel-fill">
            <ExplorerTree
              v-if="filesystem.hasWorkspace.value"
              :folder-path="filesystem.workingFolderPath.value"
              :active-path="activeFilePath"
              @open="onExplorerOpen"
              @path-renamed="onExplorerPathRenamed"
              @request-create="onExplorerRequestCreate"
              @select="onExplorerSelection"
              @error="onExplorerError"
            />
            <div v-else class="placeholder empty-explorer">
              <span>No workspace selected.</span>
              <button type="button" class="inline-link-btn" @click="onSelectWorkingFolder">Open folder</button>
            </div>
          </div>

          <div v-else-if="workspace.sidebarMode.value === 'search'" class="panel-fill search-panel">
            <div class="search-controls">
              <input
                v-model="searchQuery"
                data-search-input="true"
                :disabled="!filesystem.hasWorkspace.value"
                class="tool-input"
                placeholder="Search content (e.g. tags:dev has:deadline deadline>=2026-03-01)"
                @keydown.enter.prevent="runGlobalSearch"
              />
            </div>

            <div class="results-list">
              <div v-if="hasSearched && !searchLoading && !searchHits.length" class="placeholder">No results</div>
              <section v-for="group in groupedSearchResults" :key="group.path" class="result-group">
                <h3 class="result-file">{{ toRelativePath(group.path) }}</h3>
                <button
                  v-for="item in group.items"
                  :key="`${group.path}-${item.score}-${item.snippet}`"
                  type="button"
                  class="result-item"
                  @click="onSearchResultOpen(item)"
                >
                  <div class="result-snippet" v-html="item.snippet"></div>
                </button>
              </section>
            </div>
          </div>

          <div v-else class="placeholder">Coming soon</div>
        </div>
      </aside>

      <section class="workspace-column">
        <header class="topbar">
          <div class="tabs-row">
            <div ref="tabScrollRef" class="tab-scroll">
              <div
                v-for="(tab, index) in tabView"
                :key="tab.path"
                role="button"
                tabindex="0"
                class="tab-item"
                :class="{ active: activeFilePath === tab.path }"
                draggable="true"
                @click="onTabClick(tab.path)"
                @auxclick="onTabAuxClick($event, tab.path)"
                @keydown.enter.prevent="onTabClick(tab.path)"
                @keydown.space.prevent="onTabClick(tab.path)"
                @dragstart="onTabDragStart(index, $event)"
                @dragover.prevent
                @drop="onTabDrop(index, $event)"
              >
                <span class="tab-name">{{ tab.title }}</span>
                <span v-if="tab.saving" class="tab-state" title="Saving">~</span>
                <span v-else-if="tab.dirty" class="tab-state" title="Unsaved">•</span>
                <button class="tab-close" type="button" @click.stop="onTabClose(tab.path)">
                  <XMarkIcon />
                </button>
              </div>
              <div v-if="!tabView.length" class="tab-empty">No open files</div>
            </div>
          </div>

          <div class="global-actions">
            <button
              type="button"
              class="toolbar-icon-btn"
              :class="{ active: workspace.rightPaneVisible.value }"
              :title="workspace.rightPaneVisible.value ? 'Hide right pane' : 'Show right pane'"
              :aria-label="workspace.rightPaneVisible.value ? 'Hide right pane' : 'Show right pane'"
              @click="workspace.toggleRightPane()"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" ry="1.5" />
                <line x1="10" y1="2.5" x2="10" y2="13.5" />
              </svg>
            </button>
            <div ref="overflowMenuRef" class="overflow-wrap">
              <button
                type="button"
                class="toolbar-icon-btn"
                title="View options"
                aria-label="View options"
                :aria-expanded="overflowMenuOpen"
                @click="toggleOverflowMenu"
              >
                <EllipsisHorizontalIcon />
              </button>
              <div v-if="overflowMenuOpen" class="overflow-menu">
                <button
                  type="button"
                  class="overflow-item"
                  @click="openCommandPalette"
                >
                  <CommandLineIcon class="overflow-item-icon" />
                  Command palette
                </button>
                <button
                  type="button"
                  class="overflow-item"
                  :disabled="!filesystem.hasWorkspace.value || filesystem.indexingState.value === 'indexing'"
                  @click="void rebuildIndexFromOverflow()"
                >
                  <svg class="overflow-item-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 2.5a5.5 5.5 0 1 1-4.4 2.2" />
                    <polyline points="1.8,2.6 4.9,2.6 4.9,5.7" />
                  </svg>
                  Rebuild index
                </button>
                <button
                  type="button"
                  class="overflow-item"
                  :disabled="!filesystem.hasWorkspace.value"
                  @click="closeWorkspace"
                >
                  <svg class="overflow-item-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <line x1="4" y1="4" x2="12" y2="12" />
                    <line x1="12" y1="4" x2="4" y2="12" />
                  </svg>
                  Close workspace
                </button>
                <div class="overflow-divider"></div>
                <div class="overflow-label">Theme</div>
                <button
                  type="button"
                  class="overflow-item"
                  :class="{ active: themePreference === 'light' }"
                  @click="setThemeFromOverflow('light')"
                >
                  <SunIcon class="overflow-item-icon" />
                  Light
                </button>
                <button
                  type="button"
                  class="overflow-item"
                  :class="{ active: themePreference === 'dark' }"
                  @click="setThemeFromOverflow('dark')"
                >
                  <MoonIcon class="overflow-item-icon" />
                  Dark
                </button>
                <button
                  type="button"
                  class="overflow-item"
                  :class="{ active: themePreference === 'system' }"
                  @click="setThemeFromOverflow('system')"
                >
                  <ComputerDesktopIcon class="overflow-item-icon" />
                  System
                </button>
              </div>
            </div>
          </div>
        </header>

        <div class="workspace-row">
          <div
            v-if="workspace.sidebarVisible.value"
            class="splitter"
            @mousedown="beginResize('left', $event)"
          ></div>

          <main class="center-area">
            <EditorView
              ref="editorRef"
              :path="activeFilePath"
              :openFile="openFile"
              :saveFile="saveFile"
              :renameFileFromTitle="renameFileFromTitle"
              :loadLinkTargets="loadWikilinkTargets"
              :loadPropertyTypeSchema="loadPropertyTypeSchema"
              :savePropertyTypeSchema="savePropertyTypeSchema"
              :openLinkTarget="openWikilinkTarget"
              @status="onEditorStatus"
              @path-renamed="onEditorPathRenamed"
              @outline="onEditorOutline"
              @properties="onEditorProperties"
            />
          </main>

          <div
            v-if="workspace.rightPaneVisible.value"
            class="splitter"
            @mousedown="beginResize('right', $event)"
          ></div>

          <aside
            v-if="workspace.rightPaneVisible.value"
            class="right-pane"
            :style="{ width: `${rightPaneWidth}px` }"
          >
            <div class="pane-section">
              <h3>Outline</h3>
              <div v-if="!editorState.activeOutline.value.length" class="placeholder">No headings</div>
              <button
                v-for="(heading, idx) in editorState.activeOutline.value"
                :key="`${heading.text}-${idx}`"
                type="button"
                class="outline-row"
                :style="{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }"
                @click="onOutlineHeadingClick(idx)"
              >
                {{ heading.text }}
              </button>
            </div>

            <div class="pane-section">
              <h3>Backlinks</h3>
              <div v-if="backlinksLoading" class="placeholder">Loading...</div>
              <div v-else-if="!backlinks.length" class="placeholder">No backlinks</div>
              <button
                v-for="path in backlinks"
                :key="path"
                type="button"
                class="outline-row"
                @click="void onBacklinkOpen(path)"
              >
                {{ toRelativePath(path) }}
              </button>
            </div>

            <div class="pane-section">
              <h3>Metadata</h3>
              <div class="metadata-grid">
                <div v-for="row in metadataRows" :key="row.label" class="meta-row">
                  <span>{{ row.label }}</span>
                  <span :title="row.value">{{ row.value }}</span>
                </div>
              </div>
            </div>

            <div class="pane-section">
              <h3>Properties</h3>
              <div v-if="propertyParseErrorCount > 0" class="placeholder">
                {{ propertyParseErrorCount }} parse error{{ propertyParseErrorCount > 1 ? 's' : '' }}
              </div>
              <div v-else-if="!propertiesPreview.length" class="placeholder">No properties</div>
              <div v-else class="metadata-grid">
                <div v-for="row in propertiesPreview" :key="row.key" class="meta-row">
                  <span>{{ row.key }}</span>
                  <span :title="row.value">{{ row.value }}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>

    <footer class="status-bar">
      <span class="status-item">{{ activeFilePath ? toRelativePath(activeFilePath) : 'No file' }}</span>
      <span class="status-item">{{ activeStatus.saving ? 'saving...' : virtualDocs[activeFilePath] ? 'unsaved' : activeStatus.dirty ? 'editing...' : 'saved' }}</span>
      <span class="status-item">index: {{ filesystem.indexingState.value }}</span>
      <span class="status-item">embeddings: {{ filesystem.embeddingQueueState.value }}</span>
      <span class="status-item">workspace: {{ filesystem.workingFolderPath.value || 'none' }}</span>
    </footer>

    <div
      v-if="filesystem.notificationMessage.value"
      class="toast"
      :class="`toast-${filesystem.notificationTone.value}`"
      role="status"
      aria-live="polite"
    >
      <span>{{ filesystem.notificationMessage.value }}</span>
      <button type="button" class="toast-close" aria-label="Dismiss notification" @click="filesystem.clearNotification()">
        ×
      </button>
    </div>

    <div v-if="quickOpenVisible" class="modal-overlay" @click.self="closeQuickOpen">
      <div class="modal quick-open">
        <input
          v-model="quickOpenQuery"
          data-quick-open-input="true"
          class="tool-input"
          placeholder="Type file name, or start with > for actions"
          @keydown="onQuickOpenInputKeydown"
        />
        <div class="modal-list">
          <button
            v-for="(item, index) in quickOpenActionResults"
            :key="item.id"
            type="button"
            class="modal-item"
            :class="{ active: quickOpenActiveIndex === index }"
            @click="runQuickOpenAction(item.id)"
            @mousemove="setQuickOpenActiveIndex(index)"
          >
            {{ item.label }}
          </button>
          <button
            v-for="(item, index) in quickOpenResults"
            :key="item.kind === 'file' ? item.path : `daily-${item.date}`"
            type="button"
            class="modal-item"
            :class="{ active: quickOpenActiveIndex === index }"
            @click="openQuickResult(item)"
            @mousemove="setQuickOpenActiveIndex(index)"
          >
            {{ item.label }}
          </button>
          <div v-if="quickOpenIsActionMode && !quickOpenActionResults.length" class="placeholder">No matching actions</div>
          <div v-else-if="!quickOpenIsActionMode && !quickOpenResults.length" class="placeholder">
            {{ quickOpenQuery.trim() ? 'No matching files' : 'Type to search files' }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="newFileModalVisible" class="modal-overlay" @click.self="closeNewFileModal">
      <div class="modal confirm-modal">
        <h3 class="confirm-title">New Note</h3>
        <p class="confirm-text">Enter a workspace-relative note path. `.md` is added automatically.</p>
        <input
          v-model="newFilePathInput"
          data-new-file-input="true"
          class="tool-input"
          placeholder="untitled"
          @keydown="onNewFileInputKeydown"
        />
        <p v-if="newFileModalError" class="modal-input-error">{{ newFileModalError }}</p>
        <div class="confirm-actions">
          <UiButton size="sm" variant="ghost" @click="closeNewFileModal">Cancel</UiButton>
          <UiButton size="sm" @click="submitNewFileFromModal">Create</UiButton>
        </div>
      </div>
    </div>

    <div v-if="newFolderModalVisible" class="modal-overlay" @click.self="closeNewFolderModal">
      <div class="modal confirm-modal">
        <h3 class="confirm-title">New Folder</h3>
        <p class="confirm-text">Enter a workspace-relative folder path.</p>
        <input
          v-model="newFolderPathInput"
          data-new-folder-input="true"
          class="tool-input"
          placeholder="new-folder"
          @keydown="onNewFolderInputKeydown"
        />
        <p v-if="newFolderModalError" class="modal-input-error">{{ newFolderModalError }}</p>
        <div class="confirm-actions">
          <UiButton size="sm" variant="ghost" @click="closeNewFolderModal">Cancel</UiButton>
          <UiButton size="sm" @click="submitNewFolderFromModal">Create</UiButton>
        </div>
      </div>
    </div>

    <div v-if="openDateModalVisible" class="modal-overlay" @click.self="closeOpenDateModal">
      <div class="modal confirm-modal">
        <h3 class="confirm-title">Open Specific Date</h3>
        <p class="confirm-text">Enter a date as `YYYY-MM-DD`.</p>
        <input
          v-model="openDateInput"
          data-open-date-input="true"
          class="tool-input"
          placeholder="2026-02-22"
          @keydown="onOpenDateInputKeydown"
        />
        <p v-if="openDateModalError" class="modal-input-error">{{ openDateModalError }}</p>
        <div class="confirm-actions">
          <UiButton size="sm" variant="ghost" @click="closeOpenDateModal">Cancel</UiButton>
          <UiButton size="sm" @click="submitOpenDateFromModal">Open</UiButton>
        </div>
      </div>
    </div>

    <div v-if="wikilinkRewritePrompt" class="modal-overlay" @click.self="resolveWikilinkRewritePrompt(false)">
      <div class="modal confirm-modal">
        <h3 class="confirm-title">Update wikilinks?</h3>
        <p class="confirm-text">The file was renamed. Do you want to rewrite matching wikilinks across the workspace?</p>
        <p class="confirm-path"><strong>From:</strong> {{ toRelativePath(wikilinkRewritePrompt.fromPath) }}</p>
        <p class="confirm-path"><strong>To:</strong> {{ toRelativePath(wikilinkRewritePrompt.toPath) }}</p>
        <div class="confirm-actions">
          <UiButton size="sm" variant="ghost" @click="resolveWikilinkRewritePrompt(false)">Keep links</UiButton>
          <UiButton size="sm" @click="resolveWikilinkRewritePrompt(true)">Update links</UiButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ide-root {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #0f172a;
}

.ide-root.dark {
  background: #020617;
  color: #e2e8f0;
}

.topbar {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.ide-root.dark .topbar {
  border-bottom-color: #1e293b;
  background: #0f172a;
}

.tabs-row {
  min-width: 0;
  flex: 1;
  height: 100%;
}

.tab-scroll {
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  height: 100%;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-right: 1px solid #e2e8f0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #94a3b8;
  min-width: 140px;
  max-width: 220px;
  padding: 0 12px;
  font-size: 12px;
}

.ide-root.dark .tab-item {
  border-right-color: #1e293b;
  color: #94a3b8;
}

.tab-item.active {
  border-bottom-color: #000000;
  background: transparent;
  color: #0f172a;
}

.ide-root.dark .tab-item.active {
  border-bottom-color: #e2e8f0;
  background: transparent;
  color: #e2e8f0;
}

.tab-item:not(.active):hover {
  color: #64748b;
}

.ide-root.dark .tab-item:not(.active):hover {
  color: #cbd5e1;
}

.tab-name {
  min-width: 0;
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-state {
  width: 10px;
  text-align: center;
}

.tab-close {
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  width: 16px;
  height: 16px;
  font-size: 12px;
}

.tab-close svg {
  width: 12px;
  height: 12px;
}

.tab-empty {
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  color: #64748b;
  font-size: 12px;
}

.global-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  position: relative;
}

.toolbar-icon-btn {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.toolbar-icon-btn:hover {
  background: #e2e8f0;
  color: #334155;
}

.toolbar-icon-btn.active {
  border-color: #cbd5e1;
  background: #ffffff;
  color: #0f172a;
}

.toolbar-icon-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
}

.ide-root.dark .toolbar-icon-btn {
  color: #94a3b8;
}

.ide-root.dark .toolbar-icon-btn:hover {
  background: #1e293b;
  color: #cbd5e1;
}

.ide-root.dark .toolbar-icon-btn.active {
  border-color: #334155;
  background: #020617;
  color: #e2e8f0;
}

.overflow-wrap {
  position: relative;
}

.overflow-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  min-width: 160px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ide-root.dark .overflow-menu {
  border-color: #334155;
  background: #0b1220;
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.5);
}

.overflow-item {
  border: 0;
  background: transparent;
  color: #334155;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  padding: 7px 10px;
}

.overflow-item:hover {
  background: #f1f5f9;
}

.overflow-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.overflow-item.active {
  background: #e2e8f0;
  color: #0f172a;
  font-weight: 500;
}

.ide-root.dark .overflow-item {
  color: #cbd5e1;
}

.ide-root.dark .overflow-item:hover {
  background: #1e293b;
}

.ide-root.dark .overflow-item:disabled {
  opacity: 0.45;
}

.ide-root.dark .overflow-item.active {
  background: #334155;
  color: #f8fafc;
}

.overflow-item-icon {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  flex: 0 0 auto;
}

.overflow-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 4px 0;
}

.ide-root.dark .overflow-divider {
  background: #334155;
}

.overflow-label {
  padding: 2px 10px 4px;
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.ide-root.dark .overflow-label {
  color: #94a3b8;
}

.body-row {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.workspace-column {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.workspace-row {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.activity-bar {
  width: 44px;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8px;
  gap: 6px;
}

.ide-root.macos-overlay .activity-bar {
  padding-top: 38px;
}

.ide-root.dark .activity-bar {
  border-right-color: #1e293b;
  background: #0f172a;
}

.activity-btn {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.activity-btn:hover {
  background: #e2e8f0;
  color: #334155;
}

.activity-btn.active {
  color: #0f172a;
  border-color: #cbd5e1;
  background: #ffffff;
}

.activity-btn-icon {
  width: 14px;
  height: 14px;
  stroke-width: 1.6;
}

.ide-root.dark .activity-btn {
  color: #94a3b8;
}

.ide-root.dark .activity-btn.active {
  color: #e2e8f0;
  border-color: #334155;
  background: #020617;
}

.ide-root.dark .activity-btn:hover {
  background: #1e293b;
  color: #cbd5e1;
}

.left-sidebar,
.right-pane {
  min-width: 0;
  min-height: 0;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.ide-root.macos-overlay .left-sidebar {
  box-sizing: border-box;
  padding-top: 28px;
}

.right-pane {
  border-right: 0;
  border-left: 1px solid #e2e8f0;
  overflow-y: auto;
}

.ide-root.dark .left-sidebar,
.ide-root.dark .right-pane {
  background: #0b1220;
  border-color: #1e293b;
}

.panel-header {
  height: 34px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 8px;
}

.ide-root.dark .panel-header {
  border-bottom-color: #1e293b;
}

.panel-title {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #475569;
}

.panel-body {
  flex: 1;
  min-height: 0;
  padding: 8px;
}

.panel-fill {
  height: 100%;
  min-height: 0;
}

.empty-explorer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.inline-link-btn {
  border: 0;
  background: transparent;
  color: #2563eb;
  font-size: 12px;
  font-weight: 500;
  padding: 0;
  text-decoration: underline;
  cursor: pointer;
}

.inline-link-btn:hover {
  color: #1d4ed8;
}

.ide-root.dark .inline-link-btn {
  color: #60a5fa;
}

.ide-root.dark .inline-link-btn:hover {
  color: #93c5fd;
}

.search-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-controls {
  display: flex;
  gap: 6px;
}

.tool-input {
  width: 100%;
  height: 30px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #ffffff;
  color: #0f172a;
  padding: 0 8px;
  font-size: 12px;
}

.ide-root.dark .tool-input {
  border-color: #334155;
  background: #020617;
  color: #e2e8f0;
}

.results-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.result-group {
  margin-bottom: 12px;
}

.result-file {
  margin: 0 0 4px;
  font-size: 11px;
  color: #64748b;
}

.result-item {
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 4px;
  padding: 6px;
  margin-bottom: 6px;
  font-size: 12px;
}

.ide-root.dark .result-item {
  border-color: #1e293b;
  background: #020617;
  color: #cbd5e1;
}

.result-snippet :deep(b) {
  font-weight: 700;
}

.splitter {
  width: 8px;
  flex: 0 0 8px;
  position: relative;
  cursor: col-resize;
  background: transparent;
}

.splitter::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: #94a3b8;
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 120ms ease;
}

.splitter:hover::before {
  opacity: 0.45;
}

.splitter:active::before {
  opacity: 0.7;
}

.ide-root.dark .splitter::before {
  background: #64748b;
}

.center-area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: #ffffff;
}

.ide-root.dark .center-area {
  background: #020617;
}

.pane-section {
  border-bottom: 1px solid #e2e8f0;
  padding: 10px;
}

.ide-root.dark .pane-section {
  border-bottom-color: #1e293b;
}

.pane-section h3 {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.outline-row {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding-top: 3px;
  padding-bottom: 3px;
  font-size: 12px;
  color: inherit;
}

.metadata-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #64748b;
}

.meta-row span:last-child {
  color: #334155;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ide-root.dark .meta-row span:last-child {
  color: #cbd5e1;
}

.status-bar {
  height: 22px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0;
  overflow-x: auto;
}

.ide-root.dark .status-bar {
  border-top-color: #1e293b;
  background: #0f172a;
  color: #94a3b8;
}

.status-item {
  display: inline-flex;
  align-items: center;
  height: 100%;
  padding: 0 8px;
  white-space: nowrap;
}

.status-item + .status-item {
  border-left: 1px solid #cbd5e1;
}

.ide-root.dark .status-item + .status-item {
  border-left-color: #1e293b;
}

.toast {
  position: fixed;
  right: 12px;
  bottom: 34px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid transparent;
  z-index: 80;
}

.toast-error {
  border-color: #fda4af;
  background: #fff1f2;
  color: #9f1239;
}

.toast-success {
  border-color: #86efac;
  background: #f0fdf4;
  color: #166534;
}

.toast-info {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
}

.ide-root.dark .toast-error {
  border-color: #be123c;
  background: #3b0a1a;
  color: #fecdd3;
}

.ide-root.dark .toast-success {
  border-color: #166534;
  background: #0b2a16;
  color: #bbf7d0;
}

.ide-root.dark .toast-info {
  border-color: #1d4ed8;
  background: #0f1f45;
  color: #bfdbfe;
}

.toast-close {
  border: 0;
  background: transparent;
  color: currentColor;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.85;
}

.toast-close:hover {
  opacity: 1;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  z-index: 60;
}

.modal {
  width: min(760px, calc(100vw - 32px));
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 6px;
  padding: 10px;
}

.ide-root.dark .modal {
  border-color: #334155;
  background: #020617;
}

.modal-list {
  margin-top: 8px;
  max-height: 360px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modal-item {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 4px;
  padding: 6px;
  text-align: left;
  font-size: 12px;
}

.modal-item.active {
  border-color: #93c5fd;
  background: #dbeafe;
}

.ide-root.dark .modal-item {
  border-color: #1e293b;
  background: #0b1220;
  color: #cbd5e1;
}

.ide-root.dark .modal-item.active {
  border-color: #475569;
  background: #1e293b;
}

.confirm-modal {
  width: min(560px, calc(100vw - 32px));
}

.confirm-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.ide-root.dark .confirm-title {
  color: #f8fafc;
}

.confirm-text {
  margin: 10px 0 12px;
  font-size: 13px;
  color: #475569;
}

.ide-root.dark .confirm-text {
  color: #94a3b8;
}

.modal-input-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #b91c1c;
}

.ide-root.dark .modal-input-error {
  color: #fda4af;
}

.confirm-path {
  margin: 4px 0;
  font-size: 12px;
  color: #334155;
}

.ide-root.dark .confirm-path {
  color: #cbd5e1;
}

.confirm-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.placeholder {
  color: #64748b;
  font-size: 12px;
  padding: 6px;
}

@media (max-width: 980px) {
  .global-actions {
    gap: 4px;
    padding-right: 4px;
  }
}
</style>
