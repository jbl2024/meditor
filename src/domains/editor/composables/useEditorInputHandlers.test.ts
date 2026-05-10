import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/vue-3'
import { useEditorInputHandlers } from './useEditorInputHandlers'
import type { EditorAtMacroEntry } from '../lib/editorAtMacros'

const todayMacro: EditorAtMacroEntry = {
  id: 'today',
  label: 'Today',
  group: 'Time',
  kind: 'insert_text',
  description: '',
  replacement: '2026-04-12',
  preview: '2026-04-12',
  aliases: []
}

function createHandlers(overrides: any = {}) {
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

  const defaultOptions: Parameters<typeof useEditorInputHandlers>[0] = {
    editingPort: {
      getEditor: () => editor,
      currentPath: ref('a.md'),
      captureCaret: vi.fn(),
      currentTextSelectionContext: () => ({ text: '/quote', nodeType: 'paragraph', from: 1, to: 7 }),
      insertBlockFromDescriptor: vi.fn(() => true)
    },
    menusPort: {
      visibleSlashCommands: ref([{ id: 'quote', label: 'Quote', type: 'quote', data: {} }]),
      visibleAtMacros: ref([todayMacro]),
      slashOpen: ref(true),
      slashIndex: ref(0),
      atOpen: ref(false),
      atIndex: ref(0),
      closeSlashMenu: vi.fn(),
      closeAtMenu: vi.fn(),
      dismissAtMenu: vi.fn(),
      insertAtMacro: vi.fn(() => true),
      blockMenuOpen: ref(false),
      closeBlockMenu: vi.fn(),
      tableToolbarOpen: ref(false),
      hideTableToolbar: vi.fn(),
      inlineFormatToolbar: {
        linkPopoverOpen: ref(false),
        cancelLink: vi.fn()
      }
    },
    uiPort: {
      updateFormattingToolbar: vi.fn(),
      updateTableToolbar: vi.fn(),
      syncSlashMenuFromSelection: vi.fn(),
      syncAtMenuFromSelection: vi.fn()
    },
    zoomPort: {
      zoomEditorBy: vi.fn(() => 1),
      resetEditorZoom: vi.fn(() => 1)
    }
  }

  const options: Parameters<typeof useEditorInputHandlers>[0] = {
    ...defaultOptions,
    ...overrides,
    editingPort: {
      ...defaultOptions.editingPort,
      ...(overrides.editingPort ?? {})
    },
    menusPort: {
      ...defaultOptions.menusPort,
      ...(overrides.menusPort ?? {}),
      inlineFormatToolbar: {
        ...defaultOptions.menusPort.inlineFormatToolbar,
        ...(overrides.menusPort?.inlineFormatToolbar ?? {})
      }
    },
    uiPort: {
      ...defaultOptions.uiPort,
      ...(overrides.uiPort ?? {})
    },
    zoomPort: {
      ...defaultOptions.zoomPort,
      ...(overrides.zoomPort ?? {})
    }
  }

  return { handlers: useEditorInputHandlers(options), options, insertContent }
}

describe('useEditorInputHandlers', () => {
  it('moves slash selection with arrow keys', () => {
    const { handlers, options } = createHandlers({
      menusPort: {
        visibleSlashCommands: ref([
          { id: 'quote', label: 'Quote', type: 'quote', data: {} },
          { id: 'code', label: 'Code', type: 'code', data: {} }
        ]),
        visibleAtMacros: ref([]),
        slashOpen: ref(true),
        slashIndex: ref(0),
        atOpen: ref(false),
        atIndex: ref(0),
        closeSlashMenu: vi.fn(),
        closeAtMenu: vi.fn(),
        dismissAtMenu: vi.fn(),
        insertAtMacro: vi.fn(() => true),
        blockMenuOpen: ref(false),
        closeBlockMenu: vi.fn(),
        tableToolbarOpen: ref(false),
        hideTableToolbar: vi.fn(),
        inlineFormatToolbar: {
          linkPopoverOpen: ref(false),
          cancelLink: vi.fn()
        }
      }
    })

    handlers.onEditorKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(options.menusPort.slashIndex.value).toBe(1)

    handlers.onEditorKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(options.menusPort.slashIndex.value).toBe(0)
  })

  it('handles slash Enter selection', () => {
    const { handlers, options } = createHandlers()
    const event = new KeyboardEvent('keydown', { key: 'Enter' })
    handlers.onEditorKeydown(event)
    expect(options.menusPort.closeSlashMenu).toHaveBeenCalledTimes(1)
    expect(options.editingPort.insertBlockFromDescriptor).toHaveBeenCalledWith('quote', {})
  })

  it('adjusts heading level on Tab before focus can leave the editor', () => {
    const setNodeMarkup = vi.fn(() => ({ step: 'setNodeMarkup' }))
    const dispatch = vi.fn()
    const editor = {
      view: {
        state: {
          selection: {
            empty: true,
            $from: {
              parent: {
                type: { name: 'heading' },
                attrs: { level: 2 }
              },
              parentOffset: 0,
              depth: 1,
              before: vi.fn(() => 12)
            }
          },
          tr: {
            setNodeMarkup
          }
        },
        dispatch
      }
    } as unknown as Editor
    const { handlers } = createHandlers({
      editingPort: {
        getEditor: () => editor,
        currentPath: ref('a.md'),
        captureCaret: vi.fn(),
        currentTextSelectionContext: () => ({ text: 'alpha', nodeType: 'heading', from: 1, to: 6 }),
        insertBlockFromDescriptor: vi.fn(() => true)
      }
    })

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    handlers.onEditorKeydown(event)

    expect(setNodeMarkup).toHaveBeenCalledWith(12, undefined, { level: 3 })
    expect(dispatch).toHaveBeenCalledWith({ step: 'setNodeMarkup' })
    expect(event.defaultPrevented).toBe(true)
  })

  it('routes keyup refresh hooks', () => {
    const { handlers, options } = createHandlers()
    handlers.onEditorKeyup()
    expect(options.editingPort.captureCaret).toHaveBeenCalledWith('a.md')
    expect(options.uiPort.syncSlashMenuFromSelection).toHaveBeenCalledWith({ preserveIndex: true })
    expect(options.uiPort.updateFormattingToolbar).toHaveBeenCalledTimes(1)
    expect(options.uiPort.updateTableToolbar).toHaveBeenCalledTimes(1)
  })

  it('does not resync slash menu on Escape when it is closed', () => {
    const { handlers, options } = createHandlers({
      menusPort: {
        visibleSlashCommands: ref([{ id: 'quote', label: 'Quote', type: 'quote', data: {} }]),
        visibleAtMacros: ref([]),
        slashOpen: ref(false),
        slashIndex: ref(0),
        atOpen: ref(false),
        atIndex: ref(0),
        closeSlashMenu: vi.fn(),
        closeAtMenu: vi.fn(),
        dismissAtMenu: vi.fn(),
        insertAtMacro: vi.fn(() => true),
        blockMenuOpen: ref(false),
        closeBlockMenu: vi.fn(),
        tableToolbarOpen: ref(false),
        hideTableToolbar: vi.fn(),
        inlineFormatToolbar: {
          linkPopoverOpen: ref(false),
          cancelLink: vi.fn()
        }
      }
    })

    handlers.onEditorKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(options.uiPort.syncSlashMenuFromSelection).not.toHaveBeenCalled()
  })

  it('converts markdown paste to editor json content', () => {
    const { handlers, insertContent } = createHandlers({
      menusPort: {
        visibleSlashCommands: ref([{ id: 'quote', label: 'Quote', type: 'quote', data: {} }]),
        visibleAtMacros: ref([]),
        slashOpen: ref(false),
        slashIndex: ref(0),
        atOpen: ref(false),
        atIndex: ref(0),
        closeSlashMenu: vi.fn(),
        closeAtMenu: vi.fn(),
        dismissAtMenu: vi.fn(),
        insertAtMacro: vi.fn(() => true),
        blockMenuOpen: ref(false),
        closeBlockMenu: vi.fn(),
        tableToolbarOpen: ref(false),
        hideTableToolbar: vi.fn(),
        inlineFormatToolbar: {
          linkPopoverOpen: ref(false),
          cancelLink: vi.fn()
        }
      },
      editingPort: {
        getEditor: () => ({ chain: () => ({ focus: () => ({ insertContent: (...args: unknown[]) => { insertContent(...args); return { run: () => true } } }) }) } as unknown as Editor),
        currentPath: ref('a.md'),
        captureCaret: vi.fn(),
        currentTextSelectionContext: () => null,
        insertBlockFromDescriptor: vi.fn(() => true)
      }
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

  it('converts text/markdown clipboard content when plain text is unavailable', () => {
    const { handlers, insertContent } = createHandlers({
      menusPort: {
        visibleSlashCommands: ref([{ id: 'quote', label: 'Quote', type: 'quote', data: {} }]),
        visibleAtMacros: ref([]),
        slashOpen: ref(false),
        slashIndex: ref(0),
        atOpen: ref(false),
        atIndex: ref(0),
        closeSlashMenu: vi.fn(),
        closeAtMenu: vi.fn(),
        dismissAtMenu: vi.fn(),
        insertAtMacro: vi.fn(() => true),
        blockMenuOpen: ref(false),
        closeBlockMenu: vi.fn(),
        tableToolbarOpen: ref(false),
        hideTableToolbar: vi.fn(),
        inlineFormatToolbar: {
          linkPopoverOpen: ref(false),
          cancelLink: vi.fn()
        }
      }
    })

    const event = {
      clipboardData: {
        getData: (kind: string) => {
          if (kind === 'text/markdown') return '# title'
          return ''
        }
      },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as ClipboardEvent

    handlers.onEditorPaste(event)
    expect(insertContent).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('converts structured html paste to editor json content', () => {
    const { handlers, insertContent } = createHandlers({
      menusPort: {
        visibleSlashCommands: ref([{ id: 'quote', label: 'Quote', type: 'quote', data: {} }]),
        visibleAtMacros: ref([]),
        slashOpen: ref(false),
        slashIndex: ref(0),
        atOpen: ref(false),
        atIndex: ref(0),
        closeSlashMenu: vi.fn(),
        closeAtMenu: vi.fn(),
        dismissAtMenu: vi.fn(),
        insertAtMacro: vi.fn(() => true),
        blockMenuOpen: ref(false),
        closeBlockMenu: vi.fn(),
        tableToolbarOpen: ref(false),
        hideTableToolbar: vi.fn(),
        inlineFormatToolbar: {
          linkPopoverOpen: ref(false),
          cancelLink: vi.fn()
        }
      }
    })

    const event = {
      clipboardData: {
        getData: (kind: string) => (kind === 'text/html' ? '<h2>Title</h2><ul><li>First</li></ul>' : '')
      },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as ClipboardEvent

    handlers.onEditorPaste(event)
    expect(insertContent).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('converts standalone image html paste to editor json content', () => {
    const { handlers, insertContent } = createHandlers({
      menusPort: {
        visibleSlashCommands: ref([{ id: 'quote', label: 'Quote', type: 'quote', data: {} }]),
        visibleAtMacros: ref([]),
        slashOpen: ref(false),
        slashIndex: ref(0),
        atOpen: ref(false),
        atIndex: ref(0),
        closeSlashMenu: vi.fn(),
        closeAtMenu: vi.fn(),
        dismissAtMenu: vi.fn(),
        insertAtMacro: vi.fn(() => true),
        blockMenuOpen: ref(false),
        closeBlockMenu: vi.fn(),
        tableToolbarOpen: ref(false),
        hideTableToolbar: vi.fn(),
        inlineFormatToolbar: {
          linkPopoverOpen: ref(false),
          cancelLink: vi.fn()
        }
      }
    })

    const event = {
      clipboardData: {
        getData: (kind: string) =>
          kind === 'text/html'
            ? '<img src="/home/jeromeb/src/wiki-technique/docs/gestion_parc/assets/images/Formulaire_GLPI/Pasted image 20260325152608.png" alt="Pasted image 20260325152608.png">'
            : ''
      },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as ClipboardEvent

    handlers.onEditorPaste(event)
    expect(insertContent).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('falls back to native paste when html and plain are low-confidence', () => {
    const { handlers, insertContent } = createHandlers({
      menusPort: {
        visibleSlashCommands: ref([{ id: 'quote', label: 'Quote', type: 'quote', data: {} }]),
        slashOpen: ref(false),
        slashIndex: ref(0),
        closeSlashMenu: vi.fn(),
        blockMenuOpen: ref(false),
        closeBlockMenu: vi.fn(),
        tableToolbarOpen: ref(false),
        hideTableToolbar: vi.fn(),
        inlineFormatToolbar: {
          linkPopoverOpen: ref(false),
          cancelLink: vi.fn()
        }
      }
    })

    const event = {
      clipboardData: {
        getData: (kind: string) => {
          if (kind === 'text/plain') return 'just text'
          if (kind === 'text/html') return '<div><strong>Hello</strong></div>'
          return ''
        }
      },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as ClipboardEvent

    handlers.onEditorPaste(event)
    expect(insertContent).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('keeps native paste inside code blocks', () => {
    const insertContent = vi.fn()
    const editor = {
      state: {
        selection: {
          $from: {
            parent: {
              type: { name: 'codeBlock' }
            },
            marks: () => []
          }
        }
      },
      chain: () => ({
        focus: () => ({
          insertContent: (...args: unknown[]) => {
            insertContent(...args)
            return { run: () => true }
          }
        })
      })
    } as unknown as Editor

    const { handlers } = createHandlers({
      menusPort: {
        visibleSlashCommands: ref([]),
        visibleAtMacros: ref([]),
        slashOpen: ref(false),
        slashIndex: ref(0),
        atOpen: ref(false),
        atIndex: ref(0),
        closeSlashMenu: vi.fn(),
        closeAtMenu: vi.fn(),
        dismissAtMenu: vi.fn(),
        insertAtMacro: vi.fn(() => true),
        blockMenuOpen: ref(false),
        closeBlockMenu: vi.fn(),
        tableToolbarOpen: ref(false),
        hideTableToolbar: vi.fn(),
        inlineFormatToolbar: {
          linkPopoverOpen: ref(false),
          cancelLink: vi.fn()
        }
      },
      editingPort: {
        getEditor: () => editor,
        currentPath: ref('a.md'),
        captureCaret: vi.fn(),
        currentTextSelectionContext: () => null,
        insertBlockFromDescriptor: vi.fn(() => true)
      }
    })

    const event = {
      clipboardData: {
        getData: (kind: string) => (kind === 'text/plain' ? '# title' : '')
      },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as ClipboardEvent

    handlers.onEditorPaste(event)
    expect(insertContent).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('replaces current paragraph when heading markdown with text is converted', () => {
    const { handlers, options } = createHandlers({
      menusPort: {
        visibleSlashCommands: ref([]),
        visibleAtMacros: ref([]),
        slashOpen: ref(false),
        slashIndex: ref(0),
        atOpen: ref(false),
        atIndex: ref(0),
        closeSlashMenu: vi.fn(),
        closeAtMenu: vi.fn(),
        dismissAtMenu: vi.fn(),
        insertAtMacro: vi.fn(() => true),
        blockMenuOpen: ref(false),
        closeBlockMenu: vi.fn(),
        tableToolbarOpen: ref(false),
        hideTableToolbar: vi.fn(),
        inlineFormatToolbar: {
          linkPopoverOpen: ref(false),
          cancelLink: vi.fn()
        }
      },
      editingPort: {
        getEditor: () => ({ chain: () => ({ focus: () => ({ insertContent: vi.fn(() => ({ run: () => true })) }) }) } as unknown as Editor),
        currentPath: ref('a.md'),
        captureCaret: vi.fn(),
        currentTextSelectionContext: () => ({ text: '## title', nodeType: 'paragraph', from: 10, to: 18 }),
        insertBlockFromDescriptor: vi.fn(() => true)
      }
    })

    handlers.onEditorKeydown(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }))

    expect(options.editingPort.insertBlockFromDescriptor).toHaveBeenCalledWith(
      'header',
      { text: 'title', level: 2 },
      { replaceRange: { from: 10, to: 18 } }
    )
  })

  it('selects an @ macro with Enter when the macro menu is open', () => {
    const insertAtMacro = vi.fn(() => true)
    const { handlers, options } = createHandlers({
      menusPort: {
        atOpen: ref(true),
        atIndex: ref(0),
        visibleAtMacros: ref([todayMacro]),
        visibleSlashCommands: ref([]),
        slashOpen: ref(false),
        slashIndex: ref(0),
        closeAtMenu: vi.fn(),
        dismissAtMenu: vi.fn(),
        insertAtMacro,
        closeSlashMenu: vi.fn(),
        blockMenuOpen: ref(false),
        closeBlockMenu: vi.fn(),
        tableToolbarOpen: ref(false),
        hideTableToolbar: vi.fn(),
        inlineFormatToolbar: {
          linkPopoverOpen: ref(false),
          cancelLink: vi.fn()
        }
      },
      editingPort: {
        currentTextSelectionContext: () => ({ text: 'Draft @today', nodeType: 'paragraph', from: 1, to: 13, offset: 12, marks: [] })
      }
    })

    handlers.onEditorKeydown(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(options.menusPort.dismissAtMenu).toHaveBeenCalledTimes(1)
    expect(insertAtMacro).toHaveBeenCalledWith({
      id: 'today',
      label: 'Today',
      group: 'Time',
      kind: 'insert_text',
      description: '',
      replacement: '2026-04-12',
      preview: '2026-04-12',
      aliases: []
    })
  })
})
