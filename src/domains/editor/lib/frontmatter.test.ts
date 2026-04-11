import { describe, expect, it } from 'vitest'
import { composeMarkdownDocument, parseFrontmatter, serializeFrontmatter } from './frontmatter'
import type { FrontmatterField } from './frontmatter'

const EMPTY_SCHEMA = {}

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe('parseFrontmatter', () => {
  it('returns hasFrontmatter:false for plain markdown', () => {
    const result = parseFrontmatter('# Hello\n\nworld', EMPTY_SCHEMA)
    expect(result.hasFrontmatter).toBe(false)
    expect(result.fields).toEqual([])
    expect(result.body).toBe('# Hello\n\nworld')
  })

  it('parses a simple scalar field', () => {
    const md = '---\ntitle: My Note\n---\nbody'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    expect(result.hasFrontmatter).toBe(true)
    expect(result.fields).toHaveLength(1)
    expect(result.fields[0]).toMatchObject({ key: 'title', value: 'My Note', type: 'text' })
    expect(result.body).toBe('body')
  })

  it('parses boolean scalars', () => {
    const md = '---\ndraft: true\npublished: false\n---\n'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    expect(result.fields.find((f) => f.key === 'draft')?.value).toBe(true)
    expect(result.fields.find((f) => f.key === 'published')?.value).toBe(false)
  })

  it('parses numeric scalars (integer and float)', () => {
    const md = '---\nrating: 5\npriority: -2\nweight: 3.14\n---\n'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    expect(result.fields.find((f) => f.key === 'rating')?.value).toBe(5)
    expect(result.fields.find((f) => f.key === 'priority')?.value).toBe(-2)
    expect(result.fields.find((f) => f.key === 'weight')?.value).toBe(3.14)
  })

  it('parses an inline list', () => {
    const md = '---\ntags: [alpha, beta, gamma]\n---\n'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    const field = result.fields.find((f) => f.key === 'tags')
    expect(field?.value).toEqual(['alpha', 'beta', 'gamma'])
    expect(field?.styleHint).toBe('inline-list')
  })

  it('parses a block list', () => {
    const md = '---\nrefs:\n  - a.md\n  - b.md\n---\n'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    const field = result.fields.find((f) => f.key === 'refs')
    expect(field?.value).toEqual(['a.md', 'b.md'])
    expect(field?.styleHint).toBe('block-list')
  })

  it('parses a literal block scalar', () => {
    const md = '---\nnotes: |\n  line one\n  line two\n---\n'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    const field = result.fields.find((f) => f.key === 'notes')
    expect(field?.styleHint).toBe('literal-block')
    expect(String(field?.value)).toContain('line one')
  })

  it('detects duplicate key errors', () => {
    const md = '---\ntitle: A\ntitle: B\n---\n'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    expect(result.parseErrors.some((e) => /duplicate/i.test(e.message))).toBe(true)
  })

  it('reports an error for unexpected indentation', () => {
    const md = '---\n  indented: value\n---\n'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    expect(result.parseErrors.some((e) => /indentation/i.test(e.message))).toBe(true)
  })

  it('reports an error for invalid property syntax', () => {
    const md = '---\njust-a-line-without-colon\n---\n'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    expect(result.parseErrors.some((e) => /invalid/i.test(e.message))).toBe(true)
  })

  it('prefers schema type over inferred type', () => {
    const schema = { score: 'text' as const }
    const md = '---\nscore: 42\n---\n'
    const result = parseFrontmatter(md, schema)
    expect(result.fields[0].type).toBe('text')
  })

  it('normalizes Windows CRLF line endings', () => {
    const md = '---\r\ntitle: Hello\r\n---\r\nbody'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    expect(result.hasFrontmatter).toBe(true)
    expect(result.fields[0].value).toBe('Hello')
  })

  it('skips comment lines and blank lines inside frontmatter', () => {
    const md = '---\n# a comment\n\ntitle: Real\n---\n'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    expect(result.fields).toHaveLength(1)
    expect(result.fields[0].key).toBe('title')
  })

  it('assigns ascending order values to fields', () => {
    const md = '---\na: 1\nb: 2\nc: 3\n---\n'
    const result = parseFrontmatter(md, EMPTY_SCHEMA)
    expect(result.fields.map((f) => f.order)).toEqual([0, 1, 2])
  })
})

// ---------------------------------------------------------------------------
// serializeFrontmatter
// ---------------------------------------------------------------------------

describe('serializeFrontmatter', () => {
  it('returns empty string for empty fields array', () => {
    expect(serializeFrontmatter([])).toBe('')
  })

  it('serializes a plain text field', () => {
    const fields: FrontmatterField[] = [{ key: 'title', value: 'My Note', type: 'text', order: 0, styleHint: 'plain' }]
    expect(serializeFrontmatter(fields)).toBe('title: My Note')
  })

  it('serializes a boolean field', () => {
    const fields: FrontmatterField[] = [{ key: 'draft', value: true, type: 'checkbox', order: 0, styleHint: 'plain' }]
    expect(serializeFrontmatter(fields)).toBe('draft: true')
  })

  it('serializes a number field', () => {
    const fields: FrontmatterField[] = [{ key: 'rating', value: 5, type: 'number', order: 0, styleHint: 'plain' }]
    expect(serializeFrontmatter(fields)).toBe('rating: 5')
  })

  it('serializes an inline list for tags', () => {
    const fields: FrontmatterField[] = [{ key: 'tags', value: ['a', 'b'], type: 'tags', order: 0, styleHint: 'inline-list' }]
    expect(serializeFrontmatter(fields)).toBe('tags: [a, b]')
  })

  it('serializes a block list', () => {
    const fields: FrontmatterField[] = [{ key: 'refs', value: ['a.md', 'b.md'], type: 'list', order: 0, styleHint: 'block-list' }]
    expect(serializeFrontmatter(fields)).toBe('refs:\n  - a.md\n  - b.md')
  })

  it('serializes an empty list', () => {
    const fields: FrontmatterField[] = [{ key: 'refs', value: [], type: 'list', order: 0, styleHint: 'block-list' }]
    expect(serializeFrontmatter(fields)).toBe('refs: []')
  })

  it('serializes a literal-block string', () => {
    const fields: FrontmatterField[] = [{ key: 'notes', value: 'line one\nline two', type: 'text', order: 0, styleHint: 'literal-block' }]
    const result = serializeFrontmatter(fields)
    expect(result).toContain('notes: |')
    expect(result).toContain('  line one')
    expect(result).toContain('  line two')
  })

  it('sorts fields by order when they are out of sequence', () => {
    const fields: FrontmatterField[] = [
      { key: 'b', value: 'second', type: 'text', order: 1, styleHint: 'plain' },
      { key: 'a', value: 'first', type: 'text', order: 0, styleHint: 'plain' }
    ]
    expect(serializeFrontmatter(fields)).toBe('a: first\nb: second')
  })

  it('quotes values with YAML-significant characters', () => {
    const fields: FrontmatterField[] = [{ key: 'ref', value: '[[notes/today]]', type: 'text', order: 0, styleHint: 'plain' }]
    const result = serializeFrontmatter(fields)
    expect(result).toMatch(/ref: "/)
  })

  it('does not quote plain ISO date values', () => {
    const fields: FrontmatterField[] = [{ key: 'due', value: '2025-06-01', type: 'date', order: 0, styleHint: 'plain' }]
    expect(serializeFrontmatter(fields)).toBe('due: 2025-06-01')
  })

  it('quotes empty string values', () => {
    const fields: FrontmatterField[] = [{ key: 'title', value: '', type: 'text', order: 0, styleHint: 'plain' }]
    expect(serializeFrontmatter(fields)).toBe('title: ""')
  })
})

// ---------------------------------------------------------------------------
// composeMarkdownDocument
// ---------------------------------------------------------------------------

describe('composeMarkdownDocument', () => {
  it('wraps body with frontmatter delimiters when yaml is non-empty', () => {
    const result = composeMarkdownDocument('body text', 'title: My Note')
    expect(result).toBe('---\ntitle: My Note\n---\nbody text')
  })

  it('returns just the body when yaml is empty', () => {
    expect(composeMarkdownDocument('just body', '')).toBe('just body')
    expect(composeMarkdownDocument('just body', '   ')).toBe('just body')
  })

  it('strips leading and trailing blank lines from yaml', () => {
    const result = composeMarkdownDocument('body', '\n\ntitle: A\n\n')
    expect(result).toBe('---\ntitle: A\n---\nbody')
  })

  it('normalizes CRLF line endings in body', () => {
    const result = composeMarkdownDocument('line1\r\nline2', 'title: X')
    expect(result).toBe('---\ntitle: X\n---\nline1\nline2')
  })
})
