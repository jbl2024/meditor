import { describe, expect, it } from 'vitest'
import { embeddedNoteMarkdownToTiptapDoc, resolveEmbeddedNoteMarkdown } from './embeddedNoteRestoration'

describe('resolveEmbeddedNoteMarkdown', () => {
  it('resolves full note bodies without anchors', () => {
    expect(resolveEmbeddedNoteMarkdown('---\ntitle: Alpha\n---\n# Heading\n\nBody', 'notes/alpha')).toBe('# Heading\n\nBody')
  })

  it('ignores aliases when resolving embedded note targets', () => {
    expect(resolveEmbeddedNoteMarkdown('---\ntitle: Alpha\n---\n# Heading\n\nBody', 'notes/alpha|Alpha')).toBe('# Heading\n\nBody')
  })

  it('resolves heading anchors to the matching section', () => {
    expect(resolveEmbeddedNoteMarkdown('---\ntitle: Alpha\n---\n# Heading\n\nBody\n\n## Other\nTail', 'notes/alpha#Heading')).toBe('# Heading\n\nBody\n\n## Other\nTail')
  })

  it('resolves block anchors to the matching block line', () => {
    expect(resolveEmbeddedNoteMarkdown('---\ntitle: Alpha\n---\nBody ^block-1\n\nTail', 'notes/alpha#^block-1')).toBe('Body')
  })
})

describe('embeddedNoteMarkdownToTiptapDoc', () => {
  it('rebuilds the Tiptap doc from the resolved markdown fragment', () => {
    const doc = embeddedNoteMarkdownToTiptapDoc('---\ntitle: Alpha\n---\n# Heading\n\nBody', 'notes/alpha#Heading')

    expect(doc).toEqual({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Heading' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Body' }]
        }
      ]
    })
  })

  it('keeps empty embedded notes as an empty doc', () => {
    const doc = embeddedNoteMarkdownToTiptapDoc('---\ntitle: Alpha\n---\n', 'notes/alpha')

    expect(doc).toEqual({
      type: 'doc',
      content: []
    })
  })

  it('returns null when the requested section cannot be resolved', () => {
    expect(embeddedNoteMarkdownToTiptapDoc('---\ntitle: Alpha\n---\n# Heading\n\nBody', 'notes/alpha#Missing')).toBeNull()
  })
})
