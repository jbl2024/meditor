import type { Ref } from 'vue'

/** Snapshot representing cursor position in either contenteditable or text input blocks. */
export type EditorCaretSnapshot =
  | { kind: 'contenteditable'; blockIndex: number; offset: number }
  | { kind: 'text-input'; blockIndex: number; offset: number }

/**
 * Dependencies required by {@link useEditorCaret}.
 */
export type UseEditorCaretOptions = {
  holder: Ref<HTMLElement | null>
  caretByPath: Ref<Record<string, EditorCaretSnapshot>>
}

/**
 * useEditorCaret
 *
 * Purpose:
 * - Capture and restore caret position per path for EditorJS blocks.
 *
 * Responsibilities:
 * - Track caret inside contenteditable blocks and textarea/input-backed tools.
 * - Restore caret after re-render/load using block index + text offset snapshots.
 *
 * Invariants:
 * - `offset` is measured as plain text character count from editable root start.
 * - Only collapsed selections inside the current editor holder are persisted.
 */
export function useEditorCaret(options: UseEditorCaretOptions) {
  function textOffsetWithinRoot(selection: Selection, root: HTMLElement): number | null {
    if (!selection.rangeCount || !selection.isCollapsed) return null
    const node = selection.focusNode
    if (!node || !root.contains(node)) return null

    const range = document.createRange()
    range.selectNodeContents(root)
    range.setEnd(node, selection.focusOffset)
    return range.toString().length
  }

  /** Supported editable input controls where `selectionStart` is reliable. */
  function isTextEntryElement(element: HTMLElement): element is HTMLTextAreaElement | HTMLInputElement {
    if (element instanceof HTMLTextAreaElement) return true
    if (!(element instanceof HTMLInputElement)) return false
    const type = (element.type || 'text').toLowerCase()
    return ['text', 'search', 'url', 'tel', 'password', 'email', 'number'].includes(type)
  }

  /** Captures current caret for a path if selection is inside the editor holder. */
  function captureCaret(path: string) {
    if (!path || !options.holder.value) return
    const blocks = Array.from(options.holder.value.querySelectorAll('.ce-block')) as HTMLElement[]

    const activeElement = document.activeElement as HTMLElement | null
    if (activeElement && options.holder.value.contains(activeElement) && isTextEntryElement(activeElement)) {
      const block = activeElement.closest('.ce-block') as HTMLElement | null
      if (!block) return
      const blockIndex = blocks.indexOf(block)
      if (blockIndex < 0) return
      options.caretByPath.value = {
        ...options.caretByPath.value,
        [path]: {
          kind: 'text-input',
          blockIndex,
          offset: activeElement.selectionStart ?? 0
        }
      }
      return
    }

    const selection = window.getSelection()
    if (!selection || !selection.rangeCount || !selection.isCollapsed) return
    const node = selection.focusNode
    if (!node) return
    const parent = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
    const block = parent?.closest('.ce-block') as HTMLElement | null
    if (!block) return
    const blockIndex = blocks.indexOf(block)
    if (blockIndex < 0) return
    const editable = block.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (!editable) return
    const offset = textOffsetWithinRoot(selection, editable)
    if (offset === null) return

    options.caretByPath.value = {
      ...options.caretByPath.value,
      [path]: {
        kind: 'contenteditable',
        blockIndex,
        offset
      }
    }
  }

  return {
    captureCaret
  }
}
