import { inlineTextToHtml } from '../markdownBlocks'

type QuoteData = {
  text?: string
}

type QuoteToolConstructorArgs = {
  data?: QuoteData
  readOnly?: boolean
}

function normalizeQuoteText(value: string | undefined): string {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
}

function parseDepth(line: string): { depth: number; content: string } {
  const markerMatch = line.match(/^\s*((?:>\s*)+)(.*)$/)
  if (!markerMatch) return { depth: 0, content: line }
  const markerText = markerMatch[1] ?? ''
  const depth = (markerText.match(/>/g) ?? []).length
  return { depth, content: markerMatch[2] ?? '' }
}

type DepthState = {
  paragraph: HTMLParagraphElement | null
  list: HTMLUListElement | null
}

function getDepthState(states: DepthState[], depth: number): DepthState {
  while (states.length <= depth) {
    states.push({ paragraph: null, list: null })
  }
  return states[depth]
}

function clearStatesAfterDepth(states: DepthState[], depth: number) {
  for (let i = depth + 1; i < states.length; i += 1) {
    states[i].paragraph = null
    states[i].list = null
  }
}

function containerForDepth(stack: HTMLElement[], depth: number): HTMLElement {
  while (stack.length - 1 > depth) {
    stack.pop()
  }
  while (stack.length - 1 < depth) {
    const parent = stack[stack.length - 1]
    const nested = document.createElement('blockquote')
    nested.className = 'meditor-quote-nested'
    parent.appendChild(nested)
    stack.push(nested)
  }
  return stack[depth]
}

function renderQuotePreview(root: HTMLElement, text: string) {
  root.innerHTML = ''
  const content = document.createElement('div')
  content.className = 'meditor-quote-preview-content'
  root.appendChild(content)

  const lines = normalizeQuoteText(text).split('\n')
  const stack: HTMLElement[] = [content]
  const states: DepthState[] = [{ paragraph: null, list: null }]

  for (const rawLine of lines) {
    const { depth, content: rawContent } = parseDepth(rawLine)
    const line = rawContent.trimEnd()
    const target = containerForDepth(stack, depth)
    const state = getDepthState(states, depth)
    clearStatesAfterDepth(states, depth)

    if (!line.trim()) {
      state.paragraph = null
      state.list = null
      continue
    }

    const listMatch = line.match(/^\s*[-*+]\s+(.+)$/)
    if (listMatch) {
      if (!state.list) {
        state.list = document.createElement('ul')
        state.list.className = 'meditor-quote-list'
        target.appendChild(state.list)
      }
      const item = document.createElement('li')
      item.innerHTML = inlineTextToHtml(listMatch[1].trim())
      state.list.appendChild(item)
      state.paragraph = null
      continue
    }

    state.list = null
    const paragraph = document.createElement('p')
    paragraph.className = 'meditor-quote-paragraph'
    paragraph.innerHTML = inlineTextToHtml(line.trim())
    target.appendChild(paragraph)
    state.paragraph = paragraph
  }
}

export default class QuoteTool {
  private text: string
  private readonly readOnly: boolean
  private rootEl: HTMLDivElement | null
  private previewEl: HTMLDivElement | null
  private textareaEl: HTMLTextAreaElement | null

  static get toolbox() {
    return {
      title: 'Quote',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M8.25 9.75H6A2.25 2.25 0 0 0 3.75 12v2.25A2.25 2.25 0 0 0 6 16.5h2.25A2.25 2.25 0 0 0 10.5 14.25V12A2.25 2.25 0 0 0 8.25 9.75Zm9 0H15A2.25 2.25 0 0 0 12.75 12v2.25A2.25 2.25 0 0 0 15 16.5h2.25a2.25 2.25 0 0 0 2.25-2.25V12a2.25 2.25 0 0 0-2.25-2.25Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'
    }
  }

  static get isReadOnlySupported() {
    return true
  }

  constructor({ data, readOnly }: QuoteToolConstructorArgs) {
    this.text = normalizeQuoteText(data?.text)
    this.readOnly = Boolean(readOnly)
    this.rootEl = null
    this.previewEl = null
    this.textareaEl = null
  }

  private refreshPreview() {
    if (!this.previewEl) return
    renderQuotePreview(this.previewEl, this.text)
  }

  private autosizeTextarea() {
    if (!this.textareaEl) return
    this.textareaEl.style.height = '0px'
    this.textareaEl.style.height = `${Math.max(94, this.textareaEl.scrollHeight)}px`
  }

  private setEditing(editing: boolean) {
    if (!this.rootEl || !this.textareaEl) return
    this.rootEl.classList.toggle('is-editing', editing)
    if (!editing) {
      this.text = normalizeQuoteText(this.textareaEl.value)
      this.refreshPreview()
      return
    }
    this.textareaEl.value = this.text
    this.autosizeTextarea()
    window.setTimeout(() => this.textareaEl?.focus(), 0)
  }

  render() {
    const root = document.createElement('div')
    root.className = 'meditor-quote'

    const preview = document.createElement('div')
    preview.className = 'meditor-quote-preview'
    preview.addEventListener('click', () => {
      if (!this.readOnly) this.setEditing(true)
    })

    const textarea = document.createElement('textarea')
    textarea.className = 'meditor-quote-source'
    textarea.value = this.text
    textarea.readOnly = this.readOnly
    textarea.spellcheck = false
    textarea.placeholder = 'Quote text'
    textarea.rows = 1
    textarea.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Escape') {
        event.preventDefault()
        this.setEditing(false)
        return
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        this.setEditing(false)
        return
      }
      if (event.key !== 'Tab') return
      event.preventDefault()
      const start = textarea.selectionStart ?? 0
      const end = textarea.selectionEnd ?? start
      textarea.value = `${textarea.value.slice(0, start)}\t${textarea.value.slice(end)}`
      textarea.selectionStart = textarea.selectionEnd = start + 1
      this.text = normalizeQuoteText(textarea.value)
      this.autosizeTextarea()
      this.refreshPreview()
    })
    textarea.addEventListener('input', () => {
      this.text = normalizeQuoteText(textarea.value)
      this.autosizeTextarea()
      this.refreshPreview()
    })
    textarea.addEventListener('blur', () => {
      this.setEditing(false)
    })

    root.append(preview, textarea)
    this.rootEl = root
    this.previewEl = preview
    this.textareaEl = textarea
    this.refreshPreview()
    this.autosizeTextarea()
    if (!this.readOnly) {
      this.setEditing(false)
    }
    return root
  }

  save() {
    const text = normalizeQuoteText(this.textareaEl?.value ?? this.text).replace(/\n+$/g, '')
    return { text }
  }
}
