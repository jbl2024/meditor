import type { FrontmatterEnvelope } from './frontmatter'

/**
 * Spellcheck language resolution for editor notes.
 *
 * Boundary:
 * - Resolves only the small language contract needed by the editor spellchecker.
 * - Does not parse generic YAML beyond the already structured frontmatter envelope.
 */
export type SpellcheckLanguage = 'en' | 'fr'

const LANGUAGE_KEYS = new Set(['lang', 'language'])

function normalizeLanguageTag(value: string): SpellcheckLanguage | null {
  const normalized = value.trim().toLowerCase().replace(/_/g, '-')
  if (!normalized) return null

  const base = normalized.split('-')[0]
  if (base === 'en') return 'en'
  if (base === 'fr') return 'fr'
  return null
}

/**
 * Extracts an explicit spellcheck language from note frontmatter.
 *
 * Accepted keys:
 * - `language`
 * - `lang`
 *
 * Only string values are considered; non-string YAML scalars are ignored.
 */
export function resolveFrontmatterSpellcheckLanguage(envelope: FrontmatterEnvelope | null | undefined): SpellcheckLanguage | null {
  if (!envelope?.fields.length) return null

  for (const field of envelope.fields) {
    if (!LANGUAGE_KEYS.has(field.key.trim().toLowerCase())) continue
    if (typeof field.value !== 'string') continue

    const language = normalizeLanguageTag(field.value)
    if (language) return language
  }

  return null
}

function readLocaleCandidates(systemLocale?: string | string[] | null): string[] {
  const candidates: string[] = []

  if (Array.isArray(systemLocale)) {
    candidates.push(...systemLocale)
  } else if (typeof systemLocale === 'string') {
    candidates.push(systemLocale)
  }

  const navigatorLike = globalThis.navigator
  if (navigatorLike?.languages?.length) {
    candidates.push(...navigatorLike.languages)
  }
  if (navigatorLike?.language) {
    candidates.push(navigatorLike.language)
  }

  const resolvedLocale = Intl.DateTimeFormat().resolvedOptions().locale
  if (resolvedLocale) {
    candidates.push(resolvedLocale)
  }

  return candidates
}

/**
 * Resolves a language from system/browser locale data.
 *
 * Fallback is intentionally explicit: if no locale maps to `en` or `fr`, the
 * function returns `en` so the spellchecker always has a deterministic default.
 */
export function resolveSystemSpellcheckLanguage(systemLocale?: string | string[] | null): SpellcheckLanguage {
  for (const candidate of readLocaleCandidates(systemLocale)) {
    const language = normalizeLanguageTag(candidate)
    if (language) return language
  }

  return 'en'
}

/**
 * Resolves the editor spellcheck language with the expected priority:
 * frontmatter override, then system/browser locale, then English fallback.
 */
export function resolveSpellcheckLanguage(options: {
  frontmatter?: FrontmatterEnvelope | null
  systemLocale?: string | string[] | null
} = {}): SpellcheckLanguage {
  return (
    resolveFrontmatterSpellcheckLanguage(options.frontmatter) ??
    resolveSystemSpellcheckLanguage(options.systemLocale)
  )
}
