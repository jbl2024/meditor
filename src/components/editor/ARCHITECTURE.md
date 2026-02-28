# Editor Architecture Ownership

## Ownership Map
- Session lifecycle/status/autosave/request token: `useEditorSessionLifecycle`
- Block menu action derivation: `useBlockMenuControls`
- Table edge visibility + sticky timing: `useTableToolbarControls`
- Input routing (keydown/keyup/paste/contextmenu): `useEditorInputHandlers`
- Slash overlay rendering: `EditorSlashOverlay.vue`
- Wikilink overlay rendering: `EditorWikilinkOverlay.vue`
- Block + table overlays rendering: `EditorContextOverlays.vue`

## Invariants
- `EditorView.vue` orchestrates; it does not duplicate lifecycle/action derivation engines.
- Any save/load status mutation should flow through lifecycle composable APIs.
- Overlay wrappers must stay feature-scoped; avoid mega pass-through overlay components.
- Reactive `computed` values must be pure and must not mutate refs.

## Anti-patterns
- Duplicated behavior in both `EditorView` and composables.
- No-op event forwarding (for example `@event="() => {}"`).
- Side effects inside `computed` functions.
- Monolithic input-handler signatures that mix unrelated feature concerns.
