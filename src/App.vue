<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorView from './components/EditorView.vue'
import ExplorerTree from './components/explorer/ExplorerTree.vue'
import UiButton from './components/ui/UiButton.vue'
import UiThemeSwitcher from './components/ui/UiThemeSwitcher.vue'
import { createEntry, ftsSearch, initDb, listChildren, readTextFile, reindexMarkdownFile, selectWorkingFolder, writeTextFile } from './lib/api'
import { useEditorState } from './composables/useEditorState'
import { useFilesystemState } from './composables/useFilesystemState'
import { useWorkspaceState, type SidebarMode } from './composables/useWorkspaceState'

type ThemePreference = 'light' | 'dark' | 'system'
type SearchHit = { path: string; snippet: string; score: number }

type EditorViewExposed = {
  saveNow: () => Promise<void>
  reloadCurrent: () => Promise<void>
  focusEditor: () => void
  revealSnippet: (snippet: string) => Promise<void>
}

const THEME_STORAGE_KEY = 'meditor.theme.preference'
const WORKING_FOLDER_STORAGE_KEY = 'meditor.working-folder.path'

const workspace = useWorkspaceState()
const editorState = useEditorState()
const filesystem = useFilesystemState()

const themePreference = ref<ThemePreference>('system')
const searchQuery = ref('')
const searchHits = ref<SearchHit[]>([])
const searchLoading = ref(false)
const quickOpenVisible = ref(false)
const quickOpenQuery = ref('')
const quickOpenActiveIndex = ref(0)
const leftPaneWidth = ref(300)
const rightPaneWidth = ref(300)
const allWorkspaceFiles = ref<string[]>([])
const loadingAllFiles = ref(false)
const editorRef = ref<EditorViewExposed | null>(null)

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
    return {
      ...tab,
      title: fileName(tab.path),
      dirty: status.dirty,
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

type PaletteAction = {
  id: string
  label: string
  run: () => boolean | Promise<boolean>
}

const paletteActions = computed<PaletteAction[]>(() => [
  { id: 'close-all-tabs', label: 'Close All Tabs', run: () => (workspace.closeAllTabs(), true) },
  {
    id: 'close-other-tabs',
    label: 'Close All But Current Tab',
    run: () => {
      if (!workspace.activeTabPath.value) return false
      workspace.closeOtherTabs(workspace.activeTabPath.value)
      return true
    }
  },
  { id: 'create-new-file', label: 'Create New File', run: () => createNewFileFromPalette() },
  { id: 'toggle-sidebar', label: 'Toggle Sidebar', run: () => (workspace.toggleSidebar(), true) },
  { id: 'toggle-right-pane', label: 'Toggle Context Pane', run: () => (workspace.toggleRightPane(), true) },
  { id: 'open-search', label: 'Open Global Search', run: () => (openSearchPanel(), true) },
  { id: 'open-folder', label: 'Select Working Folder', run: () => (void onSelectWorkingFolder(), true) },
  { id: 'theme-light', label: 'Theme: Light', run: () => ((themePreference.value = 'light'), true) },
  { id: 'theme-dark', label: 'Theme: Dark', run: () => ((themePreference.value = 'dark'), true) },
  { id: 'theme-system', label: 'Theme: System', run: () => ((themePreference.value = 'system'), true) }
])

const quickOpenIsActionMode = computed(() => quickOpenQuery.value.trimStart().startsWith('>'))
const quickOpenActionQuery = computed(() => quickOpenQuery.value.trimStart().slice(1).trim().toLowerCase())

const quickOpenResults = computed(() => {
  if (quickOpenIsActionMode.value) return []
  const q = quickOpenQuery.value.trim().toLowerCase()
  const files = allWorkspaceFiles.value
  if (!q) return []
  return files
    .filter((path) => path.toLowerCase().includes(q) || toRelativePath(path).toLowerCase().includes(q))
    .slice(0, 80)
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
  return [
    { label: 'Path', value: toRelativePath(activeFilePath.value) },
    { label: 'State', value: status.saving ? 'saving' : status.dirty ? 'editing' : 'saved' },
    { label: 'Workspace', value: toRelativePath(filesystem.workingFolderPath.value) || filesystem.workingFolderPath.value }
  ]
})

const mediaQuery = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

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

function onSystemThemeChanged() {
  if (themePreference.value === 'system') {
    applyTheme()
  }
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
  if (!path) return
  await loadWorkingFolder(path)
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

function onExplorerOpen(path: string) {
  workspace.openTab(path)
  nextTick(() => editorRef.value?.focusEditor())
}

async function openFile(path: string) {
  if (!filesystem.workingFolderPath.value) {
    throw new Error('Working folder is not set.')
  }
  return await readTextFile(filesystem.workingFolderPath.value, path)
}

async function saveFile(path: string, txt: string) {
  if (!filesystem.workingFolderPath.value) {
    throw new Error('Working folder is not set.')
  }
  await writeTextFile(filesystem.workingFolderPath.value, path, txt)
  filesystem.indexingState.value = 'indexing'
  try {
    await reindexMarkdownFile(filesystem.workingFolderPath.value, path)
  } finally {
    filesystem.indexingState.value = 'idle'
  }
}

async function runGlobalSearch() {
  const q = searchQuery.value.trim()
  if (!q || !filesystem.workingFolderPath.value) return

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
    searchHits.value = merged.filter((hit) => {
      const key = `${hit.path}::${hit.snippet}`
      if (dedupe.has(key)) return false
      dedupe.add(key)
      return true
    })
  } catch (err) {
    filesystem.errorMessage.value = err instanceof Error ? err.message : 'Search failed.'
  } finally {
    searchLoading.value = false
  }
}

async function onSearchResultOpen(hit: SearchHit) {
  workspace.openTab(hit.path)
  editorState.setRevealSnippet(hit.path, hit.snippet)

  await nextTick()
  await editorRef.value?.revealSnippet(hit.snippet)
}

function onTabClick(path: string) {
  workspace.setActiveTab(path)
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

function setSidebarMode(mode: SidebarMode) {
  workspace.setSidebarMode(mode)
}

function openSearchPanel() {
  workspace.setSidebarMode('search')
  nextTick(() => {
    document.querySelector<HTMLInputElement>('[data-search-input=\"true\"]')?.focus()
  })
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

function openQuickFile(path: string) {
  workspace.openTab(path)
  closeQuickOpen()
  nextTick(() => editorRef.value?.focusEditor())
}

function openCommandPalette() {
  void openQuickOpen('>')
}

async function runQuickOpenAction(id: string) {
  const action = quickOpenActionResults.value.find((item) => item.id === id)
  if (!action) return
  const shouldClose = await action.run()
  if (!shouldClose) return
  closeQuickOpen()
  nextTick(() => editorRef.value?.focusEditor())
}

async function createNewFileFromPalette() {
  const root = filesystem.workingFolderPath.value
  if (!root) {
    filesystem.errorMessage.value = 'Working folder is not set.'
    return false
  }

  const raw = window.prompt('New file path (relative to workspace):', 'untitled.md')
  if (!raw) return false

  const normalized = raw
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')

  if (!normalized || normalized.endsWith('/')) {
    filesystem.errorMessage.value = 'Invalid file path.'
    return false
  }

  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part === '.' || part === '..')) {
    filesystem.errorMessage.value = 'Path cannot include . or .. segments.'
    return false
  }

  const name = parts[parts.length - 1]
  const parentPath = parts.length > 1 ? `${root}/${parts.slice(0, -1).join('/')}` : root

  try {
    const created = await createEntry(root, parentPath, name, 'file', 'fail')
    workspace.openTab(created)
    if (/\.(md|markdown)$/i.test(created) && !allWorkspaceFiles.value.includes(created)) {
      allWorkspaceFiles.value = [...allWorkspaceFiles.value, created].sort((a, b) => a.localeCompare(b))
    }
    nextTick(() => editorRef.value?.focusEditor())
    return true
  } catch (err) {
    filesystem.errorMessage.value = err instanceof Error ? err.message : 'Could not create file.'
    return false
  }
}

function onQuickOpenEnter() {
  if (quickOpenIsActionMode.value) {
    const action = quickOpenActionResults.value[quickOpenActiveIndex.value]
    if (action) {
      void runQuickOpenAction(action.id)
    }
    return
  }

  const path = quickOpenResults.value[quickOpenActiveIndex.value]
  if (path) {
    openQuickFile(path)
  }
}

function onQuickOpenInputKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveQuickOpenSelection(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveQuickOpenSelection(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    onQuickOpenEnter()
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
  if (isEscape) {
    if (quickOpenVisible.value) {
      event.preventDefault()
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

  if (key === 'w') {
    event.preventDefault()
    workspace.closeCurrentTab()
    return
  }

  if (key === 'tab') {
    event.preventDefault()
    workspace.nextTab()
    return
  }

  if (key === 'f' && event.shiftKey) {
    event.preventDefault()
    openSearchPanel()
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
  }
)

onMounted(() => {
  loadThemePreference()
  applyTheme()
  mediaQuery?.addEventListener('change', onSystemThemeChanged)
  window.addEventListener('keydown', onWindowKeydown, true)
  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('mouseup', stopResize)

  const savedFolder = window.localStorage.getItem(WORKING_FOLDER_STORAGE_KEY)
  if (savedFolder) {
    void loadWorkingFolder(savedFolder)
  }
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', onSystemThemeChanged)
  window.removeEventListener('keydown', onWindowKeydown, true)
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('mouseup', stopResize)
})
</script>

<template>
  <div class="ide-root">
    <header class="topbar">
      <div class="tabs-row">
        <div class="tab-scroll">
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
            <button class="tab-close" type="button" @click.stop="onTabClose(tab.path)">x</button>
          </div>
          <div v-if="!tabView.length" class="tab-empty">No open files</div>
        </div>
      </div>

      <div class="global-actions">
        <UiThemeSwitcher v-model="themePreference" />
        <UiButton size="sm" variant="ghost" @click="onSelectWorkingFolder">Workspace</UiButton>
        <UiButton size="sm" variant="ghost" title="Global search" @click="openSearchPanel">Search</UiButton>
        <UiButton size="sm" variant="ghost" title="Command palette" @click="openCommandPalette">Cmd</UiButton>
        <UiButton size="sm" variant="ghost" title="Toggle context pane" @click="workspace.toggleRightPane()">Pane</UiButton>
      </div>
    </header>

    <div class="body-row">
      <aside class="activity-bar">
        <button
          class="activity-btn"
          :class="{ active: workspace.sidebarMode.value === 'explorer' && workspace.sidebarVisible.value }"
          type="button"
          title="Explorer"
          @click="setSidebarMode('explorer')"
        >
          E
        </button>
        <button
          class="activity-btn"
          :class="{ active: workspace.sidebarMode.value === 'search' && workspace.sidebarVisible.value }"
          type="button"
          title="Search"
          @click="setSidebarMode('search')"
        >
          S
        </button>
        <button
          class="activity-btn"
          :class="{ active: workspace.sidebarMode.value === 'backlinks' && workspace.sidebarVisible.value }"
          type="button"
          title="Backlinks"
          @click="setSidebarMode('backlinks')"
        >
          B
        </button>
        <button
          class="activity-btn"
          :class="{ active: workspace.sidebarMode.value === 'favorites' && workspace.sidebarVisible.value }"
          type="button"
          title="Favorites"
          @click="setSidebarMode('favorites')"
        >
          F
        </button>
      </aside>

      <aside
        v-if="workspace.sidebarVisible.value"
        class="left-sidebar"
        :style="{ width: `${leftPaneWidth}px` }"
      >
        <div class="panel-header">
          <h2 class="panel-title">{{ workspace.sidebarMode.value }}</h2>
          <UiButton size="sm" variant="ghost" @click="workspace.toggleSidebar()">Hide</UiButton>
        </div>

        <div class="panel-body">
          <div v-if="workspace.sidebarMode.value === 'explorer'" class="panel-fill">
            <ExplorerTree
              :folder-path="filesystem.workingFolderPath.value"
              :active-path="activeFilePath"
              @open="onExplorerOpen"
              @select="onExplorerSelection"
              @error="onExplorerError"
            />
          </div>

          <div v-else-if="workspace.sidebarMode.value === 'search'" class="panel-fill search-panel">
            <div class="search-controls">
              <input
                v-model="searchQuery"
                data-search-input="true"
                :disabled="!filesystem.hasWorkspace.value"
                class="tool-input"
                placeholder="Search files and content"
                @keydown.enter.prevent="runGlobalSearch"
              />
              <UiButton size="sm" :disabled="!filesystem.hasWorkspace.value || searchLoading" @click="runGlobalSearch">
                {{ searchLoading ? '...' : 'Go' }}
              </UiButton>
            </div>

            <div class="results-list">
              <div v-if="!searchHits.length" class="placeholder">No results</div>
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
          @status="onEditorStatus"
          @outline="onEditorOutline"
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
          >
            {{ heading.text }}
          </button>
        </div>

        <div class="pane-section">
          <h3>Backlinks</h3>
          <div class="placeholder">Backlinks module placeholder</div>
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
      </aside>
    </div>

    <footer class="status-bar">
      <span class="status-item">{{ activeFilePath ? toRelativePath(activeFilePath) : 'No file' }}</span>
      <span class="status-item">{{ activeStatus.saving ? 'saving...' : activeStatus.dirty ? 'editing...' : 'saved' }}</span>
      <span class="status-item">index: {{ filesystem.indexingState.value }}</span>
      <span class="status-item">embeddings: {{ filesystem.embeddingQueueState.value }}</span>
      <span class="status-item">workspace: {{ filesystem.workingFolderPath.value || 'none' }}</span>
    </footer>

    <div v-if="filesystem.errorMessage.value" class="error-toast">{{ filesystem.errorMessage.value }}</div>

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
            v-for="(path, index) in quickOpenResults"
            :key="path"
            type="button"
            class="modal-item"
            :class="{ active: quickOpenActiveIndex === index }"
            @click="openQuickFile(path)"
            @mousemove="setQuickOpenActiveIndex(index)"
          >
            {{ toRelativePath(path) }}
          </button>
          <div v-if="quickOpenIsActionMode && !quickOpenActionResults.length" class="placeholder">No matching actions</div>
          <div v-else-if="!quickOpenIsActionMode && !quickOpenResults.length" class="placeholder">
            {{ quickOpenQuery.trim() ? 'No matching files' : 'Type to search files' }}
          </div>
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

:global(.dark) .ide-root {
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

:global(.dark) .topbar {
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
  background: #f1f5f9;
  color: #334155;
  min-width: 140px;
  max-width: 220px;
  padding: 0 10px;
  font-size: 12px;
}

:global(.dark) .tab-item {
  border-right-color: #1e293b;
  background: #0b1220;
  color: #94a3b8;
}

.tab-item.active {
  background: #ffffff;
  color: #0f172a;
}

:global(.dark) .tab-item.active {
  background: #020617;
  color: #e2e8f0;
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
}

.body-row {
  flex: 1;
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

:global(.dark) .activity-bar {
  border-right-color: #1e293b;
  background: #0f172a;
}

.activity-btn {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
}

.activity-btn.active {
  color: #0f172a;
  border-color: #cbd5e1;
  background: #ffffff;
}

:global(.dark) .activity-btn.active {
  color: #e2e8f0;
  border-color: #334155;
  background: #020617;
}

.left-sidebar,
.right-pane {
  min-width: 0;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.right-pane {
  border-right: 0;
  border-left: 1px solid #e2e8f0;
}

:global(.dark) .left-sidebar,
:global(.dark) .right-pane {
  background: #0b1220;
  border-color: #1e293b;
}

.panel-header {
  height: 34px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
}

:global(.dark) .panel-header {
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

:global(.dark) .tool-input {
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

:global(.dark) .result-item {
  border-color: #1e293b;
  background: #020617;
  color: #cbd5e1;
}

.result-snippet :deep(b) {
  font-weight: 700;
}

.splitter {
  width: 5px;
  cursor: col-resize;
  background: #e2e8f0;
}

:global(.dark) .splitter {
  background: #1e293b;
}

.center-area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: #ffffff;
}

:global(.dark) .center-area {
  background: #020617;
}

.pane-section {
  border-bottom: 1px solid #e2e8f0;
  padding: 10px;
}

:global(.dark) .pane-section {
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

:global(.dark) .meta-row span:last-child {
  color: #cbd5e1;
}

.status-bar {
  height: 24px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 11px;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 8px;
  overflow-x: auto;
}

:global(.dark) .status-bar {
  border-top-color: #1e293b;
  background: #0f172a;
  color: #94a3b8;
}

.status-item {
  white-space: nowrap;
}

.error-toast {
  position: fixed;
  right: 12px;
  bottom: 34px;
  border: 1px solid #fda4af;
  background: #fff1f2;
  color: #9f1239;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
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

:global(.dark) .modal {
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

:global(.dark) .modal-item {
  border-color: #1e293b;
  background: #0b1220;
  color: #cbd5e1;
}

:global(.dark) .modal-item.active {
  border-color: #475569;
  background: #1e293b;
}

.placeholder {
  color: #64748b;
  font-size: 12px;
  padding: 6px;
}

@media (max-width: 980px) {
  .global-actions :deep(.inline-flex) {
    display: none;
  }

  .global-actions :deep(.inline-flex:nth-child(1)) {
    display: inline-flex;
  }
}
</style>
