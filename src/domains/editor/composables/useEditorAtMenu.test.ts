import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/vue-3'
import { useEditorAtMenu } from './useEditorAtMenu'

function createEditor(text: string, nodeType = 'paragraph', marks: string[] = []) {
  const deleteRange = vi.fn().mockReturnThis()
  const insertContent = vi.fn().mockReturnThis()
  const run = vi.fn().mockReturnValue(true)
  const chain = {
    focus: vi.fn().mockReturnThis(),
    deleteRange,
    insertContent,
    run
  }

  const editor = {
    state: {
      selection: {
        empty: true,
        from: 12,
        to: 12,
        $from: {
          start: () => 1,
          end: () => text.length + 1,
          parentOffset: text.length,
          parent: {
            isTextblock: true,
            textContent: text,
            type: { name: nodeType }
          },
          marks: () => marks.map((name) => ({ type: { name } }))
        }
      }
    },
    view: {
      coordsAtPos: () => ({ left: 120, bottom: 200 })
    },
    chain: vi.fn(() => chain)
  } as unknown as Editor & { __test: { chain: typeof chain } }

  return { editor, chain }
}

describe('useEditorAtMenu', () => {
  it('detects @ trigger text and guards emails, code blocks, and inline code', () => {
    const menu = useEditorAtMenu({
      getEditor: () => null,
      currentTextSelectionContext: () => null,
      closeCompetingMenus: vi.fn(),
      getDocumentMetadata: () => ({ title: 'Note', path: 'notes/note.md' }),
      now: () => new Date(2026, 3, 12, 14, 32)
    })

    const entries = menu.atEntries.value
    expect(entries).toHaveLength(4)
    expect(entries[0]?.replacement).toBe('2026-04-12')

    const withEditor = useEditorAtMenu({
      getEditor: () => null,
      currentTextSelectionContext: () => ({ text: 'Send email@example.com', nodeType: 'paragraph', from: 1, to: 10, offset: 21 }),
      closeCompetingMenus: vi.fn(),
      getDocumentMetadata: () => ({ title: 'Note', path: 'notes/note.md' })
    })
    expect(withEditor.readAtContext()).toBeNull()

    const inlineCode = useEditorAtMenu({
      getEditor: () => null,
      currentTextSelectionContext: () => ({ text: 'Hello @today', nodeType: 'paragraph', from: 1, to: 12, offset: 12, marks: ['code'] }),
      closeCompetingMenus: vi.fn(),
      getDocumentMetadata: () => ({ title: 'Note', path: 'notes/note.md' })
    })
    expect(inlineCode.readAtContext()).toBeNull()

    const codeBlock = useEditorAtMenu({
      getEditor: () => null,
      currentTextSelectionContext: () => ({ text: '@today', nodeType: 'codeBlock', from: 1, to: 7, offset: 6 }),
      closeCompetingMenus: vi.fn(),
      getDocumentMetadata: () => ({ title: 'Note', path: 'notes/note.md' })
    })
    expect(codeBlock.readAtContext()).toBeNull()
  })

  it('keeps the trigger open for valid paragraph text and inserts the selected macro', () => {
    const { editor, chain } = createEditor('Draft @today')
    const menu = useEditorAtMenu({
      getEditor: () => editor,
      currentTextSelectionContext: () => ({
        text: 'Draft @today',
        nodeType: 'paragraph',
        from: 1,
        to: 13,
        offset: 12,
        marks: []
      }),
      closeCompetingMenus: vi.fn(),
      getDocumentMetadata: () => ({ title: 'Planning note', path: 'notes/planning.md' }),
      now: () => new Date(2026, 3, 12, 14, 32)
    })

    menu.markAtActivatedByUser()
    menu.syncAtMenuFromSelection()
    expect(menu.atOpen.value).toBe(true)
    expect(menu.visibleAtMacros.value.map((entry) => entry.id)).toContain('today')

    const applied = menu.insertAtMacro(menu.visibleAtMacros.value.find((entry) => entry.id === 'today')!)
    expect(applied).toBe(true)
    expect(chain.focus).toHaveBeenCalled()
    expect(chain.deleteRange).toHaveBeenCalledWith({ from: 7, to: 13 })
    expect(chain.insertContent).toHaveBeenCalledWith('2026-04-12')
    expect(chain.run).toHaveBeenCalled()
    expect(menu.atOpen.value).toBe(false)
  })

  it('closes when activation is lost or the trigger disappears', () => {
    const menu = useEditorAtMenu({
      getEditor: () => null,
      currentTextSelectionContext: () => null,
      closeCompetingMenus: vi.fn(),
      getDocumentMetadata: () => ({ title: 'Note', path: 'notes/note.md' })
    })

    menu.markAtActivatedByUser()
    menu.syncAtMenuFromSelection()
    expect(menu.atOpen.value).toBe(false)

    menu.dismissAtMenu()
    expect(menu.atActivatedByUser.value).toBe(false)
  })
})
