import { describe, expect, it } from 'vitest'

import QuoteTool from './QuoteTool'

function paragraphTexts(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('.meditor-quote-paragraph'))
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
}

describe('QuoteTool', () => {
  it('renders nested quote markers when markers are spaced', () => {
    const tool = new QuoteTool({
      data: {
        text: ['> Citation imbriquee niveau 2', '>', '> > Citation niveau 3'].join('\n')
      },
      readOnly: true
    })

    const root = tool.render() as HTMLElement
    const nested = root.querySelectorAll('.meditor-quote-nested')
    const paragraphs = paragraphTexts(root)

    expect(nested.length).toBe(2)
    expect(paragraphs).toContain('Citation imbriquee niveau 2')
    expect(paragraphs).toContain('Citation niveau 3')
    expect(paragraphs.some((text) => text.startsWith('>'))).toBe(false)
  })

  it('parses list items when list marker is indented', () => {
    const tool = new QuoteTool({
      data: {
        text: ['Une citation principale.', '', '  - Une liste dans la citation', '  - Un second point'].join('\n')
      },
      readOnly: true
    })

    const root = tool.render() as HTMLElement
    const items = Array.from(root.querySelectorAll('.meditor-quote-list li')).map((node) => node.textContent?.trim())

    expect(items).toEqual(['Une liste dans la citation', 'Un second point'])
  })

  it('renders standard inline markdown formatting in quote content', () => {
    const tool = new QuoteTool({
      data: {
        text: [
          'Texte **gras** et *italique* et `code`.',
          '',
          '- [Example](https://example.com)',
          '- [[showcase/note.md|Alias]]'
        ].join('\n')
      },
      readOnly: true
    })

    const root = tool.render() as HTMLElement
    const strong = root.querySelector('strong')
    const em = root.querySelector('em')
    const code = root.querySelector('code.inline-code')
    const externalLink = root.querySelector('a[href="https://example.com"]')
    const wikilink = root.querySelector('a[data-wikilink-target="showcase/note.md"]')

    expect(strong?.textContent).toBe('gras')
    expect(em?.textContent).toBe('italique')
    expect(code?.textContent).toBe('code')
    expect(externalLink?.textContent).toBe('Example')
    expect(wikilink?.textContent).toBe('Alias')
  })
})
