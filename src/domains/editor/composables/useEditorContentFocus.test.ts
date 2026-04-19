import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/vue-3'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { Schema } from '@tiptap/pm/model'
import { useEditorContentFocus } from './useEditorContentFocus'

const schema = new Schema({
  nodes: {
    doc: { content: 'block*' },
    paragraph: {
      group: 'block',
      content: 'text*'
    },
    heading: {
      group: 'block',
      content: 'text*',
      attrs: { level: { default: 1 } }
    },
    horizontalRule: {
      group: 'block'
    },
    text: {}
  }
})

function text(value: string) {
  return schema.text(value)
}

function paragraph(value = '') {
  return schema.nodes.paragraph.create(null, value ? [text(value)] : undefined)
}

function heading(value: string, level = 1) {
  return schema.nodes.heading.create({ level }, [text(value)])
}

function horizontalRule() {
  return schema.nodes.horizontalRule.create()
}

function createEditor(doc = schema.nodes.doc.create(null, [])) {
  let state = EditorState.create({ schema, doc })
  const focus = vi.fn()
  const commands = {
    focus: vi.fn(),
  }
  const view = {
    dom: { focus },
    dispatch: vi.fn((tr: Parameters<typeof state.apply>[0]) => {
      state = state.apply(tr)
      editor.state = state
    })
  }
  const editor = {
    get state() {
      return state
    },
    set state(value) {
      state = value
    },
    view,
    commands
  } as unknown as Editor & { state: EditorState }

  return { editor, view, commands }
}

describe('useEditorContentFocus', () => {
  it('focuses the first paragraph at the start of the document', () => {
    const holder = ref(document.createElement('div'))
    holder.value.scrollTop = 140
    const { editor, view } = createEditor(schema.nodes.doc.create(null, [
      paragraph('Alpha'),
      paragraph('Beta')
    ]))
    const api = useEditorContentFocus({
      holder: holder as any,
      getEditor: () => editor
    })

    api.focusFirstEditableBlock()

    expect((editor.state.selection as TextSelection).$from.parent.type.name).toBe('paragraph')
    expect(editor.state.selection.from).toBe(1)
    expect(view.dispatch).toHaveBeenCalled()
    expect(view.dom.focus).toHaveBeenCalled()
    expect(holder.value.scrollTop).toBe(0)
  })

  it('creates an empty paragraph when the document has no editable block', () => {
    const holder = ref(document.createElement('div'))
    const { editor } = createEditor(schema.nodes.doc.create(null, [horizontalRule()]))
    const api = useEditorContentFocus({
      holder: holder as any,
      getEditor: () => editor
    })

    api.focusFirstEditableBlock()

    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph')
    expect(editor.state.doc.childCount).toBe(2)
    expect((editor.state.selection as TextSelection).$from.parent.type.name).toBe('paragraph')
    expect(editor.state.selection.from).toBe(1)
  })

  it('focuses a heading when it is the first editable block', () => {
    const holder = ref(document.createElement('div'))
    const { editor } = createEditor(schema.nodes.doc.create(null, [
      heading('Top title', 2),
      paragraph('Body')
    ]))
    const api = useEditorContentFocus({
      holder: holder as any,
      getEditor: () => editor
    })

    api.focusFirstEditableBlock()

    expect((editor.state.selection as TextSelection).$from.parent.type.name).toBe('heading')
    expect(editor.state.selection.from).toBe(1)
  })

  it('inserts an editable block before later content instead of jumping to a lower block', () => {
    const holder = ref(document.createElement('div'))
    const { editor } = createEditor(schema.nodes.doc.create(null, [
      horizontalRule(),
      heading('Later heading', 3),
      paragraph('Later paragraph')
    ]))
    const api = useEditorContentFocus({
      holder: holder as any,
      getEditor: () => editor
    })

    api.focusFirstEditableBlock()

    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph')
    expect(editor.state.doc.child(1).type.name).toBe('horizontalRule')
    expect((editor.state.selection as TextSelection).$from.parent.type.name).toBe('paragraph')
    expect(editor.state.selection.from).toBe(1)
  })

  it('is a no-op when there is no active editor', () => {
    const holder = ref(document.createElement('div'))
    holder.value.scrollTop = 25
    const api = useEditorContentFocus({
      holder: holder as any,
      getEditor: () => null
    })

    api.focusFirstEditableBlock()

    expect(holder.value.scrollTop).toBe(25)
  })
})
