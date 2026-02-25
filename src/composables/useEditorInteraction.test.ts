import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useEditorInteraction } from './useEditorInteraction'

function createInteraction(overrides: Partial<Parameters<typeof useEditorInteraction>[0]> = {}) {
  const holder = document.createElement('div')
  document.body.appendChild(holder)

  const block = document.createElement('div')
  block.className = 'ce-block'
  block.dataset.id = 'block-1'
  const editable = document.createElement('div')
  editable.contentEditable = 'true'
  editable.innerText = ''
  block.appendChild(editable)
  holder.appendChild(block)

  const editor = {
    blocks: {
      getCurrentBlockIndex: vi.fn(() => 1)
    }
  }

  const options: Parameters<typeof useEditorInteraction>[0] = {
    getEditor: () => editor as unknown as never,
    currentPath: ref('notes/test.md'),
    wikilinkOpen: ref(false),
    wikilinkIndex: ref(0),
    wikilinkResults: ref([{ id: '1', label: 'One', target: 'Notes/One', isCreate: false }]),
    slashOpen: ref(false),
    slashIndex: ref(0),
    slashCommands: [{ id: 'p', label: 'Paragraph', type: 'paragraph', data: { text: '' } }],
    virtualTitleBlockId: '__virtual_title__',
    getCurrentBlock: vi.fn(() => ({ id: 'block-1', name: 'paragraph', holder: block })),
    getCurrentBlockText: vi.fn(() => ''),
    isCurrentBlockEmpty: vi.fn(() => true),
    replaceCurrentBlock: vi.fn(() => true),
    insertParsedMarkdownBlocks: vi.fn(),
    closeSlashMenu: vi.fn(),
    closeWikilinkMenu: vi.fn(),
    applyWikilinkSelection: vi.fn(async () => {}),
    applyWikilinkDraftSelection: vi.fn(async () => {}),
    expandAdjacentLinkForEditing: vi.fn(() => false),
    consumeSuppressCollapseOnArrowKeyup: vi.fn(() => false),
    collapseExpandedLinkIfCaretOutside: vi.fn(() => false),
    collapseClosedLinkNearCaret: vi.fn(() => false),
    shouldSyncWikilinkFromSelection: vi.fn(() => false),
    isWikilinkRelevantKey: vi.fn(() => false),
    syncWikilinkMenuFromCaret: vi.fn(async () => {}),
    readWikilinkTargetFromAnchor: vi.fn(() => ''),
    openLinkTargetWithAutosave: vi.fn(async () => {}),
    isDateLinkModifierPressed: vi.fn(() => false),
    openLinkedTokenAtCaret: vi.fn(async () => {}),
    zoomEditorBy: vi.fn(),
    resetEditorZoom: vi.fn(),
    sanitizeExternalHref: vi.fn(() => null),
    openExternalUrl: vi.fn(async () => {}),
    markdownToEditorData: vi.fn(() => ({ blocks: [] })),
    captureCaret: vi.fn(),
    ...overrides
  }

  return {
    api: useEditorInteraction(options),
    options,
    block,
    holder
  }
}

describe('useEditorInteraction', () => {
  it('handles zoom-in shortcut on keydown', () => {
    const { api, options } = createInteraction()
    const preventDefault = vi.fn()

    api.onEditorKeydown({
      key: '+',
      code: '',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      target: document.createElement('div'),
      preventDefault,
      stopPropagation: vi.fn()
    } as unknown as KeyboardEvent)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(options.zoomEditorBy).toHaveBeenCalledWith(0.1)
  })

  it('navigates wikilink results with arrow keys', () => {
    const { api, options } = createInteraction({
      wikilinkOpen: ref(true),
      wikilinkResults: ref([
        { id: '1', label: 'One', target: 'Notes/One', isCreate: false },
        { id: '2', label: 'Two', target: 'Notes/Two', isCreate: false }
      ])
    })

    api.onEditorKeydown({
      key: 'ArrowDown',
      code: '',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      target: document.createElement('div'),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn()
    } as unknown as KeyboardEvent)

    expect(options.wikilinkIndex.value).toBe(1)
  })

  it('inserts parsed blocks when markdown paste is detected', () => {
    const insertParsedMarkdownBlocks = vi.fn()
    const markdownToEditorData = vi.fn(() => ({
      blocks: [{ type: 'paragraph', data: { text: 'hello' } }]
    }))
    const { api } = createInteraction({ insertParsedMarkdownBlocks, markdownToEditorData })

    const clipboardData = {
      getData: (type: string) => {
        if (type === 'text/plain') return '# Title\n'
        if (type === 'text/html') return ''
        return ''
      }
    }

    api.onEditorPaste({
      target: document.createElement('div'),
      clipboardData,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn()
    } as unknown as ClipboardEvent)

    expect(markdownToEditorData).toHaveBeenCalledWith('# Title\n')
    expect(insertParsedMarkdownBlocks).toHaveBeenCalledTimes(1)
  })

  it('blocks native context menu on virtual title block', () => {
    const virtualBlock = document.createElement('div')
    virtualBlock.className = 'ce-block'
    virtualBlock.dataset.id = '__virtual_title__'
    const target = document.createElement('span')
    virtualBlock.appendChild(target)

    const { api } = createInteraction()
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()

    api.onEditorContextMenu({
      target,
      preventDefault,
      stopPropagation
    } as unknown as MouseEvent)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('opens wikilink target when clicking wikilink anchor', async () => {
    const openLinkTargetWithAutosave = vi.fn(async () => {})
    const readWikilinkTargetFromAnchor = vi.fn(() => 'Notes/Target')
    const { api } = createInteraction({ openLinkTargetWithAutosave, readWikilinkTargetFromAnchor })

    const anchor = document.createElement('a')
    const block = document.createElement('div')
    block.className = 'ce-block'
    block.appendChild(anchor)

    api.onEditorClick({
      target: anchor,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      metaKey: false,
      ctrlKey: false
    } as unknown as MouseEvent)

    await Promise.resolve()
    expect(openLinkTargetWithAutosave).toHaveBeenCalledWith('Notes/Target')
  })
})
