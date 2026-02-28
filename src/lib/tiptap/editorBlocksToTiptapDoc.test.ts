import { describe, expect, it } from 'vitest'
import { toTiptapDoc } from './editorBlocksToTiptapDoc'

describe('toTiptapDoc list inline content', () => {
  it('preserves external links and wikilinks in list items', () => {
    const doc = toTiptapDoc([
      {
        type: 'list',
        data: {
          style: 'unordered',
          items: [
            {
              content: '<a href="http://GLPI.md" target="_blank" rel="noopener noreferrer">GLPI.md</a>',
              items: []
            },
            {
              content: '<a href="wikilink:GLPI.md" data-wikilink-target="GLPI.md">GLPI.md</a>',
              items: []
            },
            {
              content: '<a href="wikilink:Another.md" data-wikilink-target="Another.md">Another.md</a>',
              items: []
            }
          ]
        }
      }
    ])

    expect(doc).toEqual({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'GLPI.md',
                      marks: [{ type: 'link', attrs: { href: 'http://GLPI.md' } }]
                    }
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
                    {
                      type: 'wikilink',
                      attrs: { target: 'GLPI.md', label: null, exists: true }
                    }
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
                    {
                      type: 'wikilink',
                      attrs: { target: 'Another.md', label: null, exists: true }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    })
  })
})
