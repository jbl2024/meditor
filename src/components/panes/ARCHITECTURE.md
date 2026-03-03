# Multi-Pane Editor Architecture

## Scope
This module provides a VS Code-style multi-pane editor shell for file notes.

## Data Model
- `MultiPaneLayout` stores `root` split tree, `panesById`, and `activePaneId`.
- `SplitNode` is either:
  - `{ kind: 'pane', paneId }`
  - `{ kind: 'split', axis, a, b, ratio: 0.5 }`

## Key Invariants
- Maximum 4 panes.
- Exactly one active pane at any time.
- A file path can exist in at most one pane at a time.
- Splitting a pane creates an empty pane (no path cloning) to preserve uniqueness.
- Split ratio is fixed to `0.5` in MVP for predictable rendering and simpler maintenance.

## UI Composition
- `EditorPaneGrid.vue` renders panes from the layout and mounts one `EditorView` per pane.
- `EditorPaneTabs.vue` renders pane-local tabs and pane-local tab actions.
- `MultiPaneToolbarMenu.vue` exposes split/focus/move/reset actions in the top toolbar.

## Command Flow
1. UI emits user intent (`split`, `focus`, `move tab`, `close pane`, `reset`).
2. `useMultiPaneWorkspaceState` mutates layout state while enforcing invariants.
3. App reacts to path changes (open/save/history) against active pane.
4. Session snapshot is persisted in `sessionStorage` and restored on reload.

## Persistence
- Storage key: `tomosona:editor:multi-pane:v1`.
- Persist only serializable layout state (no editor instances).
- Hydration validates shape and constraints; invalid payload falls back to one pane.

## KISS Rationale
- No manual splitter drag in MVP.
- No duplicate file across panes in MVP.
- No tab drag across panes in MVP (explicit move command only).
- `Join panes` merges all unique tabs into one pane and keeps the active path when possible.
