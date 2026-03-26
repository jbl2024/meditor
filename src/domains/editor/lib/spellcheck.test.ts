import { describe, expect, it } from 'vitest'
import type { FrontmatterEnvelope } from './frontmatter'
import {
  resolveFrontmatterSpellcheckLanguage,
  resolveSpellcheckLanguage,
  resolveSystemSpellcheckLanguage
} from './spellcheck'
import {
  applySpellcheckSuggestionCase,
  calculateSpellcheckSuggestionConfidence,
  rankSpellcheckSuggestions,
  resolveSpellcheckSuggestionPresentation
} from './tiptap/extensions/Spellcheck'

describe('spellcheck language resolution', () => {
  it('prefers explicit frontmatter language over system locale', () => {
    const frontmatter: FrontmatterEnvelope = {
      hasFrontmatter: true,
      rawYaml: 'language: fr',
      fields: [{ key: 'language', value: 'fr', type: 'text', order: 0, styleHint: 'plain' }],
      body: 'Body',
      parseErrors: []
    }

    expect(resolveSpellcheckLanguage({ frontmatter, systemLocale: 'en-US' })).toBe('fr')
    expect(resolveFrontmatterSpellcheckLanguage(frontmatter)).toBe('fr')
  })

  it('accepts lang as a frontmatter alias', () => {
    const frontmatter: FrontmatterEnvelope = {
      hasFrontmatter: true,
      rawYaml: 'lang: en',
      fields: [{ key: 'lang', value: 'en', type: 'text', order: 0, styleHint: 'plain' }],
      body: 'Body',
      parseErrors: []
    }

    expect(resolveSpellcheckLanguage({ frontmatter, systemLocale: 'fr-FR' })).toBe('en')
  })

  it('normalizes system locales to fr or en', () => {
    expect(resolveSystemSpellcheckLanguage('fr-CA')).toBe('fr')
    expect(resolveSystemSpellcheckLanguage(['de-DE', 'en-GB'])).toBe('en')
  })

  it('falls back to English when no locale is usable', () => {
    expect(resolveSystemSpellcheckLanguage('zz-ZZ')).toBe('en')
    expect(resolveSpellcheckLanguage({ systemLocale: 'zz-ZZ' })).toBe('en')
  })

  it('computes a high-confidence single suggestion for close spellcheck matches', () => {
    const confidence = calculateSpellcheckSuggestionConfidence('orthografe', 'orthographe')

    expect(confidence).toBeGreaterThan(0.95)
    expect(resolveSpellcheckSuggestionPresentation('orthografe', ['orthographe'])).toEqual({
      mode: 'single',
      primarySuggestion: 'orthographe',
      confidence: expect.any(Number)
    })
  })

  it('orders multiple suggestions by confidence', () => {
    const ranked = rankSpellcheckSuggestions('orthografe', ['ornithologie', 'orthographe'])

    expect(ranked.map((item) => item.suggestion)).toEqual(['orthographe', 'ornithologie'])
    expect(ranked[0]?.confidence).toBeGreaterThan(ranked[1]?.confidence ?? 0)
  })

  it('adapts suggestion casing to the original token', () => {
    expect(applySpellcheckSuggestionCase('orthografe', 'orthographe')).toBe('orthographe')
    expect(applySpellcheckSuggestionCase('Orthografe', 'orthographe')).toBe('Orthographe')
    expect(applySpellcheckSuggestionCase('ORTHOGRAFE', 'orthographe')).toBe('ORTHOGRAPHE')
  })
})
