import type { Ref } from 'vue'
import { toPersistedTextSelection } from '../lib/tiptap/selectionSnapshot'
import type { DocumentSession } from './useDocumentEditorSessions'
import type { EditorHeadingNode } from './useEditorNavigation'

/**
 * Module: useEditorCaretOutline
 *
 * Groups caret snapshot/restore and debounced outline emission helpers.
 */

/**
 * Dependencies required by {@link useEditorCaretOutline}.
 */
export type UseEditorCaretOutlineOptions = {
  currentPath: Ref<string>
  getSession: (path: string) => DocumentSession | null
  getEditor: () => {
    state: {
      selection: unknown
      doc: { content: { size: number } }
    }
    commands: { setTextSelection: (range: { from: number; to: number }) => void }
  } | null
  emitOutline: (payload: { path: string; headings: EditorHeadingNode[] }) => void
  parseOutlineFromDoc: () => EditorHeadingNode[]
  outlineDelayMs?: number
}

/**
 * Creates caret/outline helpers for an EditorView path session.
 *
 * Side effects:
 * - Mutates session caret and outline timer fields.
 * - Emits outline payloads after debounce.
 */
export function useEditorCaretOutline(options: UseEditorCaretOutlineOptions) {
  const outlineDelayMs = options.outlineDelayMs ?? 120

  function captureCaret(path: string) {
    const editor = options.getEditor()
    if (!editor || !path) return
    const session = options.getSession(path)
    if (!session) return
    const snapshot = toPersistedTextSelection(editor.state.selection as never)
    session.caret = { kind: 'pm-selection', from: snapshot.from, to: snapshot.to }
  }

  function clearOutlineTimer(path: string) {
    const session = options.getSession(path)
    if (!session || !session.outlineTimer) return
    clearTimeout(session.outlineTimer)
    session.outlineTimer = null
  }

  /**
   * Debounces outline emits and ignores stale path transitions.
   */
  function emitOutlineSoon(path: string) {
    const session = options.getSession(path)
    if (!session) return
    clearOutlineTimer(path)
    session.outlineTimer = setTimeout(() => {
      if (options.currentPath.value !== path) return
      options.emitOutline({ path, headings: options.parseOutlineFromDoc() })
    }, outlineDelayMs)
  }

  return {
    captureCaret,
    clearOutlineTimer,
    emitOutlineSoon
  }
}
