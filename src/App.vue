<script setup lang="ts">
import { ref } from 'vue'
import EditorView from './components/EditorView.vue'
import { listDir, readTextFile, writeTextFile, initDb, ftsSearch } from './lib/api'

const vaultPath = ref<string>('')
const files = ref<string[]>([])
const currentPath = ref<string>('')
const status = ref<string>('Pret')
const query = ref<string>('')
const hits = ref<Array<{ path: string; snippet: string; score: number }>>([])

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
  <div class="wrap">
    <header class="top">
      <div class="left">
        <h1>md-localfirst</h1>
        <p class="muted">Tauri 2, Vue 3, Editor.js, SQLite FTS5 (BM25)</p>
      </div>
      <div class="right">
        <button @click="onPickVault">Choisir vault</button>
        <button @click="onInitDb">Init DB</button>
      </div>
    </header>

    <section class="grid">
      <aside class="panel">
        <div class="row">
          <div class="label">Vault</div>
          <div class="value">{{ vaultPath || 'Non defini' }}</div>
        </div>
        <div class="row">
          <div class="label">Status</div>
          <div class="value">{{ status }}</div>
        </div>

        <div class="search">
          <input v-model="query" placeholder="Recherche FTS5 (BM25), ex: 'kubernetes OR proxmox'" />
          <button @click="onSearch">Chercher</button>
        </div>

        <div class="hits" v-if="hits.length">
          <div class="hit" v-for="h in hits" :key="h.path + h.score">
            <div class="hit-path">{{ h.path }}</div>
            <div class="hit-snippet" v-html="h.snippet"></div>
            <div class="hit-score">score: {{ h.score.toFixed(3) }}</div>
          </div>
        </div>

        <h2>Fichiers</h2>
        <div class="list">
          <button
            class="item"
            v-for="f in files"
            :key="f"
            @click="() => (currentPath = f)"
            :title="f"
          >
            {{ f }}
          </button>
        </div>
      </aside>

      <main class="panel editor">
        <div class="row">
          <div class="label">Fichier</div>
          <div class="value mono">{{ currentPath || 'Aucun' }}</div>
        </div>

        <EditorView
          :path="currentPath"
          :openFile="openFile"
          :saveFile="saveFile"
        />
      </main>
    </section>
  </div>
</template>

<style scoped>
.wrap { padding: 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, sans-serif; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
h1 { margin: 0; font-size: 18px; }
.muted { margin: 4px 0 0; color: #666; font-size: 12px; }
.right button { margin-left: 8px; }
.grid { display: grid; grid-template-columns: 320px 1fr; gap: 12px; height: calc(100vh - 90px); }
.panel { border: 1px solid #ddd; border-radius: 10px; padding: 12px; overflow: auto; }
.row { display: flex; gap: 8px; margin-bottom: 8px; }
.label { width: 70px; color: #555; font-size: 12px; padding-top: 3px; }
.value { flex: 1; font-size: 12px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
.search { display: flex; gap: 8px; margin: 10px 0; }
.search input { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 8px; }
button { padding: 8px 10px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
button:hover { background: #f6f6f6; }
h2 { margin: 12px 0 8px; font-size: 13px; }
.list { display: flex; flex-direction: column; gap: 6px; }
.item { text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.editor { display: flex; flex-direction: column; }
.hits { margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; }
.hit { padding: 8px; border: 1px solid #eee; border-radius: 10px; margin-bottom: 8px; }
.hit-path { font-size: 12px; font-weight: 600; }
.hit-snippet { font-size: 12px; color: #333; margin-top: 6px; }
.hit-score { font-size: 11px; color: #666; margin-top: 6px; }
</style>
