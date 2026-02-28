import type { Editor } from '@tiptap/vue-3'
import type { TableActionId } from './tableToolbarActions'

/**
 * Applies a table toolbar action against the current editor selection.
 * Returns false for non-executable pseudo actions (merge/split disabled entries).
 */
export function applyTableAction(editor: Editor, actionId: TableActionId): boolean {
  if (actionId === 'add_row_before') return editor.chain().focus().addRowBefore().run()
  if (actionId === 'add_row_after') return editor.chain().focus().addRowAfter().run()
  if (actionId === 'delete_row') return editor.chain().focus().deleteRow().run()
  if (actionId === 'add_col_before') return editor.chain().focus().addColumnBefore().run()
  if (actionId === 'add_col_after') return editor.chain().focus().addColumnAfter().run()
  if (actionId === 'delete_col') return editor.chain().focus().deleteColumn().run()
  if (actionId === 'toggle_header_row') return editor.chain().focus().toggleHeaderRow().run()
  if (actionId === 'toggle_header_col') return editor.chain().focus().toggleHeaderColumn().run()
  if (actionId === 'toggle_header_cell') return editor.chain().focus().toggleHeaderCell().run()
  if (actionId === 'delete_table') return editor.chain().focus().deleteTable().run()
  return false
}
