# Editor Architecture Ownership

## Ownership Map
- Shell composition/orchestration boundary: `EditorView.vue`
- Document/session runtime: `useEditorDocumentRuntime`
  Internal organization should stay in a few local zones (`sessionState`, `documentPersistence`, `titleAndProperties`) rather than more public runtime layers.
- Interaction runtime (Tiptap/slash/wikilink/caret): `useEditorInteractionRuntime`
  Internal organization should stay in a few local flow zones (`slashAndInsertion`, `wikilinkFlow`, `caretAndOutline`, `editorInputAndNavigation`) rather than more public runtime layers.
  Selection extraction into linked notes also belongs here: the toolbar only emits the intent, while the runtime validates block-complete selections, creates the note, and replaces the selection with a note embed block.
- Chrome runtime (toolbars/overlays/layout/pulse): `useEditorChromeRuntime`
  Internal organization should stay in a few local zones (`toolbars`, `blockAndTableControls`, `layoutAndZoom`, `pulseAndDialogs`) rather than new public mini-runtimes.
  Public API should stay grouped by usage (`loading`, `toolbars`, `blockAndTable`, `layout`, `pulse`, `dialogsAndLifecycle`) instead of being flattened back into `EditorView.vue`.
  The block gutter is selection-driven: one controller owns target, anchor, visibility, menu pinning, and drag state so hover timing does not become a second source of truth.
- Session lifecycle/status/autosave/request token: `useEditorSessionLifecycle`
- Session status mutation bridge for session store + lifecycle emits: `useEditorSessionStatus`
- File load/save orchestration: `useEditorFileLifecycle`
- Caret snapshot/restore + debounced outline emission: `useEditorCaretOutline`
- Tiptap setup/hooks/link behavior: `useEditorTiptapSetup` (wikilinks, internal anchors, external links)
  The setup layer now also registers the embedded-note node view so `![[...]]` can render inline previews from the editor body.
- Async heavy node-render idle coordination: `renderStabilizer` (`src/lib/tiptap/renderStabilizer.ts`)
- Wikilink overlay state machine: `useEditorWikilinkOverlayState`
- Wikilink target/headings cache and resolve: `useEditorWikilinkDataSource`
- Slash descriptor insertion mapping: `useEditorSlashInsertion`
- Block gutter target/anchor/menu pinning: `useEditorBlockGutterController`
- Header title state and rename sync: `useEditorTitleState`
- Frontmatter generation, merge, and AI-assisted property actions: `useFrontmatterProperties`
- Block menu action derivation: `useBlockMenuControls`
- Table edge visibility + sticky timing: `useTableToolbarControls`
- Table toolbar/hover/action orchestration: `useEditorTableInteractions`
- Input routing (keydown/keyup/paste/contextmenu): `useEditorInputHandlers`
- Path/open-path watchers + mount lifecycle: `useEditorPathWatchers`
- Gutter hitbox/layout metrics + line counting: `useEditorLayoutMetrics`
- Mounted multi-instance session list for in-memory tab switching: `useEditorMountedSessions`
- Slash overlay rendering: `EditorSlashOverlay.vue`
- Wikilink overlay rendering: `EditorWikilinkOverlay.vue`
- Embedded note preview rendering: `NoteEmbedNodeView.vue`
- Block + table overlays rendering: `EditorContextOverlays.vue`
- Note history restore modal: `EditorNoteHistoryDialog.vue`

## Invariants
- `EditorView.vue` stays a shell; it wires runtimes and template, but does not own editor workflows directly.
- Cross-runtime coordination should happen through explicit runtime APIs, not ad-hoc local helpers in `EditorView.vue`.
- Runtime option contracts should stay grouped by responsibility (`input`, `session`, `ui`, `io`, `output`) rather than flat callback bags.
- Any save/load status mutation should flow through lifecycle composable APIs.
- Overlay wrappers must stay feature-scoped; avoid mega pass-through overlay components.
- Reactive `computed` values must be pure and must not mutate refs.
- Feature modules should expose at most 5 top-level dependencies; larger contracts must be grouped ports.
- `useEditorPersistence` is removed; do not reintroduce parallel lifecycle ownership.
- `useEditorWikilinkOverlayState` should be initialized before binding tiptap callbacks that invoke it.
- Editor content rendering is multi-instance and path-scoped; only active path is visible/interactable.
- Title and properties are owned by the Vue header; the TipTap body owns only persisted note content.
- AI-assisted property generation stays inside the frontmatter runtime and updates the same property state used by manual edits.
- Loading overlays for complex docs should remain visible until `waitForHeavyRenderIdle` settles after `setContent`.
- Overlay trigger is not size-only: heavy markdown complexity and runtime pending render signals can escalate loading UI for below-threshold files.

## Anti-patterns
- Re-introducing editor orchestration directly in `EditorView.vue`.
- Duplicated behavior in both `EditorView` and composables.
- No-op event forwarding (for example `@event="() => {}"`).
- Side effects inside `computed` functions.
- Monolithic input-handler signatures that mix unrelated feature concerns.
- Leaving dead transitional modules in tree (for example obsolete persistence abstractions).
- Setup-order coupling where callbacks dereference later-declared composable instances.
- Flat runtime contracts that re-expose technical callbacks instead of stable ports.
- Turning internal chrome sub-zones into new public APIs before there is a demonstrated ownership boundary.
- Re-flattening grouped chrome runtime APIs in `EditorView.vue` instead of consuming them by sub-system.
- Turning internal interaction flow zones into new public APIs before there is a demonstrated ownership boundary.
- Letting toolbar components perform note-creation or replacement work directly instead of routing through `useEditorInteractionRuntime`.
- Turning internal document runtime sub-zones into new public APIs before there is a demonstrated ownership boundary.
- Using Vue-only selectors (for example `:deep(...)`) in extracted plain CSS files.
- Hiding the large-document overlay before async heavy node views (Mermaid/tables) have settled.
