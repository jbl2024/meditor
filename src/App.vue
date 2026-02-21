<script setup lang="ts">
import { computed, ref } from 'vue'
import EditorView from './components/EditorView.vue'
import UiButton from './components/ui/UiButton.vue'
import UiInput from './components/ui/UiInput.vue'
import UiPanel from './components/ui/UiPanel.vue'
import { listDir, readTextFile, writeTextFile, initDb, ftsSearch } from './lib/api'

const vaultPath = ref<string>('')
const files = ref<string[]>([])
const currentPath = ref<string>('')
const status = ref<string>('Pret')
const query = ref<string>('')
const hits = ref<Array<{ path: string; snippet: string; score: number }>>([])
const selectedFileName = computed(() => {
  if (!currentPath.value) return 'Aucun'
  const parts = currentPath.value.split('/')
  return parts[parts.length - 1] || currentPath.value
})

async function onPickVault() {
  // Pour rester simple: tu saisis un chemin. Tu peux brancher ensuite un dialog plugin si tu veux.
  const p = window.prompt('Chemin du vault (dossier):', vaultPath.value || '')
  if (!p) return
  vaultPath.value = p
  status.value = 'Listing...'
  files.value = await listDir(p)
  status.value = `OK, ${files.value.length} elements`
}

async function openFile(path: string) {
  currentPath.value = path
  status.value = 'Lecture...'
  const txt = await readTextFile(path)
  status.value = 'OK'
  return txt
}

async function saveFile(path: string, txt: string) {
  status.value = 'Ecriture...'
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
  status.value = 'Recherche...'
  hits.value = await ftsSearch(q)
  status.value = `OK, ${hits.value.length} resultats`
}
</script>

<template>
  <div class="min-h-screen text-slate-100">
    <div class="mx-auto flex h-screen max-w-[1800px] flex-col p-4 lg:p-5">
      <header class="rounded-2xl border border-slate-700/70 bg-slate-900/65 p-4 shadow-[0_14px_35px_rgba(2,6,23,0.45)] backdrop-blur-sm">
        <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p class="text-xs uppercase tracking-[0.22em] text-cyan-300/85">Local-first markdown</p>
            <h1 class="mt-1 text-2xl font-semibold tracking-tight text-white">meditor workspace</h1>
            <p class="mt-1 text-sm text-slate-400">Tauri 2, Vue 3, Editor.js, SQLite FTS5 BM25</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UiButton variant="primary" @click="onPickVault">Choisir vault</UiButton>
            <UiButton variant="secondary" @click="onInitDb">Init DB</UiButton>
          </div>
        </div>
      </header>

      <section class="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <UiPanel className="min-h-0 overflow-y-auto">
          <div class="space-y-4">
            <div class="rounded-xl border border-slate-700/80 bg-slate-950/55 p-3">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">Vault</p>
              <p class="mt-1 truncate text-sm text-slate-100" :title="vaultPath || 'Non defini'">
                {{ vaultPath || 'Non defini' }}
              </p>
            </div>
            <div class="rounded-xl border border-slate-700/80 bg-slate-950/55 p-3">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">Status</p>
              <p class="mt-1 text-sm text-emerald-300">{{ status }}</p>
            </div>
            <div class="space-y-2">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">Recherche</p>
              <div class="flex gap-2">
                <UiInput
                  v-model="query"
                  placeholder="FTS5 BM25, ex: kubernetes OR proxmox"
                />
                <UiButton size="sm" @click="onSearch">Go</UiButton>
              </div>
            </div>
            <div v-if="hits.length" class="space-y-2">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">Resultats</p>
              <article
                v-for="h in hits"
                :key="h.path + h.score"
                class="rounded-xl border border-slate-700/70 bg-slate-950/55 p-3"
              >
                <p class="truncate text-xs font-semibold text-cyan-200" :title="h.path">{{ h.path }}</p>
                <p class="search-snippet mt-2 text-xs leading-relaxed text-slate-300" v-html="h.snippet"></p>
                <p class="mt-2 text-[11px] text-slate-500">score: {{ h.score.toFixed(3) }}</p>
              </article>
            </div>
            <div class="space-y-2">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">Fichiers</p>
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
          <div class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/75 bg-slate-950/55 p-3">
            <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">Fichier</p>
            <p class="font-mono text-xs text-slate-300">{{ selectedFileName }}</p>
            <p
              v-if="currentPath"
              class="ml-auto max-w-full truncate rounded-lg border border-slate-700/80 bg-slate-900/80 px-2 py-1 font-mono text-[11px] text-slate-400"
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
