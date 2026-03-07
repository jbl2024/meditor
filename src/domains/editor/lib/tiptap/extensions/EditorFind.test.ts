import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import {
  EditorFindExtension,
  getEditorFindState,
  setEditorFindSearch,
  stepEditorFindMatch
} from './EditorFind'

const editors: Editor[] = []

function createEditor(content: string) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit,
      EditorFindExtension
    ],
    content: `<p>${content}</p>`
  })
  editors.push(editor)
  return editor
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe('EditorFindExtension', () => {
  it('finds matches and respects case sensitivity and whole-word mode', () => {
    const editor = createEditor('Alpha alpha ALPHA alphabet')

    setEditorFindSearch(editor, { query: 'alpha' })
    expect(getEditorFindState(editor).matches).toHaveLength(4)

    setEditorFindSearch(editor, { query: 'alpha', wholeWord: true })
    expect(getEditorFindState(editor).matches).toHaveLength(3)

    setEditorFindSearch(editor, { query: 'alpha', wholeWord: true, caseSensitive: true })
    expect(getEditorFindState(editor).matches).toHaveLength(1)
    expect(getEditorFindState(editor).activeIndex).toBe(0)
  })

  it('cycles through matches in both directions', () => {
    const editor = createEditor('alpha beta alpha gamma alpha')

    setEditorFindSearch(editor, { query: 'alpha', wholeWord: true })
    expect(getEditorFindState(editor).activeIndex).toBe(0)

    stepEditorFindMatch(editor, 1)
    expect(getEditorFindState(editor).activeIndex).toBe(1)

    stepEditorFindMatch(editor, 1)
    expect(getEditorFindState(editor).activeIndex).toBe(2)

    stepEditorFindMatch(editor, 1)
    expect(getEditorFindState(editor).activeIndex).toBe(0)

    stepEditorFindMatch(editor, -1)
    expect(getEditorFindState(editor).activeIndex).toBe(2)
  })
})
