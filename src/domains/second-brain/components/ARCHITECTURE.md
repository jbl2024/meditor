# Second Brain Component Architecture

## Scope
This folder contains the modular frontend surface for the Second Brain view.

## Components
- `SecondBrainView.vue`: render shell for the chat surface.
- `SecondBrainSessionDropdown.vue`: quick session switch/create/delete from the header.
- `SecondBrainAtMentionsMenu.vue`: inline `@` suggestion list for context picks.

## State & Services
- `useSecondBrainViewState.ts` owns session loading, explicit context updates,
  assistant streaming, copy/export helpers, Pulse prompt presets, and
  mention-driven context orchestration.
- `SecondBrainView.vue` should only bind props, emits, and render the surface.
- Backend calls are isolated in `src/domains/second-brain/lib/secondBrainApi.ts`.
- Modes contract is declared in `src/domains/second-brain/lib/secondBrainModes.ts`.
- `useSecondBrainAtMentions` resolves inline `@relative/path.md` mentions and extracts context paths before send.
- Alter sampling temperature is resolved in the backend from the active Alter record and falls back to `0.15` when no Alter is selected, so the neutral/default Second Brain path stays deterministic.

## Design constraints
- Keep `App.vue` as integration shell only.
- Keep all LLM/network logic in Tauri backend.
- Use explicit context and no implicit cross-session memory.
- Do not auto-resume the latest session on pane open; session restore must be explicit.
- Do not reintroduce direct backend API calls or stream subscriptions into `SecondBrainView.vue`.
