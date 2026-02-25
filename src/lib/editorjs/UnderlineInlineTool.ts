/**
 * UnderlineInlineTool
 *
 * EditorJS inline formatting tool for underlined text.
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
 * Inline tool that toggles underline formatting in EditorJS text blocks.
 */
export default class UnderlineInlineTool {
  private readonly api: InlineToolApi
  private button: HTMLButtonElement | null

  static get isInline() {
    return true
  }

  static get sanitize() {
    return {
      u: {}
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
    button.setAttribute('aria-label', 'Underline')
    button.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 5v6a5 5 0 0 0 10 0V5M5 19h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    this.button = button
    return button
  }

  surround() {
    document.execCommand('underline')
  }

  checkState() {
    const active = Boolean(this.api.selection?.findParentTag?.('U'))
    this.button?.classList.toggle('ce-inline-tool--active', active)
  }
}
