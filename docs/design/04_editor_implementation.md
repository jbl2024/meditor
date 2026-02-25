# Design Document

EditorView Implementation
Local-First Knowledge Environment
(Tauri 2 + Vue 3)

## 1. Purpose

This document explains the architecture of `EditorView` as the frontend integration layer of the editor.

Goals:

- Clarify why `EditorView` exists and what it is responsible for.
- Describe how behavior is split across composables.
- Keep implementation understandable for refactoring, testing, and onboarding.

Non-goal:

- Describing every internal branch or low-level utility detail.

## 2. Why This Architecture

`EditorView` has to coordinate multiple concerns around one EditorJS instance:

- document lifecycle (open/reload/render)
- save/autosave flow
- frontmatter properties
- interaction features (slash menu, wikilinks, shortcuts)
- UI overlays/dialogs

Keeping all of this directly in one component would be hard to read and hard to test. The architecture therefore separates:

- orchestration in `EditorView`
- stateful domain behaviors in composables
- static registries/config in dedicated modules

This keeps behavior focused and unit-testable while preserving one clear integration point.

## 3. High-Level Responsibilities of EditorView

`EditorView` is intentionally an orchestrator.

It should:

- own the EditorJS instance lifecycle
- wire composables together
- connect UI events to behavior APIs
- expose imperative methods to parent components (`saveNow`, `reloadCurrent`, zoom/reveal helpers)

It should not:

- contain large domain algorithms
- duplicate logic that can live in composables
- embed large static configuration blobs

## 4. Architecture Overview

```text
+--------------------+
| Parent container   |
| (workspace/shell)  |
+---------+----------+
          |
          v
+------------------------------+
|          EditorView          |
|  Integration + orchestration |
+----+-----------+-------------+
     |           |
     |           +---------------------> UI subcomponents
     |                                     - Properties panel
     |                                     - Slash menu
     |                                     - Wikilink menu
     |                                     - Large-doc overlay
     |                                     - Mermaid confirm dialog
     |
     +-------------------------------> Composables (stateful behavior)
                                       - lifecycle, save, interactions,
                                         persistence, frontmatter, etc.

External boundaries:
- File and schema operations enter through typed props (frontend service wrappers)
- EditorJS tools registry is provided by dedicated module
```

## 5. Main Runtime Flows

### 5.1 Load Flow

```text
[path changes]
   -> ensure editor instance
   -> load file content
   -> parse frontmatter + body
   -> convert markdown body to blocks
   -> render blocks
   -> restore scroll/caret
   -> emit outline/properties state
```

### 5.2 Edit/Autosave Flow

```text
[editor change]
   -> mark document dirty
   -> clear previous save error
   -> schedule autosave
   -> refresh outline (debounced)
```

### 5.3 Save Flow

```text
[manual save or autosave trigger]
   -> read EditorJS blocks
   -> resolve virtual title/rename when needed
   -> serialize frontmatter + markdown body
   -> persist via saveFile prop
   -> update in-memory path/document state
   -> emit status + outline/properties refresh
```

## 6. Composables Map (What / Why / How)

### `useEditorInstance`

- What: owns creation/destruction of EditorJS and DOM listener wiring.
- Why: isolates risky lifecycle code from feature logic.
- How: receives callbacks and hooks from `EditorView` (on change, observers, cleanup actions).

### `useEditorDocumentLifecycle`

- What: coordinates open/reload pipeline and large-document loading state.
- Why: load complexity grows quickly and should be testable without UI templates.
- How: orchestrates parse/convert/render steps via injected functions.

### `useEditorSaveLifecycle`

- What: central save pipeline, including title-based rename and markdown composition.
- Why: save correctness is critical and benefits from concentrated tests.
- How: consumes editor-data getters and serializer callbacks, returns save API.

### `useEditorPersistence`

- What: per-path state maps (dirty, saving, loaded text, caret, scroll).
- Why: path-scoped state must survive navigation and renames.
- How: generic map-based state with explicit move operations for rename flows.

### `useFrontmatterProperties`

- What: properties/frontmatter editor state (structured + raw modes).
- Why: metadata editing has separate validation/type concerns from body editing.
- How: parses/stores frontmatter state, persists schema via injected APIs, emits normalized property payloads.

### `useEditorInteraction`

- What: keyboard/mouse/paste/contextmenu interaction orchestration.
- Why: interaction rules are dense and hard to maintain inline.
- How: pure handler composition with injected editor and feature callbacks.

### `useWikilinkBehavior`

- What: wikilink menu state and link-open behavior.
- Why: wikilink UX has async target loading + selection sync edge cases.
- How: tracks menu/caret state and delegates opening/navigation through provided APIs.

### `useVirtualTitleBehavior`

- What: virtual title block policy and title extraction rules.
- Why: title semantics affect both rendering and save/rename behavior.
- How: exposes helpers to inject/remove/read virtual title around block arrays.

### `useEditorBlocks`

- What: block-level operations around current selection/caret.
- Why: block mutations should be reusable by multiple interactions.
- How: provides replacement/insertion/focus utilities over current EditorJS block context.

### `useEditorOutlineNavigation`

- What: outline extraction and heading/snippet reveal helpers.
- Why: keeps document navigation logic separate from editor orchestration.
- How: parses rendered DOM headings and offers normalized anchor/block navigation helpers.

### `useCodeBlockUi`

- What: code-block enhancement observers and persisted display prefs.
- Why: code UI polish should not pollute core editor lifecycle code.
- How: starts/stops observers around editor lifecycle, restores UI prefs from storage.

### `useEditorCaret`

- What: capture/restore caret snapshots by path.
- Why: preserving editing position is key for multi-file workflows.
- How: stores/restores position with holder-aware helpers.

### `useEditorZoom`

- What: zoom state + style binding + persistence.
- Why: keeps visual scaling concern independent from editing logic.
- How: exposes style object and imperative zoom APIs for component and parent use.

### `useMermaidReplaceDialog`

- What: async confirm-dialog state for Mermaid template replacement.
- Why: avoids embedding transient promise-resolution state in `EditorView`.
- How: returns request/resolve methods and guards race conditions by resolving older pending confirmations.

## 7. Extracted Static Modules

### `editorTools`

- What: EditorJS tools registry factory.
- Why: large static config is noisy inside orchestration code.
- How: one function builds tool map and injects Mermaid confirm callback.

### `editorSlashCommands`

- What: slash menu command registry.
- Why: command metadata is static, reusable, and testable in isolation.
- How: exported typed constant plus small payload helpers.

## 8. Testing Strategy

Testing follows the architecture split:

- Unit tests for composables and registries (pure behavior focus).
- Smoke wiring test for `EditorView` to validate mount + exposed API contract.

This keeps confidence high while avoiding brittle full DOM integration tests for every interaction path.

## 9. Extensibility Guidelines

When adding a new editor feature:

1. Keep `EditorView` as orchestration-only.
2. Prefer a composable for stateful/branch-heavy behavior.
3. Prefer dedicated module for large static config/data.
4. Define explicit inputs/outputs for the composable (dependency injection).
5. Add unit tests near the composable/module before wiring into `EditorView`.

## 10. Tradeoffs and Current Limits

- Many composables increase file count and require disciplined naming.
- `EditorView` still has integration complexity because it is the composition root.
- Some cross-feature coupling remains around editor events and shared per-path state.

These tradeoffs are acceptable for maintainability because behavior stays isolated and testable.

## 11. Summary

`EditorView` is the editor composition root, not the place for deep business logic. The design intentionally pushes behavior into composables and static registries so the system remains readable, testable, and extensible as editing features grow.
