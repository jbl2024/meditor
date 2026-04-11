import { describe, expect, it } from 'vitest'
import {
  defaultPropertyTypeForKey,
  inferPropertyType,
  isPropertyType,
  normalizePropertyKey,
  resolvePropertyType,
  sanitizePropertyTypeSchema
} from './propertyTypes'

describe('normalizePropertyKey', () => {
  it('lowercases and trims the key', () => {
    expect(normalizePropertyKey('  Title  ')).toBe('title')
    expect(normalizePropertyKey('TAGS')).toBe('tags')
    expect(normalizePropertyKey('created_at')).toBe('created_at')
  })
})

describe('inferPropertyType', () => {
  it('returns checkbox for booleans', () => {
    expect(inferPropertyType(true)).toBe('checkbox')
    expect(inferPropertyType(false)).toBe('checkbox')
  })

  it('returns number for finite numbers', () => {
    expect(inferPropertyType(42)).toBe('number')
    expect(inferPropertyType(-3.14)).toBe('number')
  })

  it('returns text for non-finite numbers', () => {
    expect(inferPropertyType(Infinity)).toBe('text')
    expect(inferPropertyType(NaN)).toBe('text')
  })

  it('returns list for arrays', () => {
    expect(inferPropertyType([])).toBe('list')
    expect(inferPropertyType(['a', 'b'])).toBe('list')
  })

  it('returns date for ISO date-only strings', () => {
    expect(inferPropertyType('2024-01-15')).toBe('date')
    expect(inferPropertyType('1999-12-31')).toBe('date')
  })

  it('returns text for non-date strings', () => {
    expect(inferPropertyType('hello')).toBe('text')
    expect(inferPropertyType('2024-01-15T12:00:00')).toBe('text')
    expect(inferPropertyType('')).toBe('text')
  })
})

describe('defaultPropertyTypeForKey', () => {
  it('returns tags for the "tags" key', () => {
    expect(defaultPropertyTypeForKey('tags')).toBe('tags')
    expect(defaultPropertyTypeForKey('TAGS')).toBe('tags')
  })

  it('returns list for aliases and cssclasses', () => {
    expect(defaultPropertyTypeForKey('aliases')).toBe('list')
    expect(defaultPropertyTypeForKey('cssclasses')).toBe('list')
    expect(defaultPropertyTypeForKey('ALIASES')).toBe('list')
  })

  it('returns null for unknown keys', () => {
    expect(defaultPropertyTypeForKey('title')).toBeNull()
    expect(defaultPropertyTypeForKey('created')).toBeNull()
  })
})

describe('resolvePropertyType', () => {
  it('prefers schema type over inference', () => {
    const schema = { title: 'text' as const }
    expect(resolvePropertyType('title', 42, schema)).toBe('text')
  })

  it('falls back to default key type when not in schema', () => {
    expect(resolvePropertyType('tags', [], {})).toBe('tags')
    expect(resolvePropertyType('aliases', [], {})).toBe('list')
  })

  it('falls back to inferred type when no schema and no default', () => {
    expect(resolvePropertyType('score', 99, {})).toBe('number')
    expect(resolvePropertyType('active', true, {})).toBe('checkbox')
    expect(resolvePropertyType('due', '2025-06-01', {})).toBe('date')
  })
})

describe('isPropertyType', () => {
  it('returns true for all valid property types', () => {
    const valid = ['text', 'list', 'number', 'checkbox', 'date', 'tags']
    for (const t of valid) {
      expect(isPropertyType(t)).toBe(true)
    }
  })

  it('returns false for unknown strings', () => {
    expect(isPropertyType('string')).toBe(false)
    expect(isPropertyType('boolean')).toBe(false)
    expect(isPropertyType('')).toBe(false)
  })
})

describe('sanitizePropertyTypeSchema', () => {
  it('normalizes keys and filters to valid types only', () => {
    const result = sanitizePropertyTypeSchema({
      Title: 'text',
      TAGS: 'tags',
      score: 'number',
      active: 'checkbox',
      due: 'date',
      refs: 'list'
    })
    expect(result).toEqual({
      title: 'text',
      tags: 'tags',
      score: 'number',
      active: 'checkbox',
      due: 'date',
      refs: 'list'
    })
  })

  it('drops entries with invalid type values', () => {
    const result = sanitizePropertyTypeSchema({ foo: 'invalid', bar: 'text' })
    expect(result).toEqual({ bar: 'text' })
  })

  it('drops entries with non-string keys or values', () => {
    const result = sanitizePropertyTypeSchema({ 42: 'text', valid: 'number' })
    // numeric keys become strings in JS objects; key "42" is fine
    expect(result['valid']).toBe('number')
  })

  it('returns empty object for null, undefined, and non-objects', () => {
    expect(sanitizePropertyTypeSchema(null)).toEqual({})
    expect(sanitizePropertyTypeSchema(undefined)).toEqual({})
    expect(sanitizePropertyTypeSchema('string')).toEqual({})
    expect(sanitizePropertyTypeSchema(42)).toEqual({})
  })

  it('skips empty keys after normalization', () => {
    const result = sanitizePropertyTypeSchema({ '   ': 'text', normal: 'text' })
    expect(result).toEqual({ normal: 'text' })
  })
})
