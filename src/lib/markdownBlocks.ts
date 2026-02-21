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

function inlineMarkdownToHtml(value: string): string {
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g
  let html = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = linkRe.exec(value)) !== null) {
    const full = match[0]
    const text = match[1]
    const href = match[2]
    const index = match.index
    const isEscaped = index > 0 && value[index - 1] === '\\'

    if (isEscaped) {
      continue
    }

    html += escapeHtml(value.slice(lastIndex, index))
    html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
    lastIndex = index + full.length
  }

  html += escapeHtml(value.slice(lastIndex))
  return html
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
    const href = element.getAttribute('href')?.trim()
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

    if (ORDERED_LIST_RE.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const match = lines[i].match(ORDERED_LIST_RE)
        if (!match) break
        items.push(match[1].trim())
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
          content: match[2].trim(),
          meta: { checked: match[1].toLowerCase() === 'x' },
          items: []
        })
        i += 1
      }
      blocks.push({ type: 'list', data: { style: 'checklist', items } })
      continue
    }

    if (UNORDERED_LIST_RE.test(line) && !TASK_LIST_RE.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i]
        if (TASK_LIST_RE.test(current)) break
        const match = current.match(UNORDERED_LIST_RE)
        if (!match) break
        items.push(match[1].trim())
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
    while (i < lines.length && lines[i].trim() && !isBlockStarter(lines[i]) && !isRawFallbackStart(lines[i])) {
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
