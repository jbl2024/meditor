import { describe, expect, it } from 'vitest'
import {
  applyMarkdownShortcut,
  isEditorZoomModifier,
  isLikelyMarkdownPaste,
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
})

describe('zoom shortcut helpers', () => {
  it('detects modifier and zoom key combinations', () => {
    expect(isEditorZoomModifier({ metaKey: true, ctrlKey: false, altKey: false })).toBe(true)
    expect(isZoomInShortcut({ key: '+', code: '' })).toBe(true)
    expect(isZoomOutShortcut({ key: '-', code: '' })).toBe(true)
    expect(isZoomResetShortcut({ key: '0', code: '' })).toBe(true)
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
})
