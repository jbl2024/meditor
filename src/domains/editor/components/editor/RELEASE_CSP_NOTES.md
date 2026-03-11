# Editor Release CSP Notes

This note documents a production-only editor issue seen on Linux builds and the fix applied in `tomosona`.

## Symptom

In development, wikilinks at the end of a list item or checklist item behaved normally.

In Linux production builds:

- a wikilink at the end of a list item could visually create a paragraph under the item,
- pressing `Enter` after that wikilink could stop creating the next list item correctly,
- the editor DOM showed `img.ProseMirror-separator` and `br.ProseMirror-trailingBreak` around the terminal wikilink,
- console logs showed CSP failures for Tauri IPC and stylesheet injection.

Example errors:

- `Refused to connect to ipc://localhost/... because it does not appear in the connect-src directive`
- `Refused to apply a stylesheet because ... it does not appear in the style-src directive`

## Root Cause

There were two overlapping issues.

### 1. Selected terminal wikilinks inside list items

`wikilink` is an inline atomic node in Tiptap/ProseMirror.

When a terminal wikilink was selected as a `NodeSelection`, `Enter` could fall back to default behavior instead of performing an explicit list split. That was fragile inside `listItem` and `taskItem`.

The fix was to:

- detect both `listItem` and `taskItem`,
- convert the selected wikilink from `NodeSelection` to a `TextSelection` immediately after the node,
- call `splitListItem(...)` explicitly.

This logic lives in:

- `src/domains/editor/lib/tiptap/plugins/wikilinkState.ts`

### 2. Release CSP blocked runtime-injected Tiptap CSS

Tiptap injects a small runtime stylesheet by default.

In release builds, the CSP blocked that injected `<style>` tag. Once that happened, core ProseMirror/Tiptap layout rules were missing, especially:

- `img.ProseMirror-separator { display: inline !important; width: 0 !important; height: 0 !important; }`
- `white-space` rules for `.ProseMirror`
- gap cursor styles

Without those rules, the editor could render terminal inline boundaries incorrectly, which made the list issue much easier to reproduce in production than in development.

The fix was to:

- disable runtime CSS injection with `injectCSS: false`,
- copy the required base ProseMirror/Tiptap rules into the app stylesheet,
- keep those rules in source control instead of relying on runtime `<style>` insertion.

Relevant files:

- `src/domains/editor/composables/useEditorTiptapSetup.ts`
- `src/domains/editor/components/editor/EditorViewContent.css`

## Tauri CSP Adjustment

The release logs also showed Tauri IPC being blocked by CSP when using `ipc://localhost`.

The release CSP was updated to allow:

- `connect-src 'self' ipc://localhost`

Relevant file:

- `src-tauri/tauri.conf.json`

## Why This Was Production-Only

Development and production do not exercise the same browser/runtime conditions.

In development:

- the app runs through the dev server,
- CSP pressure is lower,
- runtime style injection was not blocked,
- selection behavior was less likely to expose the broken edge case.

In production:

- the app uses the bundled frontend,
- the stricter CSP applied,
- Tiptap runtime CSS injection failed,
- WebKitGTK selection behavior exposed the terminal wikilink/list edge case more often.

## Local Reproduction

To test in production-like conditions on Linux, use the local release runner instead of `tauri dev`:

```bash
make tauri-prod-local
make tauri-prod-local-open-debug
```

These targets:

- build the production frontend,
- build the Tauri release binary without packaging,
- run the local release executable directly.

This is the closest local path to the bundled app without having to generate and launch a full installer for every iteration.

## Maintenance Rule

If Tiptap or CSP settings are changed later, verify all of the following in a local release run:

- no CSP errors for stylesheet injection,
- no CSP errors for `ipc://localhost`,
- terminal wikilinks inside bullet lists still split correctly on `Enter`,
- terminal wikilinks inside task lists still split correctly on `Enter`.
