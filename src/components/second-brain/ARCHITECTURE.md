# Second Brain Component Architecture

## Scope
This folder contains the modular frontend surface for the Second Brain view.

## Components
- `SecondBrainView.vue`: top-level three-column layout and orchestration.
- `SecondBrainContextPanel.vue`: active context controls and note inclusion.
- `SecondBrainSessionsList.vue`: persisted session history with quick filtering.
- `SecondBrainDeliberationPanel.vue`: message thread + mode selector + send box.
- `SecondBrainModeSelector.vue`: isolated mode switch contract.
- `SecondBrainOutputsPanel.vue`: draft editor and publish actions.

## State & Services
- State is centralized in composables under `src/composables/useSecondBrain*`.
- Backend calls are isolated in `src/lib/secondBrainApi.ts`.
- Modes contract is declared in `src/lib/secondBrainModes.ts`.

## Design constraints
- Keep `App.vue` as integration shell only.
- Keep all LLM/network logic in Tauri backend.
- Use explicit context and no implicit cross-session memory.
