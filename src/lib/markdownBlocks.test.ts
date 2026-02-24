import { describe, expect, it } from 'vitest'

import { editorDataToMarkdown, markdownToEditorData, sanitizeExternalHref } from './markdownBlocks'

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
  it('treats unknown html markup as paragraph text', () => {
    const markdown = `
<h1>hello</h1>

sddsd
`.trim()

    const parsed = markdownToEditorData(markdown)
    expect(parsed.blocks).toHaveLength(2)
    expect(parsed.blocks[0].type).toBe('paragraph')
    expect(String(parsed.blocks[0].data.text)).toContain('&lt;h1&gt;hello&lt;/h1&gt;')
    expect(parsed.blocks[1].type).toBe('paragraph')
    expect(String(parsed.blocks[1].data.text)).toBe('sddsd')
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
