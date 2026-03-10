import type { Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { Selection, TextSelection } from '@tiptap/pm/state'

/**
 * Owns deterministic body-editor focus placement helpers.
 *
 * Responsibilities:
 * - Restore generic editor focus when callers do not care about caret placement.
 * - Move caret to the first editable block and ensure one exists when the body is empty.
 */
export function useEditorContentFocus(options: {
  holder: Ref<HTMLDivElement | null>
  getEditor: () => Editor | null
}) {
  function focusEditor() {
    options.getEditor()?.commands.focus()
  }

  function nodeHasEditableDescendant(node: { isTextblock: boolean; descendants?: (fn: (child: { isTextblock: boolean }) => boolean | void) => void }) {
    if (node.isTextblock) return true
    let editable = false
    node.descendants?.((child) => {
      if (!child.isTextblock) return
      editable = true
      return false
    })
    return editable
  }

  function ensureLeadingEditableBlock(editor: Editor) {
    const firstBlock = editor.state.doc.firstChild
    if (firstBlock && nodeHasEditableDescendant(firstBlock)) return

    const paragraph = editor.state.schema.nodes.paragraph?.create()
    if (!paragraph) return
    editor.view.dispatch(editor.state.tr.insert(0, paragraph))
  }

  function firstEditableSelection(editor: Editor): Selection | null {
    const { doc } = editor.state
    const maxPos = Math.max(0, doc.content.size)
    let selection: Selection | null = null

    doc.descendants((node, pos) => {
      if (selection) return false
      if (!node.isTextblock) return
      const targetPos = Math.min(Math.max(1, pos + 1), maxPos)
      selection = TextSelection.create(doc, targetPos)
      return false
    })

    return selection
  }

  function focusFirstEditableBlock() {
    const editor = options.getEditor()
    if (!editor) return

    ensureLeadingEditableBlock(editor)
    const selection = firstEditableSelection(editor)
    if (!selection) return

    editor.view.dispatch(editor.state.tr.setSelection(selection))
    try {
      editor.view.dom.focus({ preventScroll: true })
    } catch {
      editor.view.dom.focus()
    }
    if (options.holder.value) {
      options.holder.value.scrollTop = 0
    }
  }

  return {
    focusEditor,
    focusFirstEditableBlock
  }
}
