import { normalizeCalloutKind } from './callouts'
import { parseWikilinkTarget } from './wikilinks'

export type EditorBlock = {
  id?: string
  type: string
  data: Record<string, unknown>
}

export type EditorDocument = {
  time: number
  blocks: EditorBlock[]
  version: string
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const ORDERED_LIST_RE = /^\s*\d+\.\s+(.+)$/
const UNORDERED_LIST_RE = /^\s*[-*+]\s+(.+)$/
const TASK_LIST_RE = /^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/
const HR_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const FENCE_START_RE = /^```\s*([^`]*)$/
const CALLOUT_MARKER_RE = /^\[!([A-Za-z0-9_-]+)\]\s*(.*)$/

type RichListItem = {
  content?: string
  meta?: { checked?: boolean }
  items?: RichListItem[]
}

function normalizeInput(markdown: string): string {
  return markdown.replace(/\r\n?/g, '\n')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function extractCodeSpans(value: string): { text: string; tokens: string[] } {
  const tokens: string[] = []
  let out = ''
  let i = 0

  while (i < value.length) {
    if (value[i] !== '`') {
      out += value[i]
      i += 1
      continue
    }

    let markerLength = 1
    while (i + markerLength < value.length && value[i + markerLength] === '`') {
      markerLength += 1
    }

    const marker = '`'.repeat(markerLength)
    const closeIndex = value.indexOf(marker, i + markerLength)
    if (closeIndex === -1) {
      out += marker
      i += markerLength
      continue
    }

    const content = value.slice(i + markerLength, closeIndex)
    const token = `\u0000MDCODE${tokens.length}\u0000`
    tokens.push(`<code class="inline-code">${escapeHtml(content)}</code>`)
    out += token
    i = closeIndex + markerLength
  }

  return { text: out, tokens }
}

function parseInlineSegment(value: string): string {
  if (!value) return ''

  const escapes: string[] = []
  const escapedValue = value.replace(/\\([\\`*_~[\](){}#+\-.!|])/g, (_, ch: string) => {
    const token = `\u0000MDESC${escapes.length}\u0000`
    escapes.push(escapeHtml(ch))
    return token
  })

  const { text, tokens: codeTokens } = extractCodeSpans(escapedValue)
  let html = escapeHtml(text)

  html = html.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>')
  html = html.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*(?=\S)([\s\S]*?\S)\*(?!\*)/g, '$1<em>$2</em>')
  html = html.replace(/(^|[^_])_(?=\S)([\s\S]*?\S)_(?!_)/g, '$1<em>$2</em>')

  codeTokens.forEach((tokenHtml, index) => {
    html = html.split(`\u0000MDCODE${index}\u0000`).join(tokenHtml)
  })
  escapes.forEach((escapedChar, index) => {
    html = html.split(`\u0000MDESC${index}\u0000`).join(escapedChar)
  })

  return html
}

function inlineMarkdownToHtml(value: string): string {
  const tokenRe = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)\s]+)\)/g
  let html = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(value)) !== null) {
    const full = match[0]
    const index = match.index
    const isEscaped = index > 0 && value[index - 1] === '\\'

    if (isEscaped) {
      continue
    }

    html += parseInlineSegment(value.slice(lastIndex, index))
    if (match[1]) {
      const target = match[1].trim()
      const alias = (match[2] ?? '').trim()
      const parsed = parseWikilinkTarget(target)
      const defaultLabel = parsed.anchor?.heading && !parsed.notePath ? parsed.anchor.heading : target
      const label = alias || defaultLabel
      if (!target) {
        html += parseInlineSegment(full)
      } else {
        const href = `wikilink:${encodeURIComponent(target)}`
        html += `<a href="${escapeHtml(href)}" data-wikilink-target="${escapeHtml(target)}">${parseInlineSegment(label)}</a>`
      }
    } else {
      const text = match[3]
      const href = match[4]
      const safeHref = sanitizeExternalHref(href)
      if (safeHref) {
        html += `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${parseInlineSegment(text)}</a>`
      } else {
        html += parseInlineSegment(full)
      }
    }
    lastIndex = index + full.length
  }

  html += parseInlineSegment(value.slice(lastIndex))
  return html
}

export function sanitizeExternalHref(raw: string): string | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return null

  try {
    const parsed = new URL(value, 'https://meditor.local')
    const protocol = parsed.protocol.toLowerCase()
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
      if (!parsed.hostname && protocol !== 'mailto:') return null
      return value
    }
  } catch {
    return null
  }

  return null
}

function blockTextToHtml(value: string): string {
  return inlineMarkdownToHtml(value).replace(/\n/g, '<br>')
}

function elementToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()
  const children = Array.from(element.childNodes).map(elementToMarkdown).join('')

  if (tag === 'br') return '\n'
  if (tag === 'strong' || tag === 'b') return `**${children}**`
  if (tag === 'em' || tag === 'i') return `*${children}*`
  if (tag === 's' || tag === 'strike') return `~~${children}~~`
  if (tag === 'code') return `\`${children.replace(/`/g, '\\`')}\``

  if (tag === 'a') {
    const href = element.getAttribute('href')?.trim() ?? ''
    const wikilinkTarget = (() => {
      const dataTarget = element.getAttribute('data-wikilink-target')?.trim()
      if (dataTarget) return dataTarget
      if (href.toLowerCase().startsWith('wikilink:')) {
        try {
          return decodeURIComponent(href.slice('wikilink:'.length)).trim()
        } catch {
          return ''
        }
      }
      if (href === '#') {
        return children.trim()
      }
      return ''
    })()

    if (wikilinkTarget) {
      const label = children.trim()
      const parsed = parseWikilinkTarget(wikilinkTarget)
      const defaultLabel = parsed.anchor?.heading && !parsed.notePath ? parsed.anchor.heading : wikilinkTarget
      if (label && label !== defaultLabel) {
        return `[[${wikilinkTarget}|${label}]]`
      }
      return `[[${wikilinkTarget}]]`
    }

    if (href) return `[${children}](${href})`
  }

  return children
}

function inlineHtmlToMarkdown(value: unknown): string {
  const html = String(value ?? '')
  if (!html.trim()) return ''

  const container = document.createElement('div')
  container.innerHTML = html
  return Array.from(container.childNodes).map(elementToMarkdown).join('')
}

function normalizeLine(line: string): string {
  return line.replace(/[ \t]+$/g, '')
}

function normalizeMultiline(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(normalizeLine)
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

function isRawFallbackStart(line: string): boolean {
  const trimmed = line.trimStart()
  if (line.startsWith('    ') || line.startsWith('\t')) return true
  if (trimmed.startsWith('|') || trimmed.startsWith('<')) return true
  return false
}

function parseTableCells(line: string, options?: { allowEmptyRow?: boolean }): string[] | null {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.includes('|')) return null
  if (!trimmed.startsWith('|') && !trimmed.endsWith('|')) return null

  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  const cells = inner.split('|').map((cell) => cell.trim().replace(/\\\|/g, '|'))
  if (!cells.length) return null
  if (!options?.allowEmptyRow && cells.every((cell) => cell.length === 0)) return null
  return cells
}

function isTableSeparatorLine(line: string, expectedColumns: number): boolean {
  const cells = parseTableCells(line)
  if (!cells || cells.length !== expectedColumns) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length) return false
  const header = parseTableCells(lines[index], { allowEmptyRow: true })
  if (!header || header.length < 2) return false
  return isTableSeparatorLine(lines[index + 1], header.length)
}

function isBlockStarter(line: string): boolean {
  return (
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    FENCE_START_RE.test(line) ||
    line.startsWith('>') ||
    ORDERED_LIST_RE.test(line) ||
    UNORDERED_LIST_RE.test(line)
  )
}

export function markdownToEditorData(markdown: string): EditorDocument {
  const normalized = normalizeInput(markdown)
  const lines = normalized.split('\n')
  const blocks: EditorBlock[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    const headingMatch = line.match(HEADING_RE)
    if (headingMatch) {
      blocks.push({
        type: 'header',
        data: {
          level: headingMatch[1].length,
          text: blockTextToHtml(headingMatch[2].trim())
        }
      })
      i += 1
      continue
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: 'delimiter', data: {} })
      i += 1
      continue
    }

    const fenceMatch = line.match(FENCE_START_RE)
    if (fenceMatch) {
      const language = (fenceMatch[1] ?? '').trim()
      i += 1
      const codeLines: string[] = []
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length && /^```\s*$/.test(lines[i])) i += 1

      if (language.toLowerCase() === 'mermaid') {
        blocks.push({
          type: 'mermaid',
          data: {
            code: codeLines.join('\n')
          }
        })
        continue
      }

      blocks.push({
        type: 'code',
        data: {
          code: codeLines.join('\n'),
          language
        }
      })
      continue
    }

    if (line.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }

      const calloutMarker = quoteLines[0]?.trim().match(CALLOUT_MARKER_RE)
      if (calloutMarker) {
        const typeToken = normalizeCalloutKind(calloutMarker[1])
        const lead = calloutMarker[2].trim()
        const messageLines = lead ? [lead, ...quoteLines.slice(1)] : quoteLines.slice(1)
        blocks.push({
          type: 'callout',
          data: {
            kind: typeToken,
            message: normalizeMultiline(messageLines.join('\n'))
          }
        })
        continue
      }

      blocks.push({
        type: 'quote',
        data: {
          text: quoteLines.join('\n'),
          caption: '',
          alignment: 'left'
        }
      })
      continue
    }

    if (isMarkdownTableStart(lines, i)) {
      const header = parseTableCells(lines[i], { allowEmptyRow: true }) ?? []
      const rows: string[][] = [header]
      i += 2

      while (i < lines.length) {
        const row = parseTableCells(lines[i], { allowEmptyRow: true })
        if (!row) break
        rows.push(row)
        i += 1
      }

      blocks.push({
        type: 'table',
        data: {
          withHeadings: true,
          content: rows
        }
      })
      continue
    }

    if (ORDERED_LIST_RE.test(line)) {
      const items: RichListItem[] = []
      while (i < lines.length) {
        const match = lines[i].match(ORDERED_LIST_RE)
        if (!match) break
        items.push({
          content: blockTextToHtml(match[1].trim()),
          items: []
        })
        i += 1
      }
      blocks.push({ type: 'list', data: { style: 'ordered', items } })
      continue
    }

    if (TASK_LIST_RE.test(line)) {
      const items: RichListItem[] = []
      while (i < lines.length) {
        const match = lines[i].match(TASK_LIST_RE)
        if (!match) break

        items.push({
          content: blockTextToHtml(match[2].trim()),
          meta: { checked: match[1].toLowerCase() === 'x' },
          items: []
        })
        i += 1
      }
      blocks.push({ type: 'list', data: { style: 'checklist', items } })
      continue
    }

    if (UNORDERED_LIST_RE.test(line) && !TASK_LIST_RE.test(line)) {
      const items: RichListItem[] = []
      while (i < lines.length) {
        const current = lines[i]
        if (TASK_LIST_RE.test(current)) break
        const match = current.match(UNORDERED_LIST_RE)
        if (!match) break
        items.push({
          content: blockTextToHtml(match[1].trim()),
          items: []
        })
        i += 1
      }
      blocks.push({ type: 'list', data: { style: 'unordered', items } })
      continue
    }

    if (isRawFallbackStart(line)) {
      const rawLines: string[] = []
      while (i < lines.length && lines[i].trim()) {
        rawLines.push(lines[i])
        i += 1
      }
      blocks.push({ type: 'raw', data: { markdown: rawLines.join('\n') } })
      continue
    }

    const paragraphLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isBlockStarter(lines[i]) &&
      !isRawFallbackStart(lines[i]) &&
      !isMarkdownTableStart(lines, i)
    ) {
      paragraphLines.push(lines[i])
      i += 1
    }

    blocks.push({ type: 'paragraph', data: { text: blockTextToHtml(paragraphLines.join('\n')) } })
  }

  return { time: Date.now(), blocks, version: '2.0.0' }
}

function normalizeParagraphMarkdown(value: unknown): string {
  return normalizeMultiline(inlineHtmlToMarkdown(value))
}

function oldListItemsToStrings(items: unknown[]): string[] {
  return items
    .map((item) => (typeof item === 'string' ? normalizeMultiline(item).trim() : ''))
    .filter(Boolean)
}

function flattenRichList(
  items: RichListItem[],
  depth: number,
  marker: 'ordered' | 'unordered' | 'checklist'
): string[] {
  const lines: string[] = []

  items.forEach((item, index) => {
    const content = normalizeParagraphMarkdown(item.content ?? '')
    const prefix =
      marker === 'ordered'
        ? `${index + 1}. `
        : marker === 'checklist'
          ? `- [${item.meta?.checked ? 'x' : ' '}] `
          : '- '
    lines.push(`${'  '.repeat(depth)}${prefix}${content}`)

    if (Array.isArray(item.items) && item.items.length) {
      lines.push(...flattenRichList(item.items, depth + 1, marker))
    }
  })

  return lines
}

function listToMarkdown(data: Record<string, unknown>): string {
  const style =
    data.style === 'ordered'
      ? 'ordered'
      : data.style === 'checklist'
        ? 'checklist'
        : 'unordered'
  const items = Array.isArray(data.items) ? data.items : []
  if (!items.length) return ''

  if (typeof items[0] === 'string') {
    const old = oldListItemsToStrings(items as unknown[])
    return old
      .map((item, index) => {
        if (style === 'ordered') return `${index + 1}. ${item}`
        if (style === 'checklist') return `- [ ] ${item}`
        return `- ${item}`
      })
      .join('\n')
  }

  return flattenRichList(items as RichListItem[], 0, style).join('\n')
}

function blockToMarkdown(block: EditorBlock): string {
  switch (block.type) {
    case 'header':
    case 'heading': {
      const level = Math.max(1, Math.min(6, Number(block.data?.level ?? 2)))
      const text = normalizeParagraphMarkdown(block.data?.text)
      return text ? `${'#'.repeat(level)} ${text}` : `${'#'.repeat(level)} `
    }

    case 'paragraph':
      return normalizeParagraphMarkdown(block.data?.text)

    case 'list':
      return listToMarkdown(block.data)

    case 'quote': {
      const text = normalizeMultiline(String(block.data?.text ?? ''))
      if (!text) return ''
      return text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    }

    case 'callout':
    case 'warning': {
      const rawKind = block.type === 'callout'
        ? String(block.data?.kind ?? '')
        : String(block.data?.title ?? '')
      const typeToken = normalizeCalloutKind(
        rawKind
          .toUpperCase()
          .replace(/[^A-Z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
      )
      const message = normalizeMultiline(String(block.data?.message ?? ''))
      if (!message) return `> [!${typeToken}]`
      const lines = message.split('\n').map((line) => `> ${line}`).join('\n')
      return `> [!${typeToken}]\n${lines}`
    }

    case 'table': {
      const rawRows = Array.isArray(block.data?.content) ? block.data.content : []
      const rows = rawRows
        .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []))
        .filter((row) => row.length > 0)
      if (!rows.length) return ''

      const withHeadings = Boolean(block.data?.withHeadings)
      const columnCount = Math.max(...rows.map((row) => row.length), 2)
      const pad = (row: string[]) => Array.from({ length: columnCount }, (_, idx) => row[idx] ?? '')
      const escapeCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\r\n?/g, '\n').replace(/\n/g, '<br>')
      const rowToLine = (row: string[]) => `| ${row.map((cell) => escapeCell(cell.trim())).join(' | ')} |`

      const normalizedRows = rows.map(pad)
      const header = withHeadings ? normalizedRows[0] : Array.from({ length: columnCount }, () => '')
      const bodyRows = withHeadings ? normalizedRows.slice(1) : normalizedRows
      const separator = `| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`
      return [rowToLine(header), separator, ...bodyRows.map(rowToLine)].join('\n')
    }

    case 'mermaid': {
      const code = String(block.data?.code ?? '').replace(/\r\n?/g, '\n').trim()
      return `\`\`\`mermaid\n${code}\n\`\`\``
    }

    case 'code': {
      const language = String(block.data?.language ?? '').trim()
      const code = String(block.data?.code ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '')
      return `\`\`\`${language}\n${code}\n\`\`\``
    }

    case 'delimiter':
      return '---'

    case 'raw':
      return normalizeMultiline(String(block.data?.markdown ?? ''))

    default: {
      const fallback = normalizeMultiline(JSON.stringify(block.data ?? {}, null, 2))
      return fallback ? `\`\`\`json\n${fallback}\n\`\`\`` : ''
    }
  }
}

export function editorDataToMarkdown(data: { blocks?: EditorBlock[] } | null | undefined): string {
  const blocks = data?.blocks ?? []
  const lines = blocks
    .map((block) => blockToMarkdown(block))
    .map((text) => normalizeMultiline(text))
    .filter((text) => text.length > 0)

  return `${lines.join('\n\n')}\n`
}
