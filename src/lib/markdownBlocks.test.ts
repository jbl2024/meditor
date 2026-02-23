import { describe, expect, it } from 'vitest'

import { markdownToEditorData, sanitizeExternalHref } from './markdownBlocks'

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
})
