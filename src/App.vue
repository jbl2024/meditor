<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorView from './components/EditorView.vue'
import FileTreeNode from './components/FileTreeNode.vue'
import UiButton from './components/ui/UiButton.vue'
import UiInput from './components/ui/UiInput.vue'
import UiPanel from './components/ui/UiPanel.vue'
import UiThemeSwitcher from './components/ui/UiThemeSwitcher.vue'
import { ftsSearch, initDb, listTree, readTextFile, selectWorkingFolder, writeTextFile } from './lib/api'
import type { TreeNode } from './lib/api'

const workingFolderPath = ref<string>('')
const treeNodes = ref<TreeNode[]>([])
const currentPath = ref<string>('')
const query = ref<string>('')
const errorMessage = ref<string>('')
const hits = ref<Array<{ path: string; snippet: string; score: number }>>([])

type ThemePreference = 'light' | 'dark' | 'system'
const THEME_STORAGE_KEY = 'meditor.theme.preference'
const WORKING_FOLDER_STORAGE_KEY = 'meditor.working-folder.path'
const themePreference = ref<ThemePreference>('light')

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

function applyTheme() {
  const root = document.documentElement
  root.classList.toggle('dark', resolvedTheme.value === 'dark')
}

function loadThemePreference() {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    themePreference.value = saved
  } else {
    themePreference.value = 'light'
  }
}

const mediaQuery = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

function onSystemThemeChanged() {
  if (themePreference.value === 'system') {
    applyTheme()
  }
}

const selectedFileName = computed(() => {
  if (!currentPath.value) return 'None'
  const parts = currentPath.value.split('/')
  return parts[parts.length - 1] || currentPath.value
})

function treeContainsPath(nodes: TreeNode[], path: string): boolean {
  for (const node of nodes) {
    if (!node.is_dir && node.path === path) return true
    if (node.is_dir && treeContainsPath(node.children, path)) return true
  }
  return false
}

async function onSelectWorkingFolder() {
  errorMessage.value = ''
  const path = await selectWorkingFolder()
  if (!path) return
  await loadWorkingFolder(path)
}

async function loadWorkingFolder(path: string) {
  try {
    workingFolderPath.value = path
    await initDb(path)
    treeNodes.value = await listTree(path)
    hits.value = []
    window.localStorage.setItem(WORKING_FOLDER_STORAGE_KEY, path)
    if (!treeContainsPath(treeNodes.value, currentPath.value)) {
      currentPath.value = ''
    }
  } catch (err) {
    workingFolderPath.value = ''
    treeNodes.value = []
    hits.value = []
    window.localStorage.removeItem(WORKING_FOLDER_STORAGE_KEY)
    errorMessage.value = err instanceof Error ? err.message : 'Could not open working folder.'
  }
}

function onSelectFile(path: string) {
  currentPath.value = path
}

async function openFile(path: string) {
  return await readTextFile(path)
}

async function saveFile(path: string, txt: string) {
  await writeTextFile(path, txt)
}

async function onSearch() {
  const q = query.value.trim()
  if (!q || !workingFolderPath.value) return

  errorMessage.value = ''
  try {
    hits.value = await ftsSearch(workingFolderPath.value, q)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Search failed.'
  }
}

watch(themePreference, (next) => {
  window.localStorage.setItem(THEME_STORAGE_KEY, next)
  applyTheme()
})

onMounted(() => {
  loadThemePreference()
  applyTheme()
  mediaQuery?.addEventListener('change', onSystemThemeChanged)
  const savedFolder = window.localStorage.getItem(WORKING_FOLDER_STORAGE_KEY)
  if (savedFolder) {
    void loadWorkingFolder(savedFolder)
  }
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', onSystemThemeChanged)
})
</script>

<template>
  <div class="min-h-screen text-slate-900 dark:text-slate-100">
    <div class="mx-auto flex h-screen max-w-[1800px] flex-col p-4 lg:p-5">
      <header class="rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-[0_14px_35px_rgba(148,163,184,0.25)] backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-900/65 dark:shadow-[0_14px_35px_rgba(2,6,23,0.45)]">
        <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p class="text-xs uppercase tracking-[0.22em] text-[#003153] dark:text-[#89a9c8]">Local-first markdown</p>
            <h1 class="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">meditor workspace</h1>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">Tauri 2, Vue 3, Editor.js, SQLite FTS5 BM25</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UiThemeSwitcher v-model="themePreference" />
            <UiButton variant="primary" @click="onSelectWorkingFolder">Select working folder</UiButton>
          </div>
        </div>
      </header>

      <section class="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <UiPanel className="min-h-0 overflow-y-auto">
          <div class="space-y-4">
            <div class="rounded-xl border border-slate-200/80 bg-slate-50/75 p-3 dark:border-slate-700/80 dark:bg-slate-950/55">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Working folder</p>
              <p class="mt-1 truncate text-sm text-slate-900 dark:text-slate-100" :title="workingFolderPath || 'Not set'">
                {{ workingFolderPath || 'Not set' }}
              </p>
            </div>

            <div class="space-y-2">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Search</p>
              <div class="flex gap-2">
                <UiInput
                  v-model="query"
                  :disabled="!workingFolderPath"
                  placeholder="FTS5 BM25, ex: kubernetes OR proxmox"
                />
                <UiButton size="sm" :disabled="!workingFolderPath" @click="onSearch">Go</UiButton>
              </div>
            </div>

            <div v-if="hits.length" class="space-y-2">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Results</p>
              <article
                v-for="h in hits"
                :key="h.path + h.score"
                class="rounded-xl border border-slate-200/80 bg-slate-50/75 p-3 dark:border-slate-700/70 dark:bg-slate-950/55"
              >
                <p class="truncate text-xs font-semibold text-[#003153] dark:text-[#89a9c8]" :title="h.path">{{ h.path }}</p>
                <p class="search-snippet mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300" v-html="h.snippet"></p>
                <p class="mt-2 text-[11px] text-slate-500 dark:text-slate-500">score: {{ h.score.toFixed(3) }}</p>
              </article>
            </div>

            <div class="space-y-2">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Folder tree</p>
              <p v-if="!workingFolderPath" class="text-xs text-slate-500 dark:text-slate-500">Select a working folder to load files.</p>
              <p v-else-if="!treeNodes.length" class="text-xs text-slate-500 dark:text-slate-500">No markdown files found in this folder.</p>
              <ul v-else class="space-y-0.5">
                <FileTreeNode
                  v-for="node in treeNodes"
                  :key="node.path"
                  :node="node"
                  :selected-path="currentPath"
                  @select="onSelectFile"
                />
              </ul>
            </div>

            <p v-if="errorMessage" class="rounded-lg border border-rose-300/80 bg-rose-50/80 px-2 py-1 text-xs text-rose-700 dark:border-rose-900/80 dark:bg-rose-950/40 dark:text-rose-300">
              {{ errorMessage }}
            </p>
          </div>
        </UiPanel>

        <UiPanel className="min-h-0">
          <div class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/75 p-3 dark:border-slate-700/75 dark:bg-slate-950/55">
            <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">File</p>
            <p class="font-mono text-xs text-slate-700 dark:text-slate-300">{{ selectedFileName }}</p>
            <p
              v-if="currentPath"
              class="ml-auto max-w-full truncate rounded-lg border border-slate-300/90 bg-white/90 px-2 py-1 font-mono text-[11px] text-slate-500 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-400"
              :title="currentPath"
            >
              {{ currentPath }}
            </p>
          </div>
          <EditorView
            :path="currentPath"
            :openFile="openFile"
            :saveFile="saveFile"
          />
        </UiPanel>
      </section>
    </div>
  </div>
</template>
