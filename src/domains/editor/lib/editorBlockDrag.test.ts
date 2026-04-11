import { describe, expect, it, vi } from 'vitest'
import { NodeSelection } from '@tiptap/pm/state'
import { beginEditorBlockDrag } from './editorBlockDrag'

describe('beginEditorBlockDrag', () => {
  it('starts a drag from the exact gutter target range', () => {
    const dragImageSource = document.createElement('div')
    const selection = { from: 5, to: 9 } as NodeSelection
    const createSelectionSpy = vi.spyOn(NodeSelection, 'create').mockReturnValue(selection)
    const setSelection = vi.fn((nextSelection: NodeSelection) => nextSelection)
    const dispatch = vi.fn()
    const target = {
      pos: 5,
      nodeSize: 4,
      nodeType: 'paragraph',
      canDelete: true,
      canConvert: true,
      text: 'Body'
    }
    const editor = {
      state: {
        doc: {
          nodeAt: vi.fn(() => ({ nodeSize: 4 })),
          slice: vi.fn(() => 'slice')
        },
        tr: {
          setSelection
        }
      },
      view: {
        dragging: null,
        dispatch,
        nodeDOM: vi.fn(() => dragImageSource)
      }
    } as any
    const event = new Event('dragstart') as DragEvent
    Object.defineProperty(event, 'dataTransfer', {
      configurable: true,
      value: {
        clearData: vi.fn(),
        setDragImage: vi.fn(),
        effectAllowed: 'all'
      }
    })

    const started = beginEditorBlockDrag({ event, editor, target })

    expect(started).toBe(true)
    expect(createSelectionSpy).toHaveBeenCalledWith(editor.state.doc, 5)
    expect(setSelection).toHaveBeenCalledTimes(1)
    expect(setSelection).toHaveBeenCalledWith(selection)
    expect(editor.view.dragging).toMatchObject({
      slice: 'slice',
      move: true
    })
    expect(editor.view.dragging.node).toBe(selection)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})
