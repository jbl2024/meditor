import { Node } from '@tiptap/core'
import { ListKit } from '@tiptap/extension-list'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { type JSONContent, Editor } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import { turnInto } from './actions'
import type { BlockMenuTarget, TurnIntoType } from './types'

const QuoteBlockNode = Node.create({
  name: 'quoteBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return { text: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-quote-node="true"]' }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-quote-node': 'true', 'data-text': String(node.attrs.text ?? '') }]
  }
})

const CalloutBlockNode = Node.create({
  name: 'calloutBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return { kind: { default: 'NOTE' }, message: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-callout-node="true"]' }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-callout-node': 'true', 'data-message': String(node.attrs.message ?? '') }]
  }
})

const MermaidBlockNode = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return { code: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-mermaid-node="true"]' }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-mermaid-node': 'true', 'data-code': String(node.attrs.code ?? '') }]
  }
})

const HtmlBlockNode = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return { html: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-html-node="true"]' }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-html-node': 'true', 'data-html': String(node.attrs.html ?? '') }]
  }
})

const WikilinkNode = Node.create({
  name: 'wikilink',
  inline: true,
  atom: true,
  group: 'inline',
  addAttributes() {
    return {
      target: { default: '' },
      label: { default: null },
      exists: { default: true }
    }
  },
  parseHTML() {
    return [{ tag: 'a[data-wikilink="true"]' }]
  },
  renderHTML({ node }) {
    return ['a', { 'data-wikilink': 'true', 'data-target': String(node.attrs.target ?? '') }, String(node.attrs.label ?? node.attrs.target ?? '')]
  }
})

const TURN_INTO_TYPES: TurnIntoType[] = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
  'quote'
]

const editors: Editor[] = []

function createEditor(firstNode: JSONContent): Editor {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false
      }),
      ListKit.configure({
        taskItem: { nested: true }
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      QuoteBlockNode,
      CalloutBlockNode,
      MermaidBlockNode,
      HtmlBlockNode,
      WikilinkNode
    ],
    content: {
      type: 'doc',
      content: [firstNode]
    }
  })
  ;(editor.commands as { focus: (pos?: number) => boolean }).focus = () => true
  editors.push(editor)
  return editor
}

function createTarget(editor: Editor): BlockMenuTarget {
  const node = editor.state.doc.child(0)
  return {
    pos: 0,
    nodeType: node.type.name,
    nodeSize: node.nodeSize,
    canDelete: true,
    canConvert: true,
    text: node.textContent ?? ''
  }
}

function createTargetAtPos(editor: Editor, pos: number): BlockMenuTarget {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) throw new Error(`No node at pos ${pos}`)
  return {
    pos,
    nodeType: node.type.name,
    nodeSize: node.nodeSize,
    canDelete: true,
    canConvert: true,
    text: node.textContent ?? ''
  }
}

function nodeTextWithLineBreaks(node: any): string {
  if (!node) return ''
  if (node.type?.name === 'hardBreak') return '\n'
  if (!node.childCount) {
    if (node.type?.name === 'quoteBlock') return String(node.attrs?.text ?? '')
    if (node.type?.name === 'calloutBlock') return String(node.attrs?.message ?? '')
    if (node.type?.name === 'mermaidBlock') return String(node.attrs?.code ?? '')
    if (node.type?.name === 'htmlBlock') return String(node.attrs?.html ?? '')
    return String(node.text ?? node.textContent ?? '')
  }
  let out = ''
  node.forEach((child: any) => {
    out += nodeTextWithLineBreaks(child)
  })
  return out
}

function firstTextContainer(node: any): any {
  if (node.type?.name === 'paragraph' || node.type?.name === 'heading' || node.type?.name === 'codeBlock') return node
  if (node.type?.name === 'listItem' || node.type?.name === 'taskItem') return node.child(0)
  if (node.type?.name === 'bulletList' || node.type?.name === 'orderedList' || node.type?.name === 'taskList') {
    return firstTextContainer(node.child(0))
  }
  return node
}

function richInlineFixture(): JSONContent[] {
  return [
    { type: 'wikilink', attrs: { target: 'Note.md', label: 'Note', exists: true } },
    { type: 'text', text: ' ' },
    { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
    { type: 'text', text: ' ' },
    { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
    { type: 'hardBreak' },
    { type: 'text', text: 'inline', marks: [{ type: 'code' }] }
  ]
}

function expectRichInlinePreserved(container: any) {
  expect(['paragraph', 'heading', 'codeBlock']).toContain(container.type.name)
  expect(container.child(0).type.name).toBe('wikilink')
  expect(String(container.child(0).attrs.target ?? '')).toBe('Note.md')
  expect(container.child(2).marks.some((mark: any) => mark.type.name === 'bold')).toBe(true)
  expect(container.child(4).marks.some((mark: any) => mark.type.name === 'italic')).toBe(true)
  expect(container.child(5).type.name).toBe('hardBreak')
  expect(container.child(6).marks.some((mark: any) => mark.type.name === 'code')).toBe(true)
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe('blockMenu turnInto', () => {
  describe('preserves rich inline content when source supports fragment reuse', () => {
    it('keeps wikilinks, marks and hard breaks when converting paragraph to heading', () => {
      const editor = createEditor({
        type: 'paragraph',
        content: richInlineFixture()
      })

      expect(turnInto(editor, createTarget(editor), 'heading2')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('heading')
      expect(converted.attrs.level).toBe(2)
      expectRichInlinePreserved(converted)
    })

    it('keeps wikilinks, marks and hard breaks when converting paragraph to task list', () => {
      const editor = createEditor({
        type: 'paragraph',
        content: richInlineFixture()
      })

      expect(turnInto(editor, createTarget(editor), 'taskList')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('taskList')
      expectRichInlinePreserved(firstTextContainer(converted))
    })

    it('keeps inline structure when converting a heading into a bullet list', () => {
      const editor = createEditor({
        type: 'heading',
        attrs: { level: 3 },
        content: richInlineFixture()
      })

      expect(turnInto(editor, createTarget(editor), 'bulletList')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('bulletList')
      expectRichInlinePreserved(firstTextContainer(converted))
    })

    it('preserves inline structure and nested children when converting list families', () => {
      const editor = createEditor({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: richInlineFixture()
              },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Nested child' }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      })

      expect(turnInto(editor, createTargetAtPos(editor, 1), 'taskList')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('taskList')
      const taskItem = converted.child(0)
      expectRichInlinePreserved(taskItem.child(0))
      expect(taskItem.child(1).type.name).toBe('bulletList')
      expect(nodeTextWithLineBreaks(taskItem.child(1))).toBe('Nested child')
    })
  })

  describe('flattens structured blocks into text when source is serialized through lineText', () => {
    it('keeps quoteBlock multiline content when converting to paragraph', () => {
      const sourceText = 'line one\nline two'
      const editor = createEditor({
        type: 'quoteBlock',
        attrs: { text: sourceText }
      })

      expect(turnInto(editor, createTarget(editor), 'paragraph')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('paragraph')
      expect(nodeTextWithLineBreaks(converted)).toBe(sourceText)
    })

    it('flattens code block content into plain paragraph text without parsing markdown-like syntax', () => {
      const sourceText = '[[Note]]\n# heading\n- item'
      const editor = createEditor({
        type: 'codeBlock',
        content: [{ type: 'text', text: sourceText }]
      })

      expect(turnInto(editor, createTarget(editor), 'paragraph')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('paragraph')
      expect(nodeTextWithLineBreaks(converted)).toBe(sourceText)
      expect(converted.child(0).type.name).toBe('text')
      expect(converted.firstChild?.type.name).not.toBe('wikilink')
    })

    it('flattens table rows and multiline cells into task-list text', () => {
      const editor = createEditor({
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'h1' }]
                  }
                ]
              },
              {
                type: 'tableHeader',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'h2' }]
                  }
                ]
              }
            ]
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'c1a' }, { type: 'hardBreak' }, { type: 'text', text: 'c1b' }]
                  }
                ]
              },
              {
                type: 'tableCell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'c2' }]
                  }
                ]
              }
            ]
          }
        ]
      })

      expect(turnInto(editor, createTarget(editor), 'taskList')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('taskList')
      expect(nodeTextWithLineBreaks(converted)).toBe('h1 | h2\nc1ac1b | c2')
    })

    it('treats htmlBlock as raw text for paragraph, code block and quote conversions', () => {
      const sourceHtml = '<aside><strong>alpha</strong><br/>beta</aside>'
      const cases: TurnIntoType[] = ['paragraph', 'codeBlock', 'quote']

      for (const target of cases) {
        const editor = createEditor({
          type: 'htmlBlock',
          attrs: { html: sourceHtml }
        })

        expect(turnInto(editor, createTarget(editor), target), `htmlBlock -> ${target}`).toBe(true)
        const converted = editor.state.doc.child(0)
        expect(nodeTextWithLineBreaks(converted), `htmlBlock -> ${target}`).toBe(sourceHtml)
      }
    })

    it('keeps atom-block source data for callout and mermaid conversions', () => {
      const cases: Array<{ name: string; node: JSONContent; expected: string; target: TurnIntoType }> = [
        {
          name: 'calloutBlock',
          node: { type: 'calloutBlock', attrs: { kind: 'NOTE', message: 'callout body' } },
          expected: 'callout body',
          target: 'paragraph'
        },
        {
          name: 'mermaidBlock',
          node: { type: 'mermaidBlock', attrs: { code: 'graph TD\nA-->B' } },
          expected: 'graph TD\nA-->B',
          target: 'codeBlock'
        }
      ]

      for (const testCase of cases) {
        const editor = createEditor(testCase.node)
        expect(turnInto(editor, createTarget(editor), testCase.target), testCase.name).toBe(true)
        const converted = editor.state.doc.child(0)
        expect(nodeTextWithLineBreaks(converted), testCase.name).toBe(testCase.expected)
      }
    })
  })

  describe('converts entire ancestor list when target is inside list content', () => {
    it('converts a parent bullet list when target is a listItem and keeps wikilinks intact', () => {
      const editor = createEditor({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'wikilink', attrs: { target: 'systeme_climatique.md', label: 'Systeme climatique', exists: true } }
                ]
              }
            ]
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'wikilink', attrs: { target: 'ocean.md', label: 'Ocean', exists: true } }
                ]
              }
            ]
          }
        ]
      })

      expect(turnInto(editor, createTargetAtPos(editor, 1), 'taskList')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('taskList')
      expect(converted.childCount).toBe(2)
      expect(converted.child(0).type.name).toBe('taskItem')
      expect(converted.child(0).child(0).child(0).type.name).toBe('wikilink')
      expect(String(converted.child(0).child(0).child(0).attrs.target ?? '')).toBe('systeme_climatique.md')
      expect(String(converted.child(1).child(0).child(0).attrs.target ?? '')).toBe('ocean.md')
    })

    it('converts nested list structures by replacing the nearest ancestor list only once', () => {
      const editor = createEditor({
        type: 'orderedList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Parent item' }]
              },
              {
                type: 'orderedList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Nested item' }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      })

      expect(turnInto(editor, createTargetAtPos(editor, 6), 'taskList')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('taskList')
      expect(converted.childCount).toBe(1)
      expect(converted.child(0).type.name).toBe('taskItem')
      expect(converted.child(0).child(1).type.name).toBe('orderedList')
      expect(converted.child(0).child(0).type.name).toBe('paragraph')
      expect(nodeTextWithLineBreaks(converted.child(0).child(0))).toBe('Parent item')
      expect(nodeTextWithLineBreaks(converted.child(0).child(1))).toBe('Nested item')
    })
  })

  describe('documents known lossy conversions', () => {
    it('stores quote conversions as plain text attributes and loses inline wikilinks and marks', () => {
      const editor = createEditor({
        type: 'paragraph',
        content: richInlineFixture()
      })

      expect(turnInto(editor, createTarget(editor), 'quote')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('quoteBlock')
      expect(String(converted.attrs.text ?? '')).toBe(' bold italicinline')
      expect(converted.childCount).toBe(0)
    })

    it('flattens nested list hierarchy when converting list content to a paragraph', () => {
      const editor = createEditor({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Parent' }]
              },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Child' }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      })

      expect(turnInto(editor, createTarget(editor), 'paragraph')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('paragraph')
      expect(nodeTextWithLineBreaks(converted)).toBe('Parent\nChild')
      expect(converted.childCount).toBe(3)
      expect(converted.child(1).type.name).toBe('hardBreak')
    })

    it('turns markdown-looking code into a single plain-text list item rather than parsing sub-items', () => {
      const editor = createEditor({
        type: 'codeBlock',
        content: [{ type: 'text', text: '- alpha\n- beta\n[[Note]]' }]
      })

      expect(turnInto(editor, createTarget(editor), 'bulletList')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('bulletList')
      expect(converted.childCount).toBe(1)
      expect(nodeTextWithLineBreaks(converted)).toBe('- alpha\n- beta\n[[Note]]')
      expect(firstTextContainer(converted).child(0).type.name).toBe('text')
    })

    it('creates empty targets without synthetic fallback content for empty source blocks', () => {
      const cases: Array<{ source: JSONContent; target: TurnIntoType; expectedType: string }> = [
        { source: { type: 'paragraph' }, target: 'codeBlock', expectedType: 'codeBlock' },
        { source: { type: 'codeBlock' }, target: 'paragraph', expectedType: 'paragraph' },
        { source: { type: 'htmlBlock', attrs: { html: '' } }, target: 'quote', expectedType: 'quoteBlock' }
      ]

      for (const testCase of cases) {
        const editor = createEditor(testCase.source)
        expect(turnInto(editor, createTarget(editor), testCase.target), `${testCase.expectedType}:${testCase.target}`).toBe(true)
        const converted = editor.state.doc.child(0)
        expect(converted.type.name, `${testCase.expectedType}:${testCase.target}`).toBe(testCase.expectedType)
        expect(nodeTextWithLineBreaks(converted), `${testCase.expectedType}:${testCase.target}`).toBe('')
      }
    })
  })

  describe('conversion matrix keeps non-empty payloads observable', () => {
    it('converts every source/target pair without dropping non-empty content', () => {
      const sources: Array<{ name: string; node: JSONContent; expectedNonEmpty: boolean }> = [
        { name: 'paragraph', node: { type: 'paragraph', content: [{ type: 'text', text: 'Paragraph source' }] }, expectedNonEmpty: true },
        { name: 'heading', node: { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading source' }] }, expectedNonEmpty: true },
        {
          name: 'bulletList',
          node: {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet source' }] }] }]
          },
          expectedNonEmpty: true
        },
        {
          name: 'orderedList',
          node: {
            type: 'orderedList',
            content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ordered source' }] }] }]
          },
          expectedNonEmpty: true
        },
        {
          name: 'taskList',
          node: {
            type: 'taskList',
            content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task source' }] }] }]
          },
          expectedNonEmpty: true
        },
        { name: 'codeBlock', node: { type: 'codeBlock', content: [{ type: 'text', text: 'Code source' }] }, expectedNonEmpty: true },
        { name: 'quoteBlock', node: { type: 'quoteBlock', attrs: { text: 'Quote source' } }, expectedNonEmpty: true },
        { name: 'calloutBlock', node: { type: 'calloutBlock', attrs: { kind: 'NOTE', message: 'Callout source' } }, expectedNonEmpty: true },
        { name: 'mermaidBlock', node: { type: 'mermaidBlock', attrs: { code: 'graph TD\nA-->B' } }, expectedNonEmpty: true },
        { name: 'htmlBlock', node: { type: 'htmlBlock', attrs: { html: '<div>HTML source</div>' } }, expectedNonEmpty: true },
      ]

      for (const source of sources) {
        for (const targetType of TURN_INTO_TYPES) {
          const editor = createEditor(source.node)
          const convertedOk = turnInto(editor, createTarget(editor), targetType)
          expect(convertedOk, `${source.name} -> ${targetType}`).toBe(true)
          const converted = editor.state.doc.child(0)
          expect(converted, `${source.name} -> ${targetType} node`).toBeTruthy()
          if (source.expectedNonEmpty) {
            const text = nodeTextWithLineBreaks(converted)
            expect(text.length, `${source.name} -> ${targetType} content`).toBeGreaterThan(0)
          }
        }
      }
    })
  })
})
