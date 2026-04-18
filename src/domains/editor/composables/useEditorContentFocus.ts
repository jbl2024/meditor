import type { Editor } from '@tiptap/vue-3'

/**
 * Owns deterministic body-editor focus placement helpers.
 *
 * Responsibilities:
 * - Restore generic editor focus when callers do not care about caret placement.
 */
export function useEditorContentFocus(options: {
  getEditor: () => Editor | null
}) {
  function focusEditor() {
    options.getEditor()?.commands.focus()
  }

  return {
    focusEditor
  }
}
