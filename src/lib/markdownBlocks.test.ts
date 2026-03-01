import { describe, expect, it } from 'vitest'

import {
  clipboardHtmlToMarkdown,
  editorDataToMarkdown,
  inlineTextToHtml,
  markdownToEditorData,
  sanitizeExternalHref
} from './markdownBlocks'

describe('sanitizeExternalHref', () => {
  it('allows http/https/mailto', () => {
    expect(sanitizeExternalHref('https://example.com')).toBe('https://example.com')
    expect(sanitizeExternalHref('http://example.com/path')).toBe('http://example.com/path')
    expect(sanitizeExternalHref('mailto:test@example.com')).toBe('mailto:test@example.com')
  })

  it('rejects dangerous schemes and malformed links', () => {
    expect(sanitizeExternalHref('javascript:alert(1)')).toBeNull()
    expect(sanitizeExternalHref('data:text/html,abc')).toBeNull()
    expect(sanitizeExternalHref('file:///etc/passwd')).toBeNull()
    expect(sanitizeExternalHref('/relative/path')).toBeNull()
    expect(sanitizeExternalHref('')).toBeNull()
  })
})

describe('clipboardHtmlToMarkdown', () => {
  it('converts core html blocks to markdown', () => {
    const html = `
      <h2>Title</h2>
      <p>Hello <strong>world</strong></p>
      <ul><li>First</li><li>Second</li></ul>
      <blockquote><p>Quoted line</p></blockquote>
      <table>
        <tr><th>Col</th><th>Val</th></tr>
        <tr><td>A</td><td>B</td></tr>
      </table>
    `

    const markdown = clipboardHtmlToMarkdown(html)
    expect(markdown).toContain('## Title')
    expect(markdown).toContain('Hello **world**')
    expect(markdown).toContain('- First')
    expect(markdown).toContain('> Quoted line')
    expect(markdown).toContain('| Col | Val |')
    expect(markdown).toContain('| --- | --- |')
  })

  it('keeps unsafe href schemes inert through markdown parsing', () => {
    const html = '<p><a href="javascript:alert(1)">bad</a></p>'
    const markdown = clipboardHtmlToMarkdown(html)
    expect(markdown).toContain('[bad](javascript:alert(1))')

    const parsed = markdownToEditorData(markdown)
    expect(parsed.blocks).toHaveLength(1)
    expect(String(parsed.blocks[0].data.text)).not.toContain('<a ')
    expect(String(parsed.blocks[0].data.text)).toContain('[bad](javascript:alert(1))')
  })

  it('round-trips wikilink-style anchors from html', () => {
    const html = '<p><a href="wikilink:notes%2Falpha.md" data-wikilink-target="notes/alpha.md">Alpha</a></p>'
    const markdown = clipboardHtmlToMarkdown(html)
    expect(markdown).toContain('[[notes/alpha.md|Alpha]]')
  })
})

describe('markdownToEditorData tables', () => {
  it('parses tables that have an empty header row', () => {
    const markdown = `
|  |  |  |
| --- | --- | --- |
| a | b | e |
| c | d | f |
`.trim()

    const parsed = markdownToEditorData(markdown)
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.blocks[0]).toEqual({
      type: 'table',
      data: {
        withHeadings: true,
        content: [
          ['', '', ''],
          ['a', 'b', 'e'],
          ['c', 'd', 'f']
        ]
      }
    })
  })

  it('renders inline markdown inside table cells', () => {
    const markdown = `
| Feature | Value |
| --- | --- |
| **Deployment** | Single binary |
`.trim()

    const parsed = markdownToEditorData(markdown)
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.blocks[0].type).toBe('table')
    expect(parsed.blocks[0].data).toEqual({
      withHeadings: true,
      content: [
        ['Feature', 'Value'],
        ['<strong>Deployment</strong>', 'Single binary']
      ]
    })
  })

  it('preserves table inline formatting when saving back to markdown', () => {
    const markdown = `
| Feature | Value |
| --- | --- |
| **Deployment** | Single binary |
`.trim()

    const parsed = markdownToEditorData(markdown)
    const output = editorDataToMarkdown(parsed)
    expect(output).toContain('| **Deployment** | Single binary |')
  })

  it('pads sparse rows to stable column count when serializing tables', () => {
    const output = editorDataToMarkdown({
      blocks: [
        {
          type: 'table',
          data: {
            withHeadings: true,
            content: [
              ['A', 'B', 'C'],
              ['1', '2'],
              ['x']
            ]
          }
        }
      ]
    })

    expect(output).toContain('| A | B | C |')
    expect(output).toContain('| 1 | 2 |  |')
    expect(output).toContain('| x |  |  |')
  })
})

describe('nested lists', () => {
  it('parses nested unordered lists from indentation', () => {
    const markdown = `
- a
- b
  - nest1
  - nest2
- c
`.trim()

    const parsed = markdownToEditorData(markdown)
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.blocks[0]).toEqual({
      type: 'list',
      data: {
        style: 'unordered',
        items: [
          { content: 'a', items: [] },
          {
            content: 'b',
            items: [
              { content: 'nest1', items: [] },
              { content: 'nest2', items: [] }
            ]
          },
          { content: 'c', items: [] }
        ]
      }
    })
  })

  it('preserves nested unordered lists in markdown round-trip', () => {
    const input = `
- a
- b
  - nest1
  - nest2
- c
`.trim()

    const parsed = markdownToEditorData(input)
    const markdown = editorDataToMarkdown(parsed)
    expect(markdown).toContain('- b\n  - nest1\n  - nest2')
    const reparsed = markdownToEditorData(markdown)
    expect(reparsed.blocks[0]).toEqual(parsed.blocks[0])
  })
})

describe('wikilinks with underscores', () => {
  it('does not interpret intraword underscores as italic', () => {
    const markdown = '[[showcase/folder_with_underscore/note_in_folder.md]]'
    const parsed = markdownToEditorData(markdown)
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.blocks[0].type).toBe('paragraph')
    expect(String(parsed.blocks[0].data.text)).toContain('showcase/folder_with_underscore/note_in_folder.md')
    expect(String(parsed.blocks[0].data.text)).not.toContain('<em>')
  })
})

describe('underline formatting', () => {
  it('parses inline <u> tags as underline html', () => {
    const parsed = markdownToEditorData('This is <u>important</u>.')
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.blocks[0].type).toBe('paragraph')
    expect(String(parsed.blocks[0].data.text)).toContain('<u>important</u>')
  })

  it('preserves underline tags in markdown round-trip', () => {
    const markdown = 'This is <u>important</u>.'
    const parsed = markdownToEditorData(markdown)
    const output = editorDataToMarkdown(parsed)
    expect(output).toContain('<u>important</u>')
  })
})

describe('inline links with surrounding emphasis', () => {
  it('renders bold around markdown links', () => {
    const html = inlineTextToHtml('**[liens](https://google.com)**')
    expect(html).toContain('<strong><a href="https://google.com"')
    expect(html).toContain('>liens</a></strong>')
  })

  it('renders bold around wikilinks', () => {
    const html = inlineTextToHtml('**[[journal/2026-02-22.md]]**')
    expect(html).toContain('<strong><a href="wikilink:journal%2F2026-02-22.md"')
    expect(html).toContain('>journal/2026-02-22.md</a></strong>')
  })
})

describe('indented blocks', () => {
  it('parses four-space indented content as code block (not raw)', () => {
    const markdown = `
2026-02-22 test

    [[showcase/folder_with_underscore/note_in_folder.md]]
`.trim()

    const parsed = markdownToEditorData(markdown)
    expect(parsed.blocks).toHaveLength(2)
    expect(parsed.blocks[0].type).toBe('paragraph')
    expect(parsed.blocks[1]).toEqual({
      type: 'code',
      data: {
        code: '[[showcase/folder_with_underscore/note_in_folder.md]]',
        language: ''
      }
    })
  })
})

describe('html-like lines', () => {
  it('parses block html markup into html blocks', () => {
    const markdown = `
<h1>hello</h1>

sddsd
`.trim()

    const parsed = markdownToEditorData(markdown)
    expect(parsed.blocks).toHaveLength(2)
    expect(parsed.blocks[0].type).toBe('html')
    expect(String(parsed.blocks[0].data.html)).toContain('<h1>hello</h1>')
    expect(parsed.blocks[1].type).toBe('paragraph')
    expect(String(parsed.blocks[1].data.text)).toBe('sddsd')
  })

  it('round-trips multiline html blocks as raw html markdown', () => {
    const markdown = `
<div style="text-align: center;">
<strong>One<br>Two</strong>
</div>
`.trim()
    const parsed = markdownToEditorData(markdown)
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.blocks[0].type).toBe('html')
    expect(editorDataToMarkdown(parsed).trim()).toBe(markdown)
  })
})

describe('blockquote parsing', () => {
  it('keeps multiline quote structure including list lines', () => {
    const markdown = `
> Une citation principale.
>
> Un second paragraphe dans la citation.
>
> - Une liste dans la citation
> - Un second point
`.trim()

    const parsed = markdownToEditorData(markdown)
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.blocks[0].type).toBe('quote')
    expect(String(parsed.blocks[0].data.text)).toContain('\n\n')
    expect(String(parsed.blocks[0].data.text)).toContain('- Une liste dans la citation')
  })

  it('round-trips nested quote markers in quote content', () => {
    const markdown = `
> > Citation imbriquée niveau 2
> >
> > > Citation niveau 3
`.trim()

    const parsed = markdownToEditorData(markdown)
    const output = editorDataToMarkdown(parsed)
    expect(output).toContain('> > Citation imbriquée niveau 2')
    expect(output).toContain('> > > Citation niveau 3')
  })
})
