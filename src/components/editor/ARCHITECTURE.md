# Editor Architecture Ownership

## Ownership Map
- Session lifecycle/status/autosave/request token: `useEditorSessionLifecycle`
- File load/save orchestration: `useEditorFileLifecycle`
- Tiptap setup/hooks/link behavior: `useEditorTiptapSetup`
- Wikilink overlay state machine: `useEditorWikilinkOverlayState`
- Slash descriptor insertion mapping: `useEditorSlashInsertion`
- Block menu action derivation: `useBlockMenuControls`
- Table edge visibility + sticky timing: `useTableToolbarControls`
- Table toolbar/hover/action orchestration: `useEditorTableInteractions`
- Input routing (keydown/keyup/paste/contextmenu): `useEditorInputHandlers`
- Path/open-path watchers + mount lifecycle: `useEditorPathWatchers`
- Slash overlay rendering: `EditorSlashOverlay.vue`
- Wikilink overlay rendering: `EditorWikilinkOverlay.vue`
- Block + table overlays rendering: `EditorContextOverlays.vue`

## Invariants
- `EditorView.vue` orchestrates; it does not duplicate lifecycle/action derivation engines.
- Any save/load status mutation should flow through lifecycle composable APIs.
- Overlay wrappers must stay feature-scoped; avoid mega pass-through overlay components.
- Reactive `computed` values must be pure and must not mutate refs.
- Feature modules should expose at most 5 top-level dependencies; larger contracts must be grouped ports.
- `useEditorPersistence` is removed; do not reintroduce parallel lifecycle ownership.

## Anti-patterns
- Duplicated behavior in both `EditorView` and composables.
- No-op event forwarding (for example `@event="() => {}"`).
- Side effects inside `computed` functions.
- Monolithic input-handler signatures that mix unrelated feature concerns.
- Leaving dead transitional modules in tree (for example obsolete persistence abstractions).
