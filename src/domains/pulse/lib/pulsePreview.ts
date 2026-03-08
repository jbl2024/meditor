import { sanitizeExternalHref } from '../../editor/lib/markdownBlocks'

export type PulseDiffKind = 'unchanged' | 'removed' | 'added'

export type PulseDiffSegment = {
  kind: PulseDiffKind
  text: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInlineMarkdown(value: string): string {
  const escaped = escapeHtml(value)

  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const safeHref = sanitizeExternalHref(href.trim())
      if (!safeHref) return `<span>${label}</span>`
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer">${label}</a>`
    })
}

function flushParagraph(lines: string[], html: string[]) {
  if (lines.length === 0) return
  html.push(`<p>${renderInlineMarkdown(lines.join(' '))}</p>`)
  lines.length = 0
}

function flushList(kind: 'ul' | 'ol' | null, items: string[], html: string[]) {
  if (!kind || items.length === 0) return
  html.push(`<${kind}>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${kind}>`)
  items.length = 0
}

export function renderPulseMarkdown(markdown: string): string {
  const normalized = markdown.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return ''

  const html: string[] = []
  const paragraph: string[] = []
  const listItems: string[] = []
  let listKind: 'ul' | 'ol' | null = null
  let inFence = false
  let fenceLines: string[] = []

  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trimEnd()

    if (line.startsWith('```')) {
      flushParagraph(paragraph, html)
      flushList(listKind, listItems, html)
      if (inFence) {
        html.push(`<pre><code>${escapeHtml(fenceLines.join('\n'))}</code></pre>`)
        fenceLines = []
        inFence = false
      } else {
        inFence = true
      }
      continue
    }

    if (inFence) {
      fenceLines.push(rawLine)
      continue
    }

    if (!line) {
      flushParagraph(paragraph, html)
      flushList(listKind, listItems, html)
      listKind = null
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph(paragraph, html)
      flushList(listKind, listItems, html)
      listKind = null
      html.push(`<h${headingMatch[1].length}>${renderInlineMarkdown(headingMatch[2])}</h${headingMatch[1].length}>`)
      continue
    }

    const quoteMatch = line.match(/^>\s?(.*)$/)
    if (quoteMatch) {
      flushParagraph(paragraph, html)
      flushList(listKind, listItems, html)
      listKind = null
      html.push(`<blockquote><p>${renderInlineMarkdown(quoteMatch[1])}</p></blockquote>`)
      continue
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.*)$/)
    if (unorderedMatch) {
      flushParagraph(paragraph, html)
      if (listKind && listKind !== 'ul') {
        flushList(listKind, listItems, html)
        listKind = null
      }
      listKind = 'ul'
      listItems.push(unorderedMatch[1])
      continue
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/)
    if (orderedMatch) {
      flushParagraph(paragraph, html)
      if (listKind && listKind !== 'ol') {
        flushList(listKind, listItems, html)
        listKind = null
      }
      listKind = 'ol'
      listItems.push(orderedMatch[1])
      continue
    }

    flushList(listKind, listItems, html)
    listKind = null
    paragraph.push(line)
  }

  if (inFence) {
    html.push(`<pre><code>${escapeHtml(fenceLines.join('\n'))}</code></pre>`)
  }

  flushParagraph(paragraph, html)
  flushList(listKind, listItems, html)

  return html.join('')
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
