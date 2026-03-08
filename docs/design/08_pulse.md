# Pulse v1 Design

## Goal
Pulse is Tomosona's transformation layer. It converts explicit source material into a useful written output without acting as a general chat surface.

## Product role
- Editor: transforms selected text or the current note.
- Second Brain: transforms the explicit note context already assembled there.
- Cosmos: transforms one selected node plus its current visible neighborhood.

Pulse does not replace:
- Cosmos exploration
- Echoes retrieval
- Second Brain conversation/stateful deliberation

## Problem to fix
The previous editor Pulse flow was too eager and too technical:
- choosing an action launched the transformation immediately
- the user could not refine the prompt before generation
- raw markdown was shown as the main output
- apply actions were visible before a valid preview existed

That flow broke trust and interrupted editing.

## Product principle
- Choosing is not running.
- Generating is not applying.
- Pulse suggests, previews, then applies.

## Runtime architecture
- Backend implementation reuses `src-tauri/src/second_brain` runtime pieces:
  - config/profile resolution
  - provider/model execution
  - streaming and cancellation plumbing
  - workspace path normalization
- Pulse does not persist its own sessions or drafts in v1.
- Persistent output continues through the existing Second Brain session/draft flow when needed.

## API contract
- Command: `run_pulse_transformation`
- Cancel command: `cancel_pulse_stream`
- Stream events:
  - `pulse://start`
  - `pulse://delta`
  - `pulse://complete`
  - `pulse://error`

Request fields:
- `source_kind`
- `action_id`
- optional `instructions`
- explicit `context_paths`
- optional `source_text`
- optional `selection_label`
- optional `session_id`
- optional Cosmos metadata

## Action set
Initial actions:
- `rewrite`
- `condense`
- `expand`
- `change_tone`
- `synthesize`
- `outline`
- `brief`
- `extract_themes`
- `identify_tensions`

Prompt constraints:
- operate only on supplied material
- no implicit retrieval
- markdown output
- surface uncertainty when source material is incomplete

## Editor v1 scope
This iteration changes Pulse in the editor only.

Included:
- selection-driven Pulse panel in the editor
- editable prompt before generation
- rendered preview instead of raw markdown as the primary view
- local read-only diff for text transformations
- keyboard shortcuts for generate, apply, and close

Not included:
- prompt synchronization across surfaces
- Pulse-specific persistence
- backend contract changes
- advanced merge UI
- complex markdown-aware diffing

## UX model
Editor Pulse follows a strict state machine:

### Configure
Shown when no request is running and no preview exists.

Visible UI:
- action selector
- editable prompt field prefilled from the selected action description
- helper text clarifying that nothing changes until apply
- primary CTA: `Generate`

Hidden UI:
- apply actions

### Running
Shown while the transformation is streaming.

Visible UI:
- disabled action and prompt controls
- loading preview shell
- CTA: `Cancel`

Behavior:
- streaming output remains the source of truth
- the user can cancel at any time

### Result
Shown when a non-empty preview exists and streaming is finished.

Visible UI:
- preview tabs
  - text actions: `Diff`, `Preview`, `Markdown`
  - all other actions: `Preview`, `Markdown`
- apply actions
- primary CTA becomes `Regenerate`

Preview rules:
- `rewrite`, `condense`, `expand`, `change_tone`: default to diff when source text exists
- all other actions: default to rendered markdown preview
- `Markdown` stays available as a fallback

### Error
Shown when generation fails and no request is running.

Visible UI:
- preserved prompt field
- error message in the preview area
- CTA: `Generate` for retry

## CTA rules
- `Generate` is visible in `configure`, `error`, and `result` as a regenerate action.
- `Cancel` is visible only in `running`.
- `Replace selection`, `Insert below`, and `Send to Second Brain` are visible only in `result`.
- No apply action is shown before a valid preview exists.

## Prompt behavior
- The action description is the default prompt for v1.
- When the panel opens, the prompt is initialized from the active action.
- If the user changes the action before touching the prompt, the prompt updates automatically.
- If the user already edited the prompt, changing the action preserves the custom text.
- If action, prompt, or source selection changes after a preview exists, the preview is invalidated and Pulse returns to `configure`.

## Keyboard behavior
- `Enter` in the prompt generates the preview.
- `Shift+Enter` inserts a newline in the prompt.
- `Cmd+Enter` applies the primary action only in `result`.
- `Esc` closes Pulse without modifying the document.

Primary apply action:
- editor selection: `Replace selection`
- note-level editor Pulse: `Insert below`

## Preview behavior
- Preview is always read-only in v1.
- The main view is never raw markdown unless the user explicitly switches to `Markdown` or the rendered preview cannot be produced.
- Rendered preview uses a safe frontend markdown renderer with a limited supported subset:
  - headings
  - paragraphs
  - bullet and ordered lists
  - blockquotes
  - fenced code blocks
  - simple emphasis, strong, inline code, and safe links
- Unsupported markdown falls back to readable text instead of breaking the panel.

## Diff behavior
- Diff is local, read-only, and text-based.
- Granularity is word/token level.
- Removed content is struck through.
- Added content is highlighted.
- Diff is not markdown-aware and does not attempt conflict resolution.

## Provenance
- Pulse reports the explicit note paths used for the transformation.
- Provenance is shown as concise source metadata, not mandatory inline citation formatting.

## v1 scope limits
- No Pulse-specific saved workspace state
- No autonomous retrieval
- No multi-select Cosmos workflow
- No direct long-form authoring surface in Cosmos
- No shared cross-surface prompt state
- No advanced diff engine
