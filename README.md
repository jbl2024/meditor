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

