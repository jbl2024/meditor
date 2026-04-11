import { describe, expect, it } from 'vitest'
import { buildPulseDiff, renderPulseMarkdown } from './pulsePreview'

describe('renderPulseMarkdown', () => {
  it('renders headings, paragraphs, lists, quotes, code blocks, and tables', () => {
    const html = renderPulseMarkdown([
      '# Title',
      '',
      'Paragraph with **bold** and *emphasis*.',
      '',
      '- First',
      '- Second',
      '',
      '> Quote',
      '',
      '```',
      'const value = 1 < 2',
      '```',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |'
    ].join('\n'))

    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<p>Paragraph with <strong>bold</strong> and <em>emphasis</em>.</p>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>First</li>')
    expect(html).toContain('<li>Second</li>')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<p>Quote</p>')
    expect(html).toContain('&lt; 2')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>A</th>')
    expect(html).toContain('<td>2</td>')
  })

  it('sanitizes dangerous links and escapes raw html', () => {
    const html = renderPulseMarkdown('Open [bad](javascript:alert(1)) and <script>alert(1)</script>')

    expect(html).not.toContain('javascript:alert(1)')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('javascript:alert(1)')
  })

  it('sanitizes table and link html through the shared preview sanitizer', () => {
    const html = renderPulseMarkdown('| A | B |\n| - | - |\n| 1 | [bad](javascript:alert(1)) |')
    expect(html).toContain('<table>')
    expect(html).not.toContain('javascript:alert(1)')
    expect(html).not.toContain('<script>')
  })
})

describe('buildPulseDiff', () => {
  it('marks unchanged content when strings match', () => {
    expect(buildPulseDiff('alpha beta', 'alpha beta')).toEqual([
      { kind: 'unchanged', text: 'alpha beta' }
    ])
  })

  it('handles replacement, addition, and removal', () => {
    expect(buildPulseDiff('alpha beta', 'alpha gamma beta')).toEqual([
      { kind: 'unchanged', text: 'alpha ' },
      { kind: 'added', text: 'gamma ' },
      { kind: 'unchanged', text: 'beta' }
    ])

    expect(buildPulseDiff('alpha beta', 'alpha')).toEqual([
      { kind: 'unchanged', text: 'alpha' },
      { kind: 'removed', text: ' beta' }
    ])
  })

  it('handles empty, punctuation, repeated words, and multiline input', () => {
    expect(buildPulseDiff('', 'new text')).toEqual([{ kind: 'added', text: 'new text' }])
    expect(buildPulseDiff('hello, hello', 'hello hello!')).toEqual([
      { kind: 'removed', text: 'hello, ' },
      { kind: 'unchanged', text: 'hello' },
      { kind: 'added', text: ' hello!' }
    ])
    expect(buildPulseDiff('line one\nline two', 'line one\nline three')).toEqual([
      { kind: 'unchanged', text: 'line one\nline ' },
      { kind: 'removed', text: 'two' },
      { kind: 'added', text: 'three' }
    ])
  })
})
