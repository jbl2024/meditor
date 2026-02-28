import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/vue-3'
import { useEditorInputHandlers } from './useEditorInputHandlers'

function createHandlers(overrides: Partial<Parameters<typeof useEditorInputHandlers>[0]> = {}) {
  const insertContent = vi.fn()
  const editor = {
    chain: () => ({
      focus: () => ({
        insertContent: (...args: unknown[]) => {
          insertContent(...args)
          return { run: () => true }
        }
      })
    })
  } as unknown as Editor

  const options: Parameters<typeof useEditorInputHandlers>[0] = {
    getEditor: () => editor,
    currentPath: ref('a.md'),
    captureCaret: vi.fn(),
    currentTextSelectionContext: () => ({ text: '/quote', nodeType: 'paragraph' }),
    visibleSlashCommands: ref([{ id: 'quote', label: 'Quote', type: 'quote', data: {} }]),
    slashOpen: ref(true),
    slashIndex: ref(0),
    closeSlashMenu: vi.fn(),
    insertBlockFromDescriptor: vi.fn(() => true),
    blockMenuOpen: ref(false),
    closeBlockMenu: vi.fn(),
    tableToolbarOpen: ref(false),
    hideTableToolbar: vi.fn(),
    updateFormattingToolbar: vi.fn(),
    updateTableToolbar: vi.fn(),
    syncSlashMenuFromSelection: vi.fn(),
    zoomEditorBy: vi.fn(() => 1),
    resetEditorZoom: vi.fn(() => 1),
    inlineFormatToolbar: {
      linkPopoverOpen: ref(false),
      cancelLink: vi.fn()
    },
    ...overrides
  }

  return { handlers: useEditorInputHandlers(options), options, insertContent }
}

describe('useEditorInputHandlers', () => {
  it('handles slash Enter selection', () => {
    const { handlers, options } = createHandlers()
    const event = new KeyboardEvent('keydown', { key: 'Enter' })
    handlers.onEditorKeydown(event)
    expect(options.closeSlashMenu).toHaveBeenCalledTimes(1)
    expect(options.insertBlockFromDescriptor).toHaveBeenCalledWith('quote', {})
  })

  it('routes keyup refresh hooks', () => {
    const { handlers, options } = createHandlers()
    handlers.onEditorKeyup()
    expect(options.captureCaret).toHaveBeenCalledWith('a.md')
    expect(options.syncSlashMenuFromSelection).toHaveBeenCalledWith({ preserveIndex: true })
    expect(options.updateFormattingToolbar).toHaveBeenCalledTimes(1)
    expect(options.updateTableToolbar).toHaveBeenCalledTimes(1)
  })

  it('converts markdown paste to editor json content', () => {
    const { handlers, insertContent } = createHandlers({
      slashOpen: ref(false),
      currentTextSelectionContext: () => null
    })

    const clipboardData = {
      getData: (kind: string) => (kind === 'text/plain' ? '# title' : '')
    }
    const event = {
      clipboardData,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as ClipboardEvent

    handlers.onEditorPaste(event)
    expect(insertContent).toHaveBeenCalledTimes(1)
  })
})
