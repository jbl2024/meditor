import type { Editor, JSONContent } from '@tiptap/vue-3'
import { editorDataToMarkdown, type EditorBlock } from './markdownBlocks'
import { fromTiptapDoc } from './tiptap/tiptapDocToEditorBlocks'

/**
 * Selection extraction helper for the editor.
 *
 * The extraction stays deliberately conservative: only block-complete slices
 * are accepted so the resulting markdown can be moved into a standalone note
 * without rewriting partial inline fragments.
 */
export type ExtractedSelection = {
  blocks: EditorBlock[]
  markdown: string
}

/**
 * Extracts the current editor selection as standalone markdown blocks.
 *
 * Returns `null` when the selection is empty or only covers a partial block.
 */
export function extractSelectedMarkdownBlocks(editor: Editor | null): ExtractedSelection | null {
  if (!editor) return null

  const selection = editor.state.selection
  if (!selection || selection.empty) return null

  const slice = selection.content()
  const fromBoundary = selection.$from.parentOffset === 0
  const toBoundary = selection.$to.parentOffset === selection.$to.parent.content.size
  if (!fromBoundary || !toBoundary) return null

  const content = slice.content.toJSON() as JSONContent[]
  const blocks = fromTiptapDoc({ type: 'doc', content })
  if (!blocks.length) return null

  return {
    blocks,
    markdown: editorDataToMarkdown({ blocks })
  }
}
