/**
 * StrikethroughInlineTool
 *
 * EditorJS inline formatting tool for strikethrough text.
 */
type InlineToolApi = {
  selection?: {
    findParentTag?: (tag: string) => HTMLElement | null
  }
}

type InlineToolConstructorArgs = {
  api: InlineToolApi
}

/**
 * Inline tool that toggles strikethrough formatting in EditorJS text blocks.
 */
export default class StrikethroughInlineTool {
  private readonly api: InlineToolApi
  private button: HTMLButtonElement | null

  static get isInline() {
    return true
  }

  static get sanitize() {
    return {
      s: {},
      strike: {}
    }
  }

  constructor({ api }: InlineToolConstructorArgs) {
    this.api = api
    this.button = null
  }

  render() {
    const button = document.createElement('button')
    button.type = 'button'
    button.classList.add('ce-inline-tool')
    button.setAttribute('aria-label', 'Strikethrough')
    button.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M8 7.5C8 6.1 9.5 5 12 5c2.3 0 4 1 4 2.5S14.3 10 12 10m0 4c-2.4 0-4 1-4 2.5S9.7 19 12 19c2.5 0 4-1.1 4-2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
    this.button = button
    return button
  }

  surround() {
    document.execCommand('strikeThrough')
  }

  checkState() {
    const active = Boolean(this.api.selection?.findParentTag?.('S') || this.api.selection?.findParentTag?.('STRIKE'))
    this.button?.classList.toggle('ce-inline-tool--active', active)
  }
}
