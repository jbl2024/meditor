import { describe, expect, it, vi } from 'vitest'
import {
  applyMarkdownShortcut,
  adjustListLevelFromTab,
  isEditorZoomModifier,
  isLikelyMarkdownPaste,
  selectSmartPasteMarkdown,
  isZoomInShortcut,
  isZoomOutShortcut,
  isZoomResetShortcut,
  looksLikeMarkdown
} from './editorInteractions'

describe('applyMarkdownShortcut', () => {
  it('maps checklist marker to checklist list block', () => {
    const result = applyMarkdownShortcut('- [x]')
    expect(result?.type).toBe('list')
    expect(result?.data).toMatchObject({
      style: 'checklist',
      items: [{ meta: { checked: true } }]
    })
  })

  it('maps heading marker to header block', () => {
    const result = applyMarkdownShortcut('###')
    expect(result).toEqual({
      type: 'header',
      data: { text: '', level: 3 }
    })
  })

  it('maps heading markdown with text to header block with preserved text', () => {
    const result = applyMarkdownShortcut('## roadmap')
    expect(result).toEqual({
      type: 'header',
      data: { text: 'roadmap', level: 2 }
    })
  })
})

describe('zoom shortcut helpers', () => {
  it('detects modifier and zoom key combinations', () => {
    expect(isEditorZoomModifier({ metaKey: true, ctrlKey: false, altKey: false })).toBe(true)
    expect(isZoomInShortcut({ key: '+', code: '' })).toBe(true)
    expect(isZoomOutShortcut({ key: '-', code: '' })).toBe(true)
    expect(isZoomResetShortcut({ key: '0', code: '' })).toBe(true)
  })
})

describe('list tab helpers', () => {
  function createTabView() {
    const dispatch = vi.fn()
    const view = {
      state: {
        schema: {
          nodes: {
            listItem: { name: 'listItem' },
            taskItem: { name: 'taskItem' }
          }
        },
        selection: {
          $from: {
            depth: 3,
            node: (depth: number) => [
              { type: { name: 'doc' } },
              { type: { name: 'bulletList' } },
              { type: { name: 'listItem' } },
              { type: { name: 'paragraph' } }
            ][depth]
          }
        }
      },
      dispatch
    } as any

    return { view, dispatch }
  }

  it('consumes Tab in a list item even when indentation cannot be applied', () => {
    const { view, dispatch } = createTabView()
    const event = {
      key: 'Tab',
      code: 'Tab',
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as KeyboardEvent
    const sinkListItem = vi.fn(() => () => false)
    const liftListItem = vi.fn(() => () => false)

    const handled = adjustListLevelFromTab(view, event, { sinkListItem, liftListItem })

    expect(handled).toBe(true)
    expect(sinkListItem).toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('keeps Shift+Tab inside the editor when the first list item cannot lift', () => {
    const { view, dispatch } = createTabView()
    const event = {
      key: 'Tab',
      code: 'Tab',
      shiftKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as KeyboardEvent
    const sinkListItem = vi.fn(() => () => false)
    const liftListItem = vi.fn(() => () => false)

    const handled = adjustListLevelFromTab(view, event, { sinkListItem, liftListItem })

    expect(handled).toBe(true)
    expect(liftListItem).toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
  })
})

describe('markdown paste detection', () => {
  it('accepts likely markdown text', () => {
    expect(looksLikeMarkdown('# Hello')).toBe(true)
    expect(isLikelyMarkdownPaste('- item', '')).toBe(true)
  })

  it('rejects plain non-markdown text', () => {
    expect(looksLikeMarkdown('just text')).toBe(false)
    expect(isLikelyMarkdownPaste('just text', '')).toBe(false)
  })

  it('prefers structured html conversion when available', () => {
    const selected = selectSmartPasteMarkdown('', '<h2>Title</h2><ul><li>Alpha</li></ul>')
    expect(selected).toEqual({
      markdown: '## Title\n\n- Alpha\n',
      source: 'html'
    })
  })

  it('falls back to plain markdown when html confidence is low', () => {
    const selected = selectSmartPasteMarkdown('# Hello', '<div><strong>Hello</strong></div>')
    expect(selected).toEqual({
      markdown: '# Hello',
      source: 'plain'
    })
  })

  it('prefers html conversion for inline wikilinks copied from editor anchors', () => {
    const selected = selectSmartPasteMarkdown(
      'Neurone',
      '<a href="#" data-wikilink="true" data-target="graph/neurone.md" data-label="Neurone">Neurone</a>'
    )
    expect(selected).toEqual({
      markdown: '[[graph/neurone.md|Neurone]]\n',
      source: 'html'
    })
  })

  it('accepts standalone image html as structured paste', () => {
    const selected = selectSmartPasteMarkdown(
      '',
      '<img src="/home/jeromeb/src/wiki-technique/docs/gestion_parc/assets/images/Formulaire_GLPI/Pasted image 20260325152608.png" alt="Pasted image 20260325152608.png">'
    )

    expect(selected).toEqual({
      markdown: '![Pasted image 20260325152608.png](/home/jeromeb/src/wiki-technique/docs/gestion_parc/assets/images/Formulaire_GLPI/Pasted image 20260325152608.png)\n',
      source: 'html'
    })
  })

  it('returns null when neither html nor plain has markdown signals', () => {
    const selected = selectSmartPasteMarkdown('just text', '<div><strong>Hello</strong></div>')
    expect(selected).toBeNull()
  })
})
