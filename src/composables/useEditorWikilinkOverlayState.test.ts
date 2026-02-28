import { ref } from 'vue'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TextSelection } from '@tiptap/pm/state'
import { useEditorWikilinkOverlayState } from './useEditorWikilinkOverlayState'

const getWikilinkPluginStateMock = vi.fn()
const parseWikilinkTokenMock = vi.fn()

vi.mock('../lib/tiptap/plugins/wikilinkState', async () => {
  const mod = await vi.importActual('../lib/tiptap/plugins/wikilinkState')
  return {
    ...mod,
    getWikilinkPluginState: (...args: unknown[]) => getWikilinkPluginStateMock(...args)
  }
})

vi.mock('../lib/tiptap/extensions/wikilinkCommands', async () => {
  const mod = await vi.importActual('../lib/tiptap/extensions/wikilinkCommands')
  return {
    ...mod,
    parseWikilinkToken: (...args: unknown[]) => parseWikilinkTokenMock(...args)
  }
})

function createEditor() {
  const dispatch = vi.fn()
  const tr = {
    setMeta: vi.fn(() => tr),
    insertText: vi.fn(() => tr),
    setSelection: vi.fn(() => tr),
    replaceWith: vi.fn(() => tr),
    doc: { content: { size: 200 } }
  }
  const editor = {
    state: {
      selection: { from: 30, to: 30 },
      tr,
      doc: {
        textBetween: vi.fn(() => '[[a]]'),
        content: { size: 200 }
      },
      schema: {
        nodes: {
          wikilink: {
            create: vi.fn(() => ({ nodeSize: 4 }))
          }
        }
      }
    },
    view: {
      dispatch,
      coordsAtPos: vi.fn(() => ({ left: 100, bottom: 120 }))
    }
  }
  return { editor, dispatch, tr }
}

describe('useEditorWikilinkOverlayState', () => {
  beforeEach(() => {
    getWikilinkPluginStateMock.mockReset()
    parseWikilinkTokenMock.mockReset()
  })

  it('opens and maps plugin editing candidates', () => {
    const { editor } = createEditor()
    const closeBlockMenu = vi.fn()
    getWikilinkPluginStateMock.mockReturnValue({
      open: true,
      mode: 'editing',
      editingRange: { from: 20, to: 40 },
      selectedIndex: 1,
      candidates: [{ target: 'foo', label: 'Foo', isCreate: false }]
    })

    const wikilink = useEditorWikilinkOverlayState({
      getEditor: () => editor as any,
      holder: ref(document.createElement('div')),
      blockMenuOpen: ref(true),
      isDragMenuOpen: () => false,
      closeBlockMenu
    })

    wikilink.syncWikilinkUiFromPluginState()

    expect(wikilink.wikilinkOpen.value).toBe(true)
    expect(wikilink.wikilinkIndex.value).toBe(1)
    expect(wikilink.wikilinkResults.value).toEqual([{ id: 'existing:foo', label: 'Foo', target: 'foo', isCreate: false }])
    expect(closeBlockMenu).toHaveBeenCalled()
  })

  it('syncs overlay index back to plugin state', () => {
    const { editor, dispatch } = createEditor()
    getWikilinkPluginStateMock.mockReturnValue({ open: false, mode: 'idle' })
    const wikilink = useEditorWikilinkOverlayState({
      getEditor: () => editor as any,
      holder: ref(document.createElement('div')),
      blockMenuOpen: ref(false),
      isDragMenuOpen: () => false,
      closeBlockMenu: () => {}
    })

    wikilink.onWikilinkMenuIndexUpdate(2)

    expect(wikilink.wikilinkIndex.value).toBe(2)
    expect(dispatch).toHaveBeenCalled()
    expect((editor.state.tr.setMeta as any).mock.calls.at(-1)?.[1]).toEqual({ type: 'setSelectedIndex', index: 2 })
  })

  it('closes menu when editor is unavailable', () => {
    const wikilink = useEditorWikilinkOverlayState({
      getEditor: () => null,
      holder: ref(document.createElement('div')),
      blockMenuOpen: ref(false),
      isDragMenuOpen: () => false,
      closeBlockMenu: () => {}
    })

    wikilink.wikilinkOpen.value = true
    wikilink.wikilinkResults.value = [{ id: 'x', label: 'X', target: 'x', isCreate: false }]
    wikilink.syncWikilinkUiFromPluginState()

    expect(wikilink.wikilinkOpen.value).toBe(false)
    expect(wikilink.wikilinkResults.value).toEqual([])
  })

  it('preserves alias when selecting a candidate and annotates create label', () => {
    const selectionSpy = vi.spyOn(TextSelection, 'create').mockReturnValue({} as any)
    const { editor, tr } = createEditor()
    ;(editor.state.doc.textBetween as any).mockReturnValue('[[Another.md|alias]]')
    getWikilinkPluginStateMock.mockReturnValue({
      open: true,
      mode: 'editing',
      editingRange: { from: 20, to: 40 },
      selectedIndex: 0,
      candidates: [{ target: 'Another.md', label: 'Create "Another.md"', isCreate: true }]
    })

    const wikilink = useEditorWikilinkOverlayState({
      getEditor: () => editor as any,
      holder: ref(document.createElement('div')),
      blockMenuOpen: ref(false),
      isDragMenuOpen: () => false,
      closeBlockMenu: () => {}
    })

    wikilink.syncWikilinkUiFromPluginState()
    expect(wikilink.wikilinkResults.value).toEqual([
      {
        id: 'create:Another.md',
        label: 'Create "Another.md" as "alias"',
        target: 'Another.md',
        isCreate: true
      }
    ])

    wikilink.onWikilinkMenuSelect('Another.md')
    expect((tr.insertText as any).mock.calls.at(-1)).toEqual(['[[Another.md|alias]]', 20, 40])
    selectionSpy.mockRestore()
  })
})
