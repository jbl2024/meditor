import { marked } from 'marked'
import { sanitizeHtmlForPreview } from '../../../shared/lib/htmlSanitizer'

export type PulseDiffKind = 'unchanged' | 'removed' | 'added'

export type PulseDiffSegment = {
  kind: PulseDiffKind
  text: string
}

const PULSE_MARKED_OPTIONS = {
  gfm: true,
  breaks: true
} as const

/**
 * Converts Pulse markdown into sanitized preview HTML.
 *
 * Pulse previews use the shared markdown renderer pattern so tables, task
 * lists, and other GFM structures render consistently without trusting raw
 * HTML output.
 */
export function renderPulseMarkdown(markdown: string): string {
  const normalized = String(markdown ?? '').replace(/\r\n?/g, '\n')
  if (!normalized.trim()) return ''

  const html = marked.parse(normalized, PULSE_MARKED_OPTIONS)
  return sanitizeHtmlForPreview(String(html ?? ''))
}

function tokenizeDiffInput(value: string): string[] {
  return value.match(/\s+|[^\s]+/g) ?? []
}

function pushSegment(segments: PulseDiffSegment[], kind: PulseDiffKind, text: string) {
  if (!text) return
  const previous = segments[segments.length - 1]
  if (previous?.kind === kind) {
    previous.text += text
    return
  }
  segments.push({ kind, text })
}

export function buildPulseDiff(sourceText: string, previewText: string): PulseDiffSegment[] {
  const source = tokenizeDiffInput(sourceText)
  const preview = tokenizeDiffInput(previewText)
  if (source.length === 0 && preview.length === 0) return []

  const dp = Array.from({ length: source.length + 1 }, () => Array<number>(preview.length + 1).fill(0))

  for (let i = source.length - 1; i >= 0; i -= 1) {
    for (let j = preview.length - 1; j >= 0; j -= 1) {
      if (source[i] === preview[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const segments: PulseDiffSegment[] = []
  let i = 0
  let j = 0

  while (i < source.length && j < preview.length) {
    if (source[i] === preview[j]) {
      pushSegment(segments, 'unchanged', source[i])
      i += 1
      j += 1
      continue
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushSegment(segments, 'removed', source[i])
      i += 1
      continue
    }
    pushSegment(segments, 'added', preview[j])
    j += 1
  }

  while (i < source.length) {
    pushSegment(segments, 'removed', source[i])
    i += 1
  }

  while (j < preview.length) {
    pushSegment(segments, 'added', preview[j])
    j += 1
  }

  return segments
}
