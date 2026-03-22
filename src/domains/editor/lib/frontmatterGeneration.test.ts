import { describe, expect, it } from 'vitest'
import { mergeGeneratedFrontmatterProperties } from './frontmatterGeneration'

describe('mergeGeneratedFrontmatterProperties', () => {
  it('fills missing properties in auto mode without overwriting non-empty values', () => {
    const result = mergeGeneratedFrontmatterProperties(
      [
        { key: 'status', value: 'draft', type: 'text', order: 0, styleHint: 'plain' },
        { key: 'summary', value: '', type: 'text', order: 1, styleHint: 'plain' }
      ],
      [
        { key: 'status', type: 'text', value: 'published' },
        { key: 'tags', type: 'tags', value: ['notes', 'draft'] }
      ],
      { mode: 'auto' }
    )

    expect(result.appliedKeys).toEqual(['tags'])
    expect(result.fields.find((field) => field.key === 'status')?.value).toBe('draft')
    expect(result.fields.find((field) => field.key === 'tags')?.value).toEqual(['notes', 'draft'])
  })

  it('replaces only the target field in sparkle mode', () => {
    const result = mergeGeneratedFrontmatterProperties(
      [
        { key: 'status', value: 'draft', type: 'text', order: 0, styleHint: 'plain' },
        { key: 'tags', value: ['alpha'], type: 'tags', order: 1, styleHint: 'inline-list' }
      ],
      [
        { key: 'status', type: 'text', value: 'published' },
        { key: 'tags', type: 'tags', value: ['beta'] }
      ],
      { mode: 'field', targetKey: 'status' }
    )

    expect(result.appliedKeys).toEqual(['status'])
    expect(result.fields.find((field) => field.key === 'status')?.value).toBe('published')
    expect(result.fields.find((field) => field.key === 'tags')?.value).toEqual(['alpha'])
  })
})
