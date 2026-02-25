import type EditorJS from '@editorjs/editorjs'
import type { OutputBlockData } from '@editorjs/editorjs'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorBlocks } from './useEditorBlocks'

function createEditableBlock(id: string, text: string) {
  const blockEl = document.createElement('div')
  blockEl.className = 'ce-block'
  blockEl.dataset.id = id

  const editable = document.createElement('div')
  editable.setAttribute('contenteditable', 'true')
  editable.innerText = text
  editable.focus = vi.fn()
  blockEl.appendChild(editable)

  return { blockEl, editable }
}

function createComposable(overrides: {
  editor?: EditorJS | null
  holder?: HTMLDivElement
  setSuppressOnChange?: (value: boolean) => void
  nextUiTick?: () => Promise<void>
} = {}) {
  const holder = overrides.holder ?? document.createElement('div')

  let editor = overrides.editor ?? null
  const setSuppressOnChange = overrides.setSuppressOnChange ?? vi.fn()
  const nextUiTick = overrides.nextUiTick ?? (vi.fn(async () => {}) as unknown as () => Promise<void>)

  const api = useEditorBlocks({
    holder: ref(holder),
    getEditor: () => editor,
    virtualTitleBlockId: '__virtual_title__',
    setSuppressOnChange,
    nextUiTick
  })

  return {
    api,
    setEditor: (next: EditorJS | null) => {
      editor = next
    },
    setSuppressOnChange,
    nextUiTick,
    holder
  }
}

describe('useEditorBlocks', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('replaces current block and falls back to DOM caret when EditorJS caret set fails', () => {
    const inserted = createEditableBlock('new-1', '')
    const fakeEditor = {
      blocks: {
        getCurrentBlockIndex: vi.fn(() => 0),
        insert: vi.fn(() => ({ id: 'new-1' })),
        getBlockByIndex: vi.fn(() => ({ id: 'new-1' })),
        getById: vi.fn(() => ({ holder: inserted.blockEl }))
      },
      caret: {
        setToBlock: vi.fn(() => false),
        focus: vi.fn()
      }
    } as unknown as EditorJS

    const { api } = createComposable({ editor: fakeEditor })

    const ok = api.replaceCurrentBlock('header', { text: '' })

    expect(ok).toBe(true)
    expect(fakeEditor.caret.setToBlock).toHaveBeenCalledWith('new-1', 'start')
    expect(inserted.editable.focus).toHaveBeenCalledTimes(1)
    expect(fakeEditor.caret.focus).not.toHaveBeenCalled()
  })

  it('inserts parsed markdown by replacing empty paragraph block', () => {
    const current = createEditableBlock('cur', '')
    const inserted = createEditableBlock('ins', '')

    const fakeEditor = {
      blocks: {
        getCurrentBlockIndex: vi.fn(() => 0),
        getBlockByIndex: vi.fn(() => ({ id: 'cur', name: 'paragraph', holder: current.blockEl })),
        insert: vi.fn(() => ({ id: 'ins' })),
        insertMany: vi.fn(),
        getById: vi.fn(() => ({ holder: inserted.blockEl }))
      },
      caret: {
        setToBlock: vi.fn(() => true),
        focus: vi.fn()
      }
    } as unknown as EditorJS

    const { api } = createComposable({ editor: fakeEditor })

    const parsed: OutputBlockData[] = [
      { id: 'a', type: 'paragraph', data: { text: 'one' } } as OutputBlockData,
      { id: 'b', type: 'paragraph', data: { text: 'two' } } as OutputBlockData
    ]

    api.insertParsedMarkdownBlocks(parsed)

    expect(fakeEditor.blocks.insert).toHaveBeenCalledWith('paragraph', { text: 'one' }, undefined, 0, true, true)
    expect(fakeEditor.blocks.insertMany).toHaveBeenCalledWith([parsed[1]], 1)
  })

  it('inserts parsed markdown after non-empty current paragraph', () => {
    const current = createEditableBlock('cur', 'existing text')
    const inserted = createEditableBlock('ins', '')

    const fakeEditor = {
      blocks: {
        getCurrentBlockIndex: vi.fn(() => 0),
        getBlockByIndex: vi.fn(() => ({ id: 'cur', name: 'paragraph', holder: current.blockEl })),
        insert: vi.fn(() => ({ id: 'ins' })),
        insertMany: vi.fn(),
        getById: vi.fn(() => ({ holder: inserted.blockEl }))
      },
      caret: {
        setToBlock: vi.fn(() => true),
        focus: vi.fn()
      }
    } as unknown as EditorJS

    const { api } = createComposable({ editor: fakeEditor })

    const parsed: OutputBlockData[] = [
      { id: 'a', type: 'paragraph', data: { text: 'one' } } as OutputBlockData,
      { id: 'b', type: 'paragraph', data: { text: 'two' } } as OutputBlockData
    ]

    api.insertParsedMarkdownBlocks(parsed)

    expect(fakeEditor.blocks.insert).toHaveBeenCalledWith('paragraph', { text: 'one' }, undefined, 1, true, false)
    expect(fakeEditor.blocks.insertMany).toHaveBeenCalledWith([parsed[1]], 2)
  })

  it('creates first content block at index 1 when only virtual title exists', async () => {
    const holder = document.createElement('div')
    const virtualBlock = document.createElement('div')
    virtualBlock.className = 'ce-block'
    virtualBlock.dataset.id = '__virtual_title__'
    holder.appendChild(virtualBlock)

    const inserted = createEditableBlock('new-p', '')
    const setSuppressOnChange = vi.fn()
    const nextUiTick = vi.fn(async () => {})

    const fakeEditor = {
      blocks: {
        insert: vi.fn(() => ({ id: 'new-p' })),
        getById: vi.fn(() => ({ holder: inserted.blockEl }))
      },
      caret: {
        setToBlock: vi.fn(() => true),
        focus: vi.fn()
      }
    } as unknown as EditorJS

    const { api } = createComposable({
      editor: fakeEditor,
      holder,
      setSuppressOnChange,
      nextUiTick
    })

    await api.focusFirstContentBlock()

    expect(setSuppressOnChange).toHaveBeenNthCalledWith(1, true)
    expect(fakeEditor.blocks.insert).toHaveBeenCalledWith('paragraph', { text: '' }, undefined, 1, true, false)
    expect(nextUiTick).toHaveBeenCalledTimes(1)
    expect(setSuppressOnChange).toHaveBeenLastCalledWith(false)
  })
})
