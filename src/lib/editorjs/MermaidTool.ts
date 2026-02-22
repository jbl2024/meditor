import mermaid from 'mermaid'

type MermaidData = {
  code?: string
}

type MermaidToolConstructorArgs = {
  data?: MermaidData
  readOnly?: boolean
  config?: {
    confirmReplace?: (payload: { templateLabel: string }) => Promise<boolean>
  }
}

type MermaidTemplate = {
  id: string
  label: string
  code: string
}

const DEFAULT_MERMAID = `flowchart TD
  A[Start] --> B{Ready?}
  B -->|Yes| C[Ship]
  B -->|No| D[Iterate]
  D --> B`

const MERMAID_TEMPLATES: MermaidTemplate[] = [
  {
    id: 'flowchart',
    label: 'Flowchart',
    code: `flowchart TD
  A[Start] --> B{Ready?}
  B -->|Yes| C[Ship]
  B -->|No| D[Iterate]
  D --> B`
  },
  {
    id: 'sequence',
    label: 'Sequence',
    code: `sequenceDiagram
  participant U as User
  participant A as App
  U->>A: Request
  A-->>U: Response`
  },
  {
    id: 'class',
    label: 'Class',
    code: `classDiagram
  class Note {
    +title: string
    +save()
  }
  class Workspace {
    +path: string
    +openNote()
  }
  Workspace --> Note`
  },
  {
    id: 'state',
    label: 'State',
    code: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review
  Review --> Published
  Published --> [*]`
  },
  {
    id: 'er',
    label: 'ER',
    code: `erDiagram
  NOTE ||--o{ TAG : has
  NOTE {
    string id
    string title
  }
  TAG {
    string name
  }`
  },
  {
    id: 'gantt',
    label: 'Gantt',
    code: `gantt
  title Release Plan
  dateFormat  YYYY-MM-DD
  section Build
  Implement editor   :a1, 2026-02-22, 3d
  QA                 :a2, after a1, 2d`
  },
  {
    id: 'journey',
    label: 'Journey',
    code: `journey
  title User flow
  section Editor
    Open note: 5: User
    Edit content: 4: User
    Save note: 5: User`
  },
  {
    id: 'pie',
    label: 'Pie',
    code: `pie showData
  title Notes by Type
  "Daily" : 42
  "Project" : 24
  "Reference" : 18`
  },
  {
    id: 'git',
    label: 'Git graph',
    code: `gitGraph
  commit id: "init"
  branch feature
  checkout feature
  commit id: "add-mermaid"
  checkout main
  merge feature`
  }
]

let mermaidInitialized = false
let mermaidIdCounter = 0

function ensureMermaidInitialized() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true
  })
  mermaidInitialized = true
}

function normalizeCode(value: string | undefined): string {
  return String(value ?? '').replace(/\r\n?/g, '\n')
}

export default class MermaidTool {
  private code: string
  private readonly readOnly: boolean
  private readonly confirmReplace: (payload: { templateLabel: string }) => Promise<boolean>
  private containerEl: HTMLDivElement | null
  private textareaEl: HTMLTextAreaElement | null
  private previewEl: HTMLDivElement | null
  private errorEl: HTMLDivElement | null

  static get toolbox() {
    return {
      title: 'Mermaid',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    }
  }

  static get isReadOnlySupported() {
    return true
  }

  constructor({ data, readOnly, config }: MermaidToolConstructorArgs) {
    this.code = normalizeCode(data?.code).trim() || DEFAULT_MERMAID
    this.readOnly = Boolean(readOnly)
    this.confirmReplace =
      config?.confirmReplace ??
      (async () => true)
    this.containerEl = null
    this.textareaEl = null
    this.previewEl = null
    this.errorEl = null
  }

  private setError(message: string) {
    if (!this.errorEl) return
    this.errorEl.textContent = message
    this.errorEl.style.display = message ? 'block' : 'none'
  }

  private async renderPreview(code: string) {
    if (!this.previewEl) return
    const trimmed = code.trim()
    if (!trimmed) {
      this.previewEl.innerHTML = ''
      this.setError('Diagram is empty.')
      return
    }

    ensureMermaidInitialized()
    try {
      const id = `meditor-mermaid-${++mermaidIdCounter}`
      const rendered = await mermaid.render(id, trimmed)
      this.previewEl.innerHTML = rendered.svg
      this.setError('')
    } catch (err) {
      this.previewEl.innerHTML = ''
      this.setError(err instanceof Error ? err.message : 'Invalid Mermaid diagram.')
    }
  }

  private setEditing(editing: boolean) {
    if (!this.containerEl) return
    this.containerEl.classList.toggle('is-editing', editing)
  }

  private applyTemplate(template: MermaidTemplate) {
    if (!this.textareaEl) return
    this.textareaEl.value = template.code
    this.code = template.code
    this.setEditing(true)
    void this.renderPreview(this.code)
    window.setTimeout(() => {
      this.textareaEl?.focus()
    }, 0)
  }

  private async maybeReplaceFromTemplate(value: string) {
    if (!this.textareaEl || !value) return
    const template = MERMAID_TEMPLATES.find((item) => item.id === value)
    if (!template) return

    const current = this.textareaEl.value.trim()
    const next = template.code.trim()
    const hasExistingContent = current.length > 0
    const isSameAsTarget = current === next
    if (hasExistingContent && !isSameAsTarget) {
      const approved = await this.confirmReplace({ templateLabel: template.label })
      if (!approved) return
    }

    this.applyTemplate(template)
  }

  render() {
    const container = document.createElement('div')
    container.className = 'meditor-mermaid'

    const header = document.createElement('div')
    header.className = 'meditor-mermaid-header'
    const title = document.createElement('span')
    title.className = 'meditor-mermaid-title'
    title.textContent = 'Mermaid'
    header.appendChild(title)

    if (!this.readOnly) {
      const templateSelect = document.createElement('select')
      templateSelect.className = 'meditor-mermaid-template'

      const placeholder = document.createElement('option')
      placeholder.value = ''
      placeholder.textContent = 'Template'
      templateSelect.appendChild(placeholder)

      for (const template of MERMAID_TEMPLATES) {
        const option = document.createElement('option')
        option.value = template.id
        option.textContent = template.label
        templateSelect.appendChild(option)
      }

      templateSelect.addEventListener('change', () => {
        void this.maybeReplaceFromTemplate(templateSelect.value)
        templateSelect.value = ''
      })
      header.appendChild(templateSelect)
    }

    const body = document.createElement('div')
    body.className = 'meditor-mermaid-body'

    const textarea = document.createElement('textarea')
    textarea.className = 'meditor-mermaid-code'
    textarea.value = this.code
    textarea.spellcheck = false
    textarea.readOnly = this.readOnly
    textarea.placeholder = 'flowchart TD\n  A --> B'
    textarea.addEventListener('keydown', (event) => {
      event.stopPropagation()

      if (event.key !== 'Tab') return
      event.preventDefault()

      const start = textarea.selectionStart ?? 0
      const end = textarea.selectionEnd ?? start
      const value = textarea.value
      textarea.value = `${value.slice(0, start)}\t${value.slice(end)}`
      textarea.selectionStart = textarea.selectionEnd = start + 1
      this.code = textarea.value
      void this.renderPreview(this.code)
    })
    textarea.addEventListener('input', () => {
      this.code = textarea.value
      void this.renderPreview(this.code)
    })
    body.appendChild(textarea)

    const preview = document.createElement('div')
    preview.className = 'meditor-mermaid-preview'
    if (!this.readOnly) {
      preview.tabIndex = 0
      preview.title = 'Click to edit Mermaid source'
      preview.addEventListener('click', () => {
        this.setEditing(true)
        window.setTimeout(() => this.textareaEl?.focus(), 0)
      })
      preview.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          this.setEditing(true)
          window.setTimeout(() => this.textareaEl?.focus(), 0)
        }
      })
    }
    body.appendChild(preview)

    const error = document.createElement('div')
    error.className = 'meditor-mermaid-error'
    error.style.display = 'none'
    body.appendChild(error)

    container.append(header, body)

    if (!this.readOnly) {
      container.addEventListener('focusin', () => {
        this.setEditing(true)
      })
      container.addEventListener('focusout', (event) => {
        const next = event.relatedTarget as Node | null
        if (next && container.contains(next)) return
        this.setEditing(false)
      })
    }

    this.containerEl = container
    this.textareaEl = textarea
    this.previewEl = preview
    this.errorEl = error
    this.setEditing(false)

    void this.renderPreview(this.code)

    return container
  }

  save() {
    return {
      code: normalizeCode(this.textareaEl?.value ?? this.code).trim()
    }
  }
}
