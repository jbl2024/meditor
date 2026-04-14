import { Node } from '@tiptap/core'
import { ListKit } from '@tiptap/extension-list'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { type JSONContent, Editor } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import { deleteNodes, duplicateNodes, moveNodesDown, moveNodesUp, turnInto, turnIntoAll } from './actions'
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

const AssetBlockNode = Node.create({
  name: 'assetBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return { src: { default: '' }, alt: { default: '' }, title: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'figure[data-asset-node="true"]' }]
  },
  renderHTML({ node }) {
    return ['figure', { 'data-asset-node': 'true', 'data-src': String(node.attrs.src ?? ''), 'data-alt': String(node.attrs.alt ?? ''), 'data-title': String(node.attrs.title ?? '') }]
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
  return createMultiEditor([firstNode])
}

function createMultiEditor(nodes: JSONContent[]): Editor {
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
      AssetBlockNode,
      MermaidBlockNode,
      HtmlBlockNode,
      WikilinkNode
    ],
    content: {
      type: 'doc',
      content: nodes
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
    if (node.type?.name === 'assetBlock') {
      const alt = String(node.attrs?.alt ?? '')
      const src = String(node.attrs?.src ?? '')
      const title = String(node.attrs?.title ?? '')
      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
    }
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

function richInlineFixtureWithoutBreak(): JSONContent[] {
  return [
    { type: 'wikilink', attrs: { target: 'Note.md', label: 'Note', exists: true } },
    { type: 'text', text: ' ' },
    { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
    { type: 'text', text: ' ' },
    { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
    { type: 'text', text: 'inline', marks: [{ type: 'code' }] }
  ]
}

function expectRichInlinePreserved(container: any, hasHardBreak = false) {
  expect(['paragraph', 'heading', 'codeBlock']).toContain(container.type.name)
  expect(container.child(0).type.name).toBe('wikilink')
  expect(String(container.child(0).attrs.target ?? '')).toBe('Note.md')
  expect(container.child(2).marks.some((mark: any) => mark.type.name === 'bold')).toBe(true)
  expect(container.child(4).marks.some((mark: any) => mark.type.name === 'italic')).toBe(true)
  if (hasHardBreak) {
    expect(container.child(5).type.name).toBe('hardBreak')
    expect(container.child(6).marks.some((mark: any) => mark.type.name === 'code')).toBe(true)
  } else {
    expect(container.child(5).marks.some((mark: any) => mark.type.name === 'code')).toBe(true)
  }
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe('blockMenu turnInto', () => {
  describe('preserves rich inline content when source supports fragment reuse', () => {
    it('keeps wikilinks and marks when converting paragraph to heading', () => {
      const editor = createEditor({
        type: 'paragraph',
        content: richInlineFixtureWithoutBreak()
      })

      expect(turnInto(editor, createTarget(editor), 'heading2')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('heading')
      expect(converted.attrs.level).toBe(2)
      expectRichInlinePreserved(converted)
    })

    it('keeps wikilinks and marks when converting paragraph to task list', () => {
      const editor = createEditor({
        type: 'paragraph',
        content: richInlineFixtureWithoutBreak()
      })

      expect(turnInto(editor, createTarget(editor), 'taskList')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('taskList')
      expectRichInlinePreserved(firstTextContainer(converted))
    })

    it('splits hard breaks into distinct list items when converting a paragraph to a bullet list', () => {
      const editor = createEditor({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a' },
          { type: 'hardBreak' },
          { type: 'text', text: 'b' },
          { type: 'hardBreak' },
          { type: 'text', text: 'c' },
          { type: 'hardBreak' },
          { type: 'text', text: 'd' }
        ]
      })

      expect(turnInto(editor, createTarget(editor), 'bulletList')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('bulletList')
      expect(converted.childCount).toBe(4)
      expect(converted.child(0).child(0).textContent).toBe('a')
      expect(converted.child(1).child(0).textContent).toBe('b')
      expect(converted.child(2).child(0).textContent).toBe('c')
      expect(converted.child(3).child(0).textContent).toBe('d')
    })

    it('keeps inline structure when converting a heading into a bullet list', () => {
      const editor = createEditor({
        type: 'heading',
        attrs: { level: 3 },
        content: richInlineFixtureWithoutBreak()
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
      expectRichInlinePreserved(taskItem.child(0), true)
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

    it('keeps asset block markdown when converting to paragraph', () => {
      const editor = createEditor({
        type: 'assetBlock',
        attrs: { src: '../../assets/images/Formulaire_GLPI/asset.png', alt: 'asset' }
      })

      expect(turnInto(editor, createTarget(editor), 'paragraph')).toBe(true)
      const converted = editor.state.doc.child(0)
      expect(converted.type.name).toBe('paragraph')
      expect(nodeTextWithLineBreaks(converted)).toBe('![asset](../../assets/images/Formulaire_GLPI/asset.png)')
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

  describe('turnIntoAll — multi-block selection', () => {
    function targetsForAllChildren(editor: Editor): BlockMenuTarget[] {
      const targets: BlockMenuTarget[] = []
      editor.state.doc.forEach((_node, offset) => {
        targets.push(createTargetAtPos(editor, offset))
      })
      return targets
    }

    it('converts all selected paragraphs to heading1', () => {
      const editor = createMultiEditor([
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] }
      ])
      const targets = targetsForAllChildren(editor)
      expect(turnIntoAll(editor, targets, 'heading1')).toBe(true)
      expect(editor.state.doc.childCount).toBeGreaterThanOrEqual(3)
      expect(editor.state.doc.child(0).type.name).toBe('heading')
      expect(editor.state.doc.child(0).attrs.level).toBe(1)
      expect(editor.state.doc.child(0).textContent).toBe('First')
      expect(editor.state.doc.child(1).type.name).toBe('heading')
      expect(editor.state.doc.child(1).attrs.level).toBe(1)
      expect(editor.state.doc.child(1).textContent).toBe('Second')
      expect(editor.state.doc.child(2).type.name).toBe('heading')
      expect(editor.state.doc.child(2).attrs.level).toBe(1)
      expect(editor.state.doc.child(2).textContent).toBe('Third')
    })

    it('converts a mix of headings and paragraphs to bullet list', () => {
      const editor = createMultiEditor([
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }
      ])
      const targets = targetsForAllChildren(editor)
      expect(turnIntoAll(editor, targets, 'bulletList')).toBe(true)
      // TipTap may append a trailing paragraph after list nodes, so check at least 2 converted nodes
      expect(editor.state.doc.childCount).toBeGreaterThanOrEqual(2)
      expect(editor.state.doc.child(0).type.name).toBe('bulletList')
      expect(editor.state.doc.child(0).textContent).toBe('Title')
      expect(editor.state.doc.child(1).type.name).toBe('bulletList')
      expect(editor.state.doc.child(1).textContent).toBe('Body')
    })

    it('converts all paragraphs to codeBlock preserving text', () => {
      const editor = createMultiEditor([
        { type: 'paragraph', content: [{ type: 'text', text: 'line one' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'line two' }] }
      ])
      const targets = targetsForAllChildren(editor)
      expect(turnIntoAll(editor, targets, 'codeBlock')).toBe(true)
      // TipTap may append a trailing paragraph after code block nodes
      expect(editor.state.doc.childCount).toBeGreaterThanOrEqual(2)
      expect(editor.state.doc.child(0).type.name).toBe('codeBlock')
      expect(editor.state.doc.child(0).textContent).toBe('line one')
      expect(editor.state.doc.child(1).type.name).toBe('codeBlock')
      expect(editor.state.doc.child(1).textContent).toBe('line two')
    })

    it('converts multiple list nodes to a different list type', () => {
      const editor = createMultiEditor([
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item A' }] }] }]
        },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item B' }] }] }]
        }
      ])
      const targets = targetsForAllChildren(editor)
      expect(turnIntoAll(editor, targets, 'taskList')).toBe(true)
      // TipTap may append a trailing paragraph after list nodes
      expect(editor.state.doc.childCount).toBeGreaterThanOrEqual(2)
      expect(editor.state.doc.child(0).type.name).toBe('taskList')
      expect(editor.state.doc.child(1).type.name).toBe('taskList')
    })

    it('falls back to single-block behavior for a single target', () => {
      const editor = createMultiEditor([
        { type: 'paragraph', content: [{ type: 'text', text: 'Solo' }] }
      ])
      const targets = targetsForAllChildren(editor)
      expect(turnIntoAll(editor, targets, 'heading2')).toBe(true)
      expect(editor.state.doc.child(0).type.name).toBe('heading')
      expect(editor.state.doc.child(0).attrs.level).toBe(2)
      expect(editor.state.doc.child(0).textContent).toBe('Solo')
    })

    it('returns false for empty targets', () => {
      const editor = createMultiEditor([
        { type: 'paragraph', content: [{ type: 'text', text: 'x' }] }
      ])
      expect(turnIntoAll(editor, [], 'heading1')).toBe(false)
    })

    it('converts only the two selected blocks, not unselected ones', () => {
      const editor = createMultiEditor([
        { type: 'paragraph', content: [{ type: 'text', text: 'Unselected' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Selected A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Selected B' }] }
      ])
      // Manually pick only the 2nd and 3rd nodes
      const targets = [
        createTargetAtPos(editor, editor.state.doc.child(0).nodeSize),
        createTargetAtPos(editor, editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize)
      ]
      expect(turnIntoAll(editor, targets, 'heading3')).toBe(true)
      expect(editor.state.doc.child(0).type.name).toBe('paragraph')
      expect(editor.state.doc.child(1).type.name).toBe('heading')
      expect(editor.state.doc.child(1).attrs.level).toBe(3)
      expect(editor.state.doc.child(2).type.name).toBe('heading')
      expect(editor.state.doc.child(2).attrs.level).toBe(3)
    })
  })

  describe('multi-block actions', () => {
    function selectedTargets(editor: Editor, indexes: number[]): BlockMenuTarget[] {
      const targets: BlockMenuTarget[] = []
      editor.state.doc.forEach((_node, offset, index) => {
        if (!indexes.includes(index)) return
        targets.push(createTargetAtPos(editor, offset))
      })
      return targets
    }

    function docTexts(editor: Editor) {
      return Array.from({ length: editor.state.doc.childCount }, (_unused, index) => editor.state.doc.child(index).textContent)
    }

    it('duplicates the full selected block range', () => {
      const editor = createMultiEditor([
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'C' }] }
      ])

      expect(duplicateNodes(editor, selectedTargets(editor, [0, 1]))).toBe(true)
      expect(docTexts(editor).slice(0, 5)).toEqual(['A', 'B', 'A', 'B', 'C'])
    })

    it('deletes the full selected block range', () => {
      const editor = createMultiEditor([
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'C' }] }
      ])

      expect(deleteNodes(editor, selectedTargets(editor, [0, 1]))).toBe(true)
      expect(docTexts(editor)[0]).toBe('C')
    })

    it('moves the selected block range up and down as a group', () => {
      const upEditor = createMultiEditor([
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'C' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'D' }] }
      ])

      expect(moveNodesUp(upEditor, selectedTargets(upEditor, [1, 2]))).toBe(true)
      expect(docTexts(upEditor).slice(0, 4)).toEqual(['B', 'C', 'A', 'D'])

      const downEditor = createMultiEditor([
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'C' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'D' }] }
      ])

      expect(moveNodesDown(downEditor, selectedTargets(downEditor, [1, 2]))).toBe(true)
      expect(docTexts(downEditor).slice(0, 4)).toEqual(['A', 'D', 'B', 'C'])
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
