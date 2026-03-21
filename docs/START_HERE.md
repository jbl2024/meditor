# Start Here

This guide is for someone who needs to understand and change Tomosona without rebuilding the whole mental model from scratch.

## What This Project Is

Tomosona is a local-first desktop app:

- `src/` is the Vue 3 frontend
- `src-tauri/` is the Rust backend behind Tauri
- `docs/` contains architecture and design notes

The main rule is simple:

- `app` owns shell orchestration
- `domains` own feature behavior
- `shared` owns reusable UI, API wrappers, and small utilities

If you keep that boundary intact, the code stays manageable.

## Read This In Order

1. `README.md`
2. `src/app/ARCHITECTURE.md`
3. `src/domains/editor/components/editor/ARCHITECTURE.md`
4. `src/domains/second-brain/components/ARCHITECTURE.md`
5. `src/domains/explorer/ARCHITECTURE.md`
6. `src-tauri/src/BACKEND_INDEX_ARCHITECTURE.md`
7. `src-tauri/src/second_brain/SECOND_BRAIN_ARCHITECTURE.md`
8. `docs/design/11_testing_guide.md`

That order goes from product shape to the main implementation seams.

## Where To Start For A New Change

Use the smallest surface that actually owns the behavior.

### Shell / App

Use this when the change coordinates multiple domains:

- global shortcuts
- modals
- workspace boot/reset
- pane routing
- command palette actions

Start in:

- `src/app/App.vue`
- `src/app/composables/useApp*`

### Editor

Use this when the change is about note editing, title handling, overlays, or Tiptap behavior.

Start in:

- `src/domains/editor/components/EditorView.vue`
- `src/domains/editor/composables/useEditor*`
- `src/domains/editor/lib/*`

### Second Brain

Use this when the change touches chat sessions, context injection, streamed responses, or prompt composition.

Start in:

- `src/domains/second-brain/components/SecondBrainView.vue`
- `src/domains/second-brain/composables/useSecondBrain*`
- `src/domains/second-brain/lib/*`

### Explorer

Use this when the change is about tree rendering, selection, drag and drop, rename, or file moves.

Start in:

- `src/domains/explorer/components/*`
- `src/domains/explorer/composables/*`
- `src/domains/explorer/lib/*`

### Backend

Use this when the change touches filesystem access, indexing, search, persistence, or Tauri commands.

Start in:

- `src-tauri/src/lib.rs`
- `src-tauri/src/fs_ops.rs`
- `src-tauri/src/markdown_index.rs`
- `src-tauri/src/search_index.rs`
- `src-tauri/src/index_schema.rs`
- `src-tauri/src/second_brain/*`

## Common Workflows

### Open a note

The note-open path usually goes through:

- shell command routing in `src/app/App.vue`
- navigation workflow in `src/app/composables/useAppNavigationController.ts`
- open flow orchestration in `src/app/composables/useAppShellOpenFlow.ts`
- editor/session loading in `src/domains/editor/composables/*`
- backend file access in `src-tauri/src/fs_ops.rs`

If a bug affects open latency or stale note state, look there first.

### Save a note

The save path usually crosses:

- `EditorView.vue`
- editor lifecycle composables
- workspace filesystem sync in the backend

If title-based renames or conflict handling are involved, treat that as a workflow bug, not a UI bug.

### Change Second Brain behavior

Second Brain is split across:

- shell wiring in `App.vue`
- frontend chat surface in `SecondBrainView.vue`
- frontend session/context composables
- backend session store, prompt builder, and message flow

If the change affects explicit context or streaming, check both frontend and backend.

### Change search or indexing

Search and indexing are backend-heavy:

- `src-tauri/src/markdown_index.rs`
- `src-tauri/src/search_index.rs`
- `src-tauri/src/index_schema.rs`
- `src-tauri/src/wikilink_graph.rs`

The frontend should usually only consume typed API wrappers and display state.

## What Not To Do

- Do not add cross-cutting logic directly into `App.vue` if a shell composable can own it.
- Do not put domain behavior into `shared/`.
- Do not add new IPC calls directly in arbitrary Vue components when a typed API wrapper already exists.
- Do not duplicate path normalization rules in frontend and backend.
- Do not add another abstraction layer unless the current one is actually forcing duplication.

## Useful Commands

Frontend:

```bash
npm run dev
npm run build
npm test
```

Desktop app:

```bash
npm run tauri:dev
npm run tauri:build
```

Backend only:

```bash
cargo check
```

## If You Are Unsure

Prefer these questions in order:

1. Which domain owns this behavior?
2. Is this a shell orchestration problem instead?
3. Is the logic pure enough to extract into `lib/` or `shared/`?
4. Does this need a test before or after the change?

If you can answer those four questions, you can usually change the code safely.
