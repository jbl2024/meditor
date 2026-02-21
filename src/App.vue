<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorView from './components/EditorView.vue'
import UiButton from './components/ui/UiButton.vue'
import UiInput from './components/ui/UiInput.vue'
import UiPanel from './components/ui/UiPanel.vue'
import UiThemeSwitcher from './components/ui/UiThemeSwitcher.vue'
import { listDir, readTextFile, writeTextFile, initDb, ftsSearch } from './lib/api'

const vaultPath = ref<string>('')
const files = ref<string[]>([])
const currentPath = ref<string>('')
const status = ref<string>('Ready')
const query = ref<string>('')
const hits = ref<Array<{ path: string; snippet: string; score: number }>>([])
type ThemePreference = 'light' | 'dark' | 'system'
const THEME_STORAGE_KEY = 'meditor.theme.preference'
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

async function onPickVault() {
  // Keep this simple: ask for a path; a native dialog can be wired in later.
  const p = window.prompt('Vault path (folder):', vaultPath.value || '')
  if (!p) return
  vaultPath.value = p
  status.value = 'Listing...'
  files.value = await listDir(p)
  status.value = `OK, ${files.value.length} items`
}

async function openFile(path: string) {
  currentPath.value = path
  status.value = 'Reading...'
  const txt = await readTextFile(path)
  status.value = 'OK'
  return txt
}

async function saveFile(path: string, txt: string) {
  status.value = 'Writing...'
  await writeTextFile(path, txt)
  status.value = 'OK'
}

async function onInitDb() {
  status.value = 'Init DB...'
  await initDb()
  status.value = 'DB OK'
}

async function onSearch() {
  const q = query.value.trim()
  if (!q) return
  status.value = 'Searching...'
  hits.value = await ftsSearch(q)
  status.value = `OK, ${hits.value.length} results`
}

watch(themePreference, (next) => {
  window.localStorage.setItem(THEME_STORAGE_KEY, next)
  applyTheme()
})

onMounted(() => {
  loadThemePreference()
  applyTheme()
  mediaQuery?.addEventListener('change', onSystemThemeChanged)
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
            <UiButton variant="primary" @click="onPickVault">Choose vault</UiButton>
            <UiButton variant="secondary" @click="onInitDb">Init DB</UiButton>
          </div>
        </div>
      </header>

      <section class="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <UiPanel className="min-h-0 overflow-y-auto">
          <div class="space-y-4">
            <div class="rounded-xl border border-slate-200/80 bg-slate-50/75 p-3 dark:border-slate-700/80 dark:bg-slate-950/55">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Vault</p>
              <p class="mt-1 truncate text-sm text-slate-900 dark:text-slate-100" :title="vaultPath || 'Not set'">
                {{ vaultPath || 'Not set' }}
              </p>
            </div>
            <div class="rounded-xl border border-slate-200/80 bg-slate-50/75 p-3 dark:border-slate-700/80 dark:bg-slate-950/55">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Status</p>
              <p class="mt-1 text-sm text-emerald-700 dark:text-emerald-300">{{ status }}</p>
            </div>
            <div class="space-y-2">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Search</p>
              <div class="flex gap-2">
                <UiInput
                  v-model="query"
                  placeholder="FTS5 BM25, ex: kubernetes OR proxmox"
                />
                <UiButton size="sm" @click="onSearch">Go</UiButton>
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
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Files</p>
              <div class="space-y-1">
                <UiButton
                  v-for="f in files"
                  :key="f"
                  variant="ghost"
                  className="w-full justify-start truncate px-2"
                  :title="f"
                  @click="() => (currentPath = f)"
                >
                  {{ f }}
                </UiButton>
              </div>
            </div>
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
