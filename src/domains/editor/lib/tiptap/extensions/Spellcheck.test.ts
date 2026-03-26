import { describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { collectSpellcheckDecorationRanges, SpellcheckExtension, getSpellcheckSuggestions } from './Spellcheck'

describe('SpellcheckExtension', () => {
  it('adds the spellcheck extension without changing the editor contract', () => {
    const editor = new Editor({
      content: '<p>Hello wrld</p>',
      extensions: [
        StarterKit,
        SpellcheckExtension.configure({
          getLanguage: () => 'en'
        })
      ]
    })

    expect(editor).toBeTruthy()
    expect(editor.extensionManager.extensions.some((extension) => extension.name === 'spellcheck')).toBe(true)
    editor.destroy()
  })

  it('can be configured with a language resolver', () => {
    const getLanguage = vi.fn(() => 'fr' as const)
    const editor = new Editor({
      content: '<p>Bonjour monde</p>',
      extensions: [
        StarterKit,
        SpellcheckExtension.configure({
          getLanguage
        })
      ]
    })

    expect(editor.extensionManager.extensions.some((extension) => extension.name === 'spellcheck')).toBe(true)
    expect(getLanguage).toHaveBeenCalled()
    editor.destroy()
  })

  it('collects only misspelled ranges outside code and accepts hyphenated and apostrophe tokens', () => {
    const editor = new Editor({
      content: '<p>Hello wrld self-contained l\'éditeur</p><pre><code>blockd</code></pre>',
      extensions: [StarterKit]
    })

    const spellchecker = {
      correct: (word: string) => ['hello', 'self', 'contained', 'éditeur'].includes(word.toLowerCase())
    } as any

    const ranges = collectSpellcheckDecorationRanges(editor.state.doc, 'fr', spellchecker)
    const texts = ranges.map((range) => editor.state.doc.textBetween(range.from, range.to, '\n', '\0'))

    expect(texts).toEqual(['wrld'])
    expect(ranges).toHaveLength(1)
    editor.destroy()
  })

  it('skips ignored words when building decorations', () => {
    const editor = new Editor({
      content: '<p>Hello wrld</p>',
      extensions: [StarterKit]
    })

    const spellchecker = {
      correct: (word: string) => ['hello'].includes(word.toLowerCase())
    } as any

    const ranges = collectSpellcheckDecorationRanges(editor.state.doc, 'en', spellchecker, {
      isWordIgnored: (word) => word === 'wrld'
    })

    expect(ranges).toHaveLength(0)
    editor.destroy()
  })

  it('returns ranked suggestions from the cached dictionary', async () => {
    const suggestions = await getSpellcheckSuggestions('en', 'wrld')

    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions[0]).not.toBe('wrld')
  })
})
