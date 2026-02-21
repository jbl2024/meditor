#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-md-localfirst}"

if [ -e "$APP_DIR" ]; then
  echo "Le dossier '$APP_DIR' existe deja, stop."
  exit 1
fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Ce script cree exactement le meme scaffold que le zip fourni.
# Il ne telecharge rien: tu feras npm install ensuite.

cat > README.md <<'EOF'
# md-localfirst (Tauri 2 + Vite + Vue 3 + Editor.js + SQLite FTS5)

Objectif: un editeur Markdown local-first qui charge une arborescence locale, lit/ecrit des fichiers, et maintient un index SQLite:
- Recherche BM25 via SQLite FTS5
- Embeddings vectoriels stockes dans SQLite (pipeline simplifie, rerank cote code)

## Prerequis
- Node 20+ (ou 22+)
- Rust toolchain stable
- Sur macOS: Xcode Command Line Tools
- Sur Linux: dependances Tauri (WebKit2GTK, etc.)

## Demarrage rapide
1. Installe les deps JS:
   - `npm install`

2. Installe le CLI Tauri:
   - `npm install -D @tauri-apps/cli`

3. Lance en dev:
   - `npm run tauri:dev`

## Notes
- L'integration Editor.js est "a la main" (pas de wrapper).
- Les commandes Tauri exposees: list_dir, read_text_file, write_text_file, init_db, fts_search.
- Le schema SQLite est initialise dans le dossier data de l'app.

## Structure
- `src/` front Vue
- `src-tauri/` backend Rust Tauri
- `capabilities/` permissions Tauri v2 (lecture/ecriture fichiers via commandes Rust)


EOF

cat > .gitignore <<'EOF'
node_modules/
dist/
target/
.DS_Store
*.log
*.sqlite
*.sqlite-shm
*.sqlite-wal

EOF

mkdir -p src/components src/lib src-tauri/src src-tauri/capabilities

cat > package.json <<'EOF'
{
  "name": "md-localfirst",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "vue": "^3.5.28",
    "@editorjs/editorjs": "^2.31.3"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.10.0",
    "@vitejs/plugin-vue": "^5.2.1",
    "vite": "^7.3.1",
    "typescript": "^5.7.3"
  }
}

EOF

cat > vite.config.ts <<'EOF'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    strictPort: true
  }
})

EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.vue",
    "vite.config.ts"
  ]
}

EOF

cat > index.html <<'EOF'
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>md-localfirst</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>

EOF

cat > src/main.ts <<'EOF'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')

EOF

cat > src/App.vue <<'EOF'
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

EOF

cat > src/components/EditorView.vue <<'EOF'
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorJS from '@editorjs/editorjs'

// Props: on passe les fonctions IO depuis App.vue pour garder le composant neutre
const props = defineProps<{
  path: string
  openFile: (path: string) => Promise<string>
  saveFile: (path: string, text: string) => Promise<void>
}>()

const holder = ref<HTMLDivElement | null>(null)
let editor: EditorJS | null = null
const loadedText = ref<string>('')

function markdownToBlocks(md: string) {
  // Conversion minimale pour bootstrap: tout dans un bloc paragraph.
  // Tu raffineras ensuite: headings, listes, code, etc.
  const text = md.trim()
  return {
    time: Date.now(),
    blocks: [
      { type: 'paragraph', data: { text: text.replace(/\n/g, '<br>') } }
    ],
    version: '2.0.0'
  }
}

function blocksToMarkdown(data: any) {
  // Conversion minimale: concat des paragraphes en texte.
  // Tu remplaceras par un convertisseur plus serieux quand tu voudras.
  const parts: string[] = []
  for (const b of (data?.blocks ?? [])) {
    if (b.type === 'paragraph') {
      const t = String(b.data?.text ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
      parts.push(t)
    } else {
      parts.push('')
    }
  }
  return parts.join('\n\n').trim() + '\n'
}

async function ensureEditor() {
  if (!holder.value) return
  if (editor) return

  editor = new EditorJS({
    holder: holder.value,
    autofocus: true,
    placeholder: 'Ecris ici...',
    tools: {
      // Bootstrap volontairement minimal.
      // Tu ajouteras Header, List, Code, etc.
    }
  })
}

async function loadCurrentFile() {
  const p = props.path?.trim()
  if (!p) return
  await ensureEditor()
  if (!editor) return

  const txt = await props.openFile(p)
  loadedText.value = txt
  await editor.render(markdownToBlocks(txt))
}

async function saveCurrentFile() {
  const p = props.path?.trim()
  if (!p || !editor) return
  const data = await editor.save()
  const md = blocksToMarkdown(data)
  await props.saveFile(p, md)
  loadedText.value = md
}

watch(() => props.path, async () => {
  if (!props.path) return
  await loadCurrentFile()
})

onMounted(async () => {
  await ensureEditor()
})

onBeforeUnmount(async () => {
  if (editor) {
    await editor.destroy()
    editor = null
  }
})
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <button :disabled="!path" @click="loadCurrentFile">Recharger</button>
      <button :disabled="!path" @click="saveCurrentFile">Sauvegarder</button>
      <span class="muted" v-if="!path">Selectionne un fichier</span>
    </div>
    <div ref="holder" class="holder"></div>
  </div>
</template>

<style scoped>
.wrap { display: flex; flex-direction: column; gap: 8px; height: 100%; }
.toolbar { display: flex; align-items: center; gap: 8px; }
.muted { color: #666; font-size: 12px; }
.holder { flex: 1; border: 1px solid #eee; border-radius: 10px; padding: 12px; overflow: auto; }
</style>

EOF

cat > src/lib/api.ts <<'EOF'
import { invoke } from '@tauri-apps/api/core'

export async function listDir(path: string): Promise<string[]> {
  return await invoke('list_dir', { path })
}

export async function readTextFile(path: string): Promise<string> {
  return await invoke('read_text_file', { path })
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke('write_text_file', { path, content })
}

export async function initDb(): Promise<void> {
  await invoke('init_db', {})
}

export async function ftsSearch(query: string): Promise<Array<{ path: string; snippet: string; score: number }>> {
  return await invoke('fts_search', { query })
}

EOF

cat > src-tauri/Cargo.toml <<'EOF'
[package]
name = "md-localfirst"
version = "0.1.0"
description = "Local-first markdown editor"
authors = ["you"]
edition = "2021"

[lib]
name = "md_localfirst"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.10", features = [] }

[dependencies]
tauri = { version = "2.10", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
directories = "5"


EOF

cat > src-tauri/build.rs <<'EOF'
fn main() {
  tauri_build::build()
}

EOF

cat > src-tauri/tauri.conf.json <<'EOF'
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "md-localfirst",
  "version": "0.1.0",
  "identifier": "fr.localfirst.mdlocalfirst",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "md-localfirst",
        "width": 1200,
        "height": 800
      }
    ],
    "security": {
      "csp": null
    }
  }
}

EOF

cat > src-tauri/capabilities/default.json <<'EOF'
{
  "identifier": "default",
  "description": "Default capabilities for md-localfirst",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default"
  ]
}

EOF

cat > src-tauri/src/main.rs <<'EOF'
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::{Path, PathBuf}};
use serde::Serialize;
use tauri::{Manager};
use thiserror::Error;

use rusqlite::{Connection, params};

#[derive(Debug, Error)]
enum AppError {
  #[error("io error: {0}")]
  Io(#[from] std::io::Error),
  #[error("sqlite error: {0}")]
  Sqlite(#[from] rusqlite::Error),
  #[error("invalid path")]
  InvalidPath,
  #[error("app data dir not available")]
  NoAppDataDir,
}

type Result<T> = std::result::Result<T, AppError>;

fn normalize_path(p: &str) -> Result<PathBuf> {
  let pb = PathBuf::from(p);
  if pb.as_os_str().is_empty() {
    return Err(AppError::InvalidPath);
  }
  Ok(pb)
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<String>> {
  let pb = normalize_path(&path)?;
  let mut out = Vec::new();
  for entry in fs::read_dir(pb)? {
    let entry = entry?;
    let p = entry.path();
    if p.is_file() {
      if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown") {
          out.push(p.to_string_lossy().to_string());
        }
      }
    }
  }
  out.sort();
  Ok(out)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String> {
  let pb = normalize_path(&path)?;
  Ok(fs::read_to_string(pb)?)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<()> {
  let pb = normalize_path(&path)?;
  fs::write(pb, content)?;
  Ok(())
}

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf> {
  let data_dir = app.path().app_data_dir().map_err(|_| AppError::NoAppDataDir)?;
  fs::create_dir_all(&data_dir)?;
  Ok(data_dir.join("index.sqlite"))
}

fn open_db(app: &tauri::AppHandle) -> Result<Connection> {
  let p = db_path(app)?;
  Ok(Connection::open(p)?)
}

#[tauri::command]
fn init_db(app: tauri::AppHandle) -> Result<()> {
  let conn = open_db(&app)?;

  conn.execute_batch(r#"
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL,
      anchor TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      mtime INTEGER NOT NULL DEFAULT 0
    );

    -- FTS5, avec bm25() disponible.
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      path,
      anchor,
      text,
      content='chunks',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, path, anchor, text) VALUES (new.id, new.path, new.anchor, new.text);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, path, anchor, text) VALUES('delete', old.id, old.path, old.anchor, old.text);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, path, anchor, text) VALUES('delete', old.id, old.path, old.anchor, old.text);
      INSERT INTO chunks_fts(rowid, path, anchor, text) VALUES (new.id, new.path, new.anchor, new.text);
    END;

    -- Table embeddings: stockage simple en BLOB float32.
    CREATE TABLE IF NOT EXISTS embeddings (
      chunk_id INTEGER PRIMARY KEY,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      vector BLOB NOT NULL,
      FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
    );
  "#)?;

  Ok(())
}

#[derive(Serialize)]
struct Hit {
  path: String,
  snippet: String,
  score: f64,
}

#[tauri::command]
fn fts_search(app: tauri::AppHandle, query: String) -> Result<Vec<Hit>> {
  let conn = open_db(&app)?;
  let q = query.trim();
  if q.is_empty() {
    return Ok(vec![]);
  }

  // snippet() et bm25() sont fournis par FTS5.
  // Important: score plus petit = meilleur.
  let mut stmt = conn.prepare(r#"
    SELECT path,
           snippet(chunks_fts, 2, '<b>', '</b>', '...', 12) AS snip,
           bm25(chunks_fts) AS score
    FROM chunks_fts
    WHERE chunks_fts MATCH ?1
    ORDER BY score
    LIMIT 25;
  "#)?;

  let mut rows = stmt.query(params![q])?;
  let mut out = Vec::new();

  while let Some(row) = rows.next()? {
    out.push(Hit {
      path: row.get::<_, String>(0)?,
      snippet: row.get::<_, String>(1)?,
      score: row.get::<_, f64>(2)?,
    });
  }
  Ok(out)
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      list_dir,
      read_text_file,
      write_text_file,
      init_db,
      fts_search
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

EOF

chmod +x bootstrap.sh || true

echo "OK. Prochaines commandes:"
echo "  npm install"
echo "  npm run tauri:dev"
