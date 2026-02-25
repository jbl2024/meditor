import RawTable from '@editorjs/table'

type TableData = {
  withHeadings?: boolean
  content?: string[][]
}

type TableConstructorArgs = {
  data?: TableData
  [key: string]: unknown
}

/**
 * TableTool
 *
 * Wraps the upstream EditorJS Table tool to enforce heading mode by default.
 * This keeps visual behavior consistent immediately after insertion and after reload.
 */
export default class TableTool {
  private readonly instance: {
    render: () => Element
    save?: (blockContent: Element) => TableData | Promise<TableData>
    validate?: (savedData: unknown) => boolean
    destroy?: () => void
    renderSettings?: () => Element
    onPaste?: (event: unknown) => void
  }

  static get toolbox() {
    return (RawTable as unknown as { toolbox?: unknown }).toolbox
  }

  static get isReadOnlySupported() {
    return (RawTable as unknown as { isReadOnlySupported?: boolean }).isReadOnlySupported ?? true
  }

  static get sanitize() {
    return (RawTable as unknown as { sanitize?: unknown }).sanitize
  }

  static get pasteConfig() {
    return (RawTable as unknown as { pasteConfig?: unknown }).pasteConfig
  }

  static get enableLineBreaks() {
    return (RawTable as unknown as { enableLineBreaks?: boolean }).enableLineBreaks
  }

  constructor(args: TableConstructorArgs) {
    const normalizedArgs: TableConstructorArgs = {
      ...args,
      data: {
        ...(args.data ?? {}),
        withHeadings: true
      }
    }
    this.instance = new (RawTable as unknown as new (params: TableConstructorArgs) => TableTool['instance'])(normalizedArgs)
  }

  render() {
    return this.instance.render()
  }

  save(blockContent: Element) {
    const result = this.instance.save?.(blockContent) ?? { withHeadings: true, content: [] }
    if (result instanceof Promise) {
      return result.then((saved) => ({ ...saved, withHeadings: true }))
    }
    return { ...result, withHeadings: true }
  }

  validate(savedData: unknown) {
    if (!this.instance.validate) return true
    return this.instance.validate(savedData)
  }

  destroy() {
    this.instance.destroy?.()
  }

  renderSettings() {
    return this.instance.renderSettings?.()
  }

  onPaste(event: unknown) {
    this.instance.onPaste?.(event)
  }
}
