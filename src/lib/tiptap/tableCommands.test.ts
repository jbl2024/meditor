import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/vue-3'
import { applyTableAction } from './tableCommands'

type ChainStub = {
  focus: ReturnType<typeof vi.fn>
  addRowBefore: ReturnType<typeof vi.fn>
  addRowAfter: ReturnType<typeof vi.fn>
  deleteRow: ReturnType<typeof vi.fn>
  addColumnBefore: ReturnType<typeof vi.fn>
  addColumnAfter: ReturnType<typeof vi.fn>
  deleteColumn: ReturnType<typeof vi.fn>
  toggleHeaderRow: ReturnType<typeof vi.fn>
  toggleHeaderColumn: ReturnType<typeof vi.fn>
  toggleHeaderCell: ReturnType<typeof vi.fn>
  deleteTable: ReturnType<typeof vi.fn>
  run: ReturnType<typeof vi.fn>
}

function createEditorStub() {
  const chain: ChainStub = {
    focus: vi.fn(() => chain),
    addRowBefore: vi.fn(() => chain),
    addRowAfter: vi.fn(() => chain),
    deleteRow: vi.fn(() => chain),
    addColumnBefore: vi.fn(() => chain),
    addColumnAfter: vi.fn(() => chain),
    deleteColumn: vi.fn(() => chain),
    toggleHeaderRow: vi.fn(() => chain),
    toggleHeaderColumn: vi.fn(() => chain),
    toggleHeaderCell: vi.fn(() => chain),
    deleteTable: vi.fn(() => chain),
    run: vi.fn(() => true)
  }

  const editor = {
    chain: vi.fn(() => chain)
  } as unknown as Editor

  return { editor, chain }
}

describe('applyTableAction', () => {
  it('routes row/column/header/table commands through chain focus run', () => {
    const { editor, chain } = createEditorStub()

    applyTableAction(editor, 'add_row_before')
    applyTableAction(editor, 'add_row_after')
    applyTableAction(editor, 'delete_row')
    applyTableAction(editor, 'add_col_before')
    applyTableAction(editor, 'add_col_after')
    applyTableAction(editor, 'delete_col')
    applyTableAction(editor, 'toggle_header_row')
    applyTableAction(editor, 'toggle_header_col')
    applyTableAction(editor, 'toggle_header_cell')
    applyTableAction(editor, 'delete_table')

    expect(chain.focus).toHaveBeenCalledTimes(10)
    expect(chain.addRowBefore).toHaveBeenCalledTimes(1)
    expect(chain.addRowAfter).toHaveBeenCalledTimes(1)
    expect(chain.deleteRow).toHaveBeenCalledTimes(1)
    expect(chain.addColumnBefore).toHaveBeenCalledTimes(1)
    expect(chain.addColumnAfter).toHaveBeenCalledTimes(1)
    expect(chain.deleteColumn).toHaveBeenCalledTimes(1)
    expect(chain.toggleHeaderRow).toHaveBeenCalledTimes(1)
    expect(chain.toggleHeaderColumn).toHaveBeenCalledTimes(1)
    expect(chain.toggleHeaderCell).toHaveBeenCalledTimes(1)
    expect(chain.deleteTable).toHaveBeenCalledTimes(1)
    expect(chain.run).toHaveBeenCalledTimes(10)
  })

  it('returns false for unknown action id', () => {
    const { editor, chain } = createEditorStub()

    expect(applyTableAction(editor, 'unknown_action' as never)).toBe(false)
    expect(chain.focus).not.toHaveBeenCalled()
    expect(chain.run).not.toHaveBeenCalled()
  })
})
