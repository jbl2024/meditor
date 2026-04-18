import { ref } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { type EditorCaretSnapshot, useEditorCaret } from './useEditorCaret'

function setCollapsedSelection(node: Text, offset: number) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

describe('useEditorCaret', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('captures contenteditable caret offsets', () => {
    const holderEl = document.createElement('div')
    const block = document.createElement('div')
    block.className = 'ce-block'
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const textNode = document.createTextNode('hello world')
    editable.appendChild(textNode)
    block.appendChild(editable)
    holderEl.appendChild(block)
    document.body.appendChild(holderEl)

    const caretByPath = ref<Record<string, EditorCaretSnapshot>>({})
    const { captureCaret } = useEditorCaret({
      holder: ref(holderEl),
      caretByPath
    })

    editable.focus()
    setCollapsedSelection(textNode, 5)

    captureCaret('notes/a.md')

    expect(caretByPath.value['notes/a.md']).toEqual({
      kind: 'contenteditable',
      blockIndex: 0,
      offset: 5
    })
  })

  it('captures textarea caret offsets', () => {
    const holderEl = document.createElement('div')
    const block = document.createElement('div')
    block.className = 'ce-block'
    const textarea = document.createElement('textarea')
    textarea.value = 'abcdef'
    block.appendChild(textarea)
    holderEl.appendChild(block)
    document.body.appendChild(holderEl)

    const caretByPath = ref<Record<string, EditorCaretSnapshot>>({})
    const { captureCaret } = useEditorCaret({
      holder: ref(holderEl),
      caretByPath
    })

    textarea.focus()
    textarea.setSelectionRange(3, 3)

    captureCaret('notes/a.md')

    expect(caretByPath.value['notes/a.md']).toEqual({
      kind: 'text-input',
      blockIndex: 0,
      offset: 3
    })
  })

  it('ignores selection outside holder during capture', () => {
    const holderEl = document.createElement('div')
    const block = document.createElement('div')
    block.className = 'ce-block'
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const holderText = document.createTextNode('inside')
    editable.appendChild(holderText)
    block.appendChild(editable)
    holderEl.appendChild(block)
    document.body.appendChild(holderEl)

    const outside = document.createElement('div')
    const outsideText = document.createTextNode('outside')
    outside.appendChild(outsideText)
    document.body.appendChild(outside)

    const caretByPath = ref<Record<string, EditorCaretSnapshot>>({})
    const { captureCaret } = useEditorCaret({
      holder: ref(holderEl),
      caretByPath
    })

    setCollapsedSelection(outsideText, 3)
    captureCaret('notes/a.md')

    expect(caretByPath.value['notes/a.md']).toBeUndefined()
  })
})
