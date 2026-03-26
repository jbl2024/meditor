import { Extension, type Editor } from '@tiptap/vue-3'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import nspell from 'nspell'
import englishDictionaryAff from '../../../../../../node_modules/dictionary-en/index.aff?raw'
import englishDictionaryDic from '../../../../../../node_modules/dictionary-en/index.dic?raw'
import frenchDictionaryAff from '../../../../../../node_modules/dictionary-fr/index.aff?raw'
import frenchDictionaryDic from '../../../../../../node_modules/dictionary-fr/index.dic?raw'
import { resolveSpellcheckLanguage, type SpellcheckLanguage } from '../../../lib/spellcheck'

/**
 * ProseMirror spellcheck decorations for the editor body.
 *
 * Boundary:
 * - Owns token scanning, dictionary loading, and decoration generation.
 * - Does not decide note language; callers inject the language resolver.
 */
type Spellchecker = ReturnType<typeof nspell>

type SpellcheckPluginState = {
  language: SpellcheckLanguage
  decorations: DecorationSet
}

type SpellcheckRefreshMeta = {
  type: 'refresh'
  language?: SpellcheckLanguage
}

export type SpellcheckDecorationRange = {
  from: number
  to: number
}

export type SpellcheckWordHit = {
  from: number
  to: number
  word: string
  language: SpellcheckLanguage
}

export type SpellcheckExtensionOptions = {
  getLanguage: () => SpellcheckLanguage
  isWordIgnored?: (word: string) => boolean
}

const SPELLCHECK_TOKEN_RE = /[\p{L}]+(?:[’'-][\p{L}]+)*/gu
const SPELLCHECK_CODE_MARK_NAMES = new Set(['code'])
const SPELLCHECK_REFRESH_KEY = new PluginKey<SpellcheckPluginState>('tomosona-spellcheck')

export function normalizeSpellcheckToken(token: string): string {
  return String(token ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
}

function normalizeSpellcheckComparisonToken(token: string): string {
  return normalizeSpellcheckToken(token)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/['’\-]/g, '')
}

/**
 * Normalizes common orthographic variants so near-identical French spellings
 * such as "orthographe" and "orthografe" score as a single obvious fix.
 */
function normalizeSpellcheckPhoneticToken(token: string): string {
  return normalizeSpellcheckComparisonToken(token)
    .replace(/ph/g, 'f')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
}

function spellcheckJaroWinklerSimilarity(left: string, right: string): number {
  if (left === right) return 1
  if (!left || !right) return 0

  const leftLength = left.length
  const rightLength = right.length
  const matchDistance = Math.max(0, Math.floor(Math.max(leftLength, rightLength) / 2) - 1)
  const leftMatches = new Array<boolean>(leftLength).fill(false)
  const rightMatches = new Array<boolean>(rightLength).fill(false)

  let matches = 0
  for (let leftIndex = 0; leftIndex < leftLength; leftIndex += 1) {
    const start = Math.max(0, leftIndex - matchDistance)
    const end = Math.min(rightLength, leftIndex + matchDistance + 1)
    for (let rightIndex = start; rightIndex < end; rightIndex += 1) {
      if (rightMatches[rightIndex]) continue
      if (left[leftIndex] !== right[rightIndex]) continue
      leftMatches[leftIndex] = true
      rightMatches[rightIndex] = true
      matches += 1
      break
    }
  }

  if (!matches) return 0

  let transpositions = 0
  let rightIndex = 0
  for (let leftIndex = 0; leftIndex < leftLength; leftIndex += 1) {
    if (!leftMatches[leftIndex]) continue
    while (rightIndex < rightLength && !rightMatches[rightIndex]) rightIndex += 1
    if (rightIndex < rightLength && left[leftIndex] !== right[rightIndex]) {
      transpositions += 1
    }
    rightIndex += 1
  }

  const jaro =
    (
      matches / leftLength +
      matches / rightLength +
      (matches - transpositions / 2) / matches
    ) / 3

  let prefix = 0
  const prefixLimit = Math.min(4, leftLength, rightLength)
  while (prefix < prefixLimit && left[prefix] === right[prefix]) {
    prefix += 1
  }

  return jaro + prefix * 0.1 * (1 - jaro)
}

/**
 * Returns a heuristic confidence score for a suggestion.
 */
export function calculateSpellcheckSuggestionConfidence(original: string, suggestion: string): number {
  const normalizedOriginal = normalizeSpellcheckComparisonToken(original)
  const normalizedSuggestion = normalizeSpellcheckComparisonToken(suggestion)
  if (!normalizedOriginal || !normalizedSuggestion) return 0
  const phoneticOriginal = normalizeSpellcheckPhoneticToken(original)
  const phoneticSuggestion = normalizeSpellcheckPhoneticToken(suggestion)
  const phoneticSimilarity = spellcheckJaroWinklerSimilarity(phoneticOriginal, phoneticSuggestion)
  const directSimilarity = spellcheckJaroWinklerSimilarity(normalizedOriginal, normalizedSuggestion)
  return Math.max(directSimilarity, phoneticSimilarity)
}

function getSpellcheckTokenCaseStyle(token: string): 'upper' | 'title' | 'lower' | 'mixed' {
  const letters = Array.from(String(token ?? '').normalize('NFC')).filter((character) => /\p{L}/u.test(character)).join('')
  if (!letters) return 'mixed'
  if (letters === letters.toLocaleUpperCase()) return 'upper'
  if (letters === letters.toLocaleLowerCase()) return 'lower'

  const firstLetter = Array.from(String(token ?? '').normalize('NFC')).find((character) => /\p{L}/u.test(character))
  if (firstLetter && firstLetter === firstLetter.toLocaleUpperCase()) {
    const restLetters = Array.from(String(token ?? '').normalize('NFC'))
      .filter((character) => /\p{L}/u.test(character))
      .slice(1)
      .join('')
    if (restLetters === restLetters.toLocaleLowerCase()) return 'title'
  }

  return 'mixed'
}

function capitalizeSpellcheckSuggestion(value: string): string {
  const lower = String(value ?? '').toLocaleLowerCase()
  const chars = Array.from(lower)
  const letterIndex = chars.findIndex((character) => /\p{L}/u.test(character))
  if (letterIndex < 0) return lower
  chars[letterIndex] = chars[letterIndex].toLocaleUpperCase()
  return chars.join('')
}

/**
 * Adapts a suggestion to the casing of the original token.
 */
export function applySpellcheckSuggestionCase(original: string, suggestion: string): string {
  const style = getSpellcheckTokenCaseStyle(original)
  if (style === 'upper') return suggestion.toLocaleUpperCase()
  if (style === 'title') return capitalizeSpellcheckSuggestion(suggestion)
  if (style === 'lower') return suggestion.toLocaleLowerCase()
  return suggestion
}

export type SpellcheckSuggestionPresentation = {
  mode: 'single' | 'list'
  primarySuggestion: string | null
  confidence: number
}

export type SpellcheckSuggestionRank = {
  suggestion: string
  confidence: number
}

const SPELLCHECK_CONFIDENCE_THRESHOLD = 0.95

/**
 * Chooses whether a popup should expose a single primary action or a list.
 */
export function resolveSpellcheckSuggestionPresentation(
  original: string,
  suggestions: string[]
): SpellcheckSuggestionPresentation {
  const rankedSuggestions = rankSpellcheckSuggestions(original, suggestions)
  const firstSuggestion = rankedSuggestions[0] ?? null
  if (!firstSuggestion) {
    return {
      mode: 'list',
      primarySuggestion: null,
      confidence: 0
    }
  }

  const confidence = firstSuggestion.confidence
  if (rankedSuggestions.length === 1 && confidence >= SPELLCHECK_CONFIDENCE_THRESHOLD) {
    return {
      mode: 'single',
      primarySuggestion: firstSuggestion.suggestion,
      confidence
    }
  }

  return {
    mode: 'list',
    primarySuggestion: firstSuggestion.suggestion,
    confidence
  }
}

/**
 * Ranks suggestions from most likely fix to least likely fix.
 */
export function rankSpellcheckSuggestions(
  original: string,
  suggestions: string[]
): SpellcheckSuggestionRank[] {
  const normalizedOriginal = normalizeSpellcheckComparisonToken(original)
  const ranked = Array.from(new Set(suggestions))
    .map((suggestion) => {
      const normalizedSuggestion = normalizeSpellcheckComparisonToken(suggestion)
      if (!normalizedSuggestion || normalizedSuggestion === normalizedOriginal) return null
      return {
        suggestion: applySpellcheckSuggestionCase(original, suggestion),
        confidence: calculateSpellcheckSuggestionConfidence(original, suggestion)
      }
    })
    .filter((entry): entry is SpellcheckSuggestionRank => Boolean(entry))

  const seen = new Set<string>()
  return ranked
    .sort((left, right) => {
      if (right.confidence !== left.confidence) return right.confidence - left.confidence
      return left.suggestion.localeCompare(right.suggestion)
    })
    .filter((entry) => {
      const normalizedSuggestion = normalizeSpellcheckToken(entry.suggestion)
      if (seen.has(normalizedSuggestion)) return false
      seen.add(normalizedSuggestion)
      return true
    })
}

const spellcheckerCache = new Map<SpellcheckLanguage, Spellchecker>()
const spellcheckerLoaders: Record<SpellcheckLanguage, () => Promise<Spellchecker>> = {
  en: loadEnglishSpellchecker,
  fr: loadFrenchSpellchecker
}

async function loadEnglishSpellchecker() {
  const spellchecker = nspell({ aff: englishDictionaryAff, dic: englishDictionaryDic })
  return spellchecker
}

async function loadFrenchSpellchecker() {
  const spellchecker = nspell({ aff: frenchDictionaryAff, dic: frenchDictionaryDic })
  return spellchecker
}

function getSpellchecker(language: SpellcheckLanguage): Spellchecker | null {
  return spellcheckerCache.get(language) ?? null
}

async function ensureSpellchecker(language: SpellcheckLanguage): Promise<Spellchecker> {
  const cached = getSpellchecker(language)
  if (cached) return cached

  const loader = spellcheckerLoaders[language]
  const spellchecker = await loader()
  spellcheckerCache.set(language, spellchecker)
  return spellchecker
}

function isCodeTextNode(node: ProseMirrorNode): boolean {
  return node.marks.some((mark) => SPELLCHECK_CODE_MARK_NAMES.has(mark.type.name) || Boolean(mark.type.spec.code))
}

function isIgnoredTextblock(node: ProseMirrorNode): boolean {
  return Boolean(node.type.spec.code) || node.type.name === 'codeBlock'
}

function collectSpellcheckDecorations(
  doc: ProseMirrorNode,
  language: SpellcheckLanguage,
  spellchecker: Spellchecker,
  options?: { isWordIgnored?: (word: string) => boolean }
): DecorationSet {
  const decorations = collectSpellcheckDecorationRanges(doc, language, spellchecker, options).map((range) =>
    Decoration.inline(range.from, range.to, {
      class: 'tomosona-spellcheck-error',
      'data-spellcheck-error': 'true'
    })
  )

  return DecorationSet.create(doc, decorations)
}

/**
 * Collects raw ranges for all misspelled tokens in a document.
 *
 * Exported for tests and for keeping the decoration builder itself trivial.
 */
export function collectSpellcheckDecorationRanges(
  doc: ProseMirrorNode,
  language: SpellcheckLanguage,
  spellchecker: Spellchecker,
  options?: { isWordIgnored?: (word: string) => boolean }
): SpellcheckDecorationRange[] {
  const ranges: SpellcheckDecorationRange[] = []

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    if (isIgnoredTextblock(node)) return false

    node.descendants((child, childPos) => {
      if (!child.isText || !child.text || isCodeTextNode(child)) return true

      const basePos = pos + childPos + 1
      let match: RegExpExecArray | null
      SPELLCHECK_TOKEN_RE.lastIndex = 0
      while ((match = SPELLCHECK_TOKEN_RE.exec(child.text)) !== null) {
        const token = match[0]
        if (!isSpellcheckWordIgnored(token, options) && !isSpellcheckWordKnown(spellchecker, token, language)) {
          const from = basePos + match.index
          const to = from + token.length
          ranges.push({ from, to })
        }
      }

      return true
    })

    return true
  })

  return ranges
}

function isSpellcheckWordIgnored(
  token: string,
  options?: { isWordIgnored?: (word: string) => boolean }
): boolean {
  const normalized = normalizeSpellcheckToken(token)
  if (!normalized) return false
  return Boolean(options?.isWordIgnored?.(normalized) ?? false)
}

function isSpellcheckWordKnown(spellchecker: Spellchecker, token: string, language: SpellcheckLanguage): boolean {
  if (spellchecker.correct(token)) return true

  if (language === 'fr' && token.includes("'")) {
    const parts = token.split(/['’]/g).filter(Boolean)
    if (parts.length >= 2) {
      const trailing = parts[parts.length - 1]
      if (trailing && spellchecker.correct(trailing)) {
        return true
      }
    }
  }

  if (token.includes('-')) {
    const parts = token.split('-').filter(Boolean)
    if (parts.length > 1 && parts.every((part) => spellchecker.correct(part))) {
      return true
    }
  }

  return false
}

function buildSpellcheckState(
  doc: ProseMirrorNode,
  language: SpellcheckLanguage,
  options?: { isWordIgnored?: (word: string) => boolean }
): SpellcheckPluginState {
  const spellchecker = getSpellchecker(language)
  const decorations = spellchecker ? collectSpellcheckDecorations(doc, language, spellchecker, options) : DecorationSet.empty
  return {
    language,
    decorations
  }
}

/**
 * Returns the misspelled word hit under a document position when the spellcheck
 * plugin has already decorated it.
 */
export function getSpellcheckWordHitAtPos(editorState: EditorState, pos: number): SpellcheckWordHit | null {
  const pluginState = SPELLCHECK_REFRESH_KEY.getState(editorState)
  if (!pluginState) return null
  const matches = pluginState.decorations.find(Math.max(0, pos - 1), pos + 1)
  const hit = matches[0]
  if (!hit) return null
  const word = editorState.doc.textBetween(hit.from, hit.to, '\n', '\0').trim()
  if (!word) return null
  return {
    from: hit.from,
    to: hit.to,
    word,
    language: pluginState.language
  }
}

/**
 * Returns the misspelled word hit covered by a selection range, if any.
 */
export function getSpellcheckWordHitAtRange(editorState: EditorState, from: number, to: number): SpellcheckWordHit | null {
  const pluginState = SPELLCHECK_REFRESH_KEY.getState(editorState)
  if (!pluginState) return null
  const start = Math.max(0, Math.min(from, to))
  const end = Math.max(0, Math.max(from, to))
  const matches = pluginState.decorations.find(start, end)
  const hit = matches[0]
  if (!hit) return null
  const word = editorState.doc.textBetween(hit.from, hit.to, '\n', '\0').trim()
  if (!word) return null
  return {
    from: hit.from,
    to: hit.to,
    word,
    language: pluginState.language
  }
}

/**
 * Returns ranked suggestions for a misspelled word using the cached dictionary.
 */
export async function getSpellcheckSuggestions(language: SpellcheckLanguage, word: string): Promise<string[]> {
  const spellchecker = await ensureSpellchecker(language)
  return Array.from(new Set(spellchecker.suggest(word))).slice(0, 8)
}

/**
 * Warms both bundled dictionaries so the first editor open does not pay the
 * nspell construction cost on the critical path.
 */
export async function warmupSpellcheckDictionaries(): Promise<void> {
  await Promise.allSettled([ensureSpellchecker('en'), ensureSpellchecker('fr')])
}

function requestSpellcheckerRefresh(
  view: { dispatch: (transaction: Transaction) => void; state: EditorState; isDestroyed?: boolean },
  language: SpellcheckLanguage,
  getLanguage: () => SpellcheckLanguage
) {
  void ensureSpellchecker(language)
    .then(() => {
      if (view.isDestroyed) return
      if (getLanguage() !== language) return
      view.dispatch(view.state.tr.setMeta(SPELLCHECK_REFRESH_KEY, { type: 'refresh', language } satisfies SpellcheckRefreshMeta))
    })
    .catch((err: unknown) => {
      console.error('[spellcheck] failed to load dictionary', err)
    })
}

export const SpellcheckExtension = Extension.create<SpellcheckExtensionOptions>({
  name: 'spellcheck',

  addProseMirrorPlugins() {
    const getLanguage = this.options.getLanguage
    const isWordIgnored = this.options.isWordIgnored

    return [
      new Plugin<SpellcheckPluginState>({
        key: SPELLCHECK_REFRESH_KEY,
        state: {
          init: (_, state) => {
            const language = getLanguage()
            return buildSpellcheckState(state.doc, language, { isWordIgnored })
          },
          apply(tr, pluginState, _oldState, newState) {
            const meta = tr.getMeta(SPELLCHECK_REFRESH_KEY) as SpellcheckRefreshMeta | undefined
            const language = meta?.language ?? pluginState.language

            if (meta?.type === 'refresh') {
              return buildSpellcheckState(newState.doc, language, { isWordIgnored })
            }

            if (tr.docChanged) {
              return buildSpellcheckState(newState.doc, language, { isWordIgnored })
            }

            return pluginState
          }
        },
        view(view) {
          let requestedLanguage: SpellcheckLanguage | null = null

          const ensureLanguage = () => {
            const language = getLanguage()
            if (requestedLanguage === language) return
            requestedLanguage = language
            requestSpellcheckerRefresh(view, language, getLanguage)
          }

          ensureLanguage()

          return {
            update() {
              ensureLanguage()
            }
          }
        },
        props: {
          decorations(state) {
            return SPELLCHECK_REFRESH_KEY.getState(state)?.decorations ?? DecorationSet.empty
          }
        }
      })
    ]
  }
})

export function getSpellcheckState(editorState: EditorState): SpellcheckPluginState {
  return SPELLCHECK_REFRESH_KEY.getState(editorState) ?? {
    language: resolveSpellcheckLanguage(),
    decorations: DecorationSet.empty
  }
}

/**
 * Triggers a synchronous refresh transaction for an already mounted editor.
 */
export function refreshSpellcheckDecorations(editor: Editor, language: SpellcheckLanguage) {
  editor.view.dispatch(editor.state.tr.setMeta(SPELLCHECK_REFRESH_KEY, { type: 'refresh', language }))
}
