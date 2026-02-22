import {
  CANONICAL_CALLOUT_KINDS,
  calloutKindLabel,
  normalizeCalloutKind,
  type CanonicalCalloutKind
} from '../callouts'

type CalloutData = {
  kind?: string
  message?: string
}

type CalloutToolConstructorArgs = {
  data?: CalloutData
  readOnly?: boolean
}

function normalizeMessage(value: string | undefined): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
}

function iconForKind(kind: CanonicalCalloutKind): string {
  switch (kind) {
    case 'ABSTRACT':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 7.5h15M4.5 12h15M4.5 16.5h10.5" /></svg>'
    case 'INFO':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25h1.5v5.25h-1.5v-5.25Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 8.25h.008v.008H12V8.25Z" /><circle cx="12" cy="12" r="8.25" /></svg>'
    case 'TIP':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3.75a6 6 0 0 0-3.75 10.688V16.5a1.5 1.5 0 0 0 1.5 1.5h4.5a1.5 1.5 0 0 0 1.5-1.5v-2.062A6 6 0 0 0 12 3.75Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 21h3" /></svg>'
    case 'SUCCESS':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 12.75 2.25 2.25L15 9.75" /><circle cx="12" cy="12" r="8.25" /></svg>'
    case 'QUESTION':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 17.25h.008v.008H12v-.008Zm-1.05-5.137a2.438 2.438 0 1 1 2.725-.35c-.52.45-.925.857-.925 1.737v.375" /><circle cx="12" cy="12" r="8.25" /></svg>'
    case 'WARNING':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4.5m0 3h.008M10.29 3.86 1.82 18a2.25 2.25 0 0 0 1.93 3.375h16.5A2.25 2.25 0 0 0 22.18 18L13.71 3.86a2.25 2.25 0 0 0-3.42 0Z" /></svg>'
    case 'FAILURE':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m15 9-6 6m0-6 6 6" /><circle cx="12" cy="12" r="8.25" /></svg>'
    case 'DANGER':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4.5m0 3h.008M10.29 3.86 1.82 18a2.25 2.25 0 0 0 1.93 3.375h16.5A2.25 2.25 0 0 0 22.18 18L13.71 3.86a2.25 2.25 0 0 0-3.42 0Z" /></svg>'
    case 'BUG':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 7.5V6a2.25 2.25 0 1 1 4.5 0v1.5m-7.5 3h10.5m-9.75 3h9m-8.25 3h6a2.25 2.25 0 0 0 2.25-2.25V9.75A2.25 2.25 0 0 0 14.25 7.5h-4.5A2.25 2.25 0 0 0 7.5 9.75v5.25A2.25 2.25 0 0 0 9.75 17.25Z" /></svg>'
    case 'EXAMPLE':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3.75 4.5 8.25v7.5L12 20.25l7.5-4.5v-7.5L12 3.75Z" /></svg>'
    case 'QUOTE':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9.75H6A2.25 2.25 0 0 0 3.75 12v2.25A2.25 2.25 0 0 0 6 16.5h2.25A2.25 2.25 0 0 0 10.5 14.25V12A2.25 2.25 0 0 0 8.25 9.75Zm9 0H15A2.25 2.25 0 0 0 12.75 12v2.25A2.25 2.25 0 0 0 15 16.5h2.25a2.25 2.25 0 0 0 2.25-2.25V12a2.25 2.25 0 0 0-2.25-2.25Z" /></svg>'
    case 'NOTE':
    default:
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 3.487 3.651 3.651m-2.12-5.182a2.25 2.25 0 0 1 3.182 3.182L8.213 18.5 3.75 19.5l1-4.463L18.393 1.955Z" /></svg>'
  }
}

export default class CalloutTool {
  private kind: CanonicalCalloutKind
  private message: string
  private readonly readOnly: boolean
  private root: HTMLDivElement | null
  private iconEl: HTMLSpanElement | null
  private labelEl: HTMLSpanElement | null
  private kindSelectEl: HTMLSelectElement | null
  private messageEl: HTMLDivElement | null

  static get toolbox() {
    return {
      title: 'Callout',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3L2 21h20L12 3Z" stroke="currentColor" stroke-width="1.7"/><path d="M12 9v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>'
    }
  }

  static get isReadOnlySupported() {
    return true
  }

  constructor({ data, readOnly }: CalloutToolConstructorArgs) {
    this.kind = normalizeCalloutKind(data?.kind)
    this.message = normalizeMessage(data?.message)
    this.readOnly = Boolean(readOnly)
    this.root = null
    this.iconEl = null
    this.labelEl = null
    this.kindSelectEl = null
    this.messageEl = null
  }

  private applyKindVisuals() {
    if (!this.root || !this.iconEl || !this.labelEl) return
    this.root.dataset.calloutKind = this.kind.toLowerCase()
    this.iconEl.innerHTML = iconForKind(this.kind)
    this.labelEl.textContent = calloutKindLabel(this.kind)
    if (this.kindSelectEl) {
      this.kindSelectEl.value = this.kind
    }
  }

  render() {
    const root = document.createElement('div')
    root.className = 'meditor-callout'
    root.dataset.calloutKind = this.kind.toLowerCase()

    const header = document.createElement('div')
    header.className = 'meditor-callout-header'

    const titleWrap = document.createElement('div')
    titleWrap.className = 'meditor-callout-title'

    const icon = document.createElement('span')
    icon.className = 'meditor-callout-icon'
    icon.innerHTML = iconForKind(this.kind)

    const label = document.createElement('span')
    label.className = 'meditor-callout-label'
    label.textContent = calloutKindLabel(this.kind)

    titleWrap.append(icon, label)
    header.appendChild(titleWrap)

    if (!this.readOnly) {
      const select = document.createElement('select')
      select.className = 'meditor-callout-kind'
      for (const kind of CANONICAL_CALLOUT_KINDS) {
        const option = document.createElement('option')
        option.value = kind
        option.textContent = kind
        select.appendChild(option)
      }
      select.value = this.kind
      select.addEventListener('change', () => {
        this.kind = normalizeCalloutKind(select.value)
        this.applyKindVisuals()
      })
      header.appendChild(select)
      this.kindSelectEl = select
    }

    const message = document.createElement('div')
    message.className = 'meditor-callout-message'
    message.contentEditable = this.readOnly ? 'false' : 'true'
    message.dataset.placeholder = 'Callout text'
    message.textContent = this.message

    root.append(header, message)

    this.root = root
    this.iconEl = icon
    this.labelEl = label
    this.messageEl = message
    this.applyKindVisuals()

    return root
  }

  save() {
    const nextMessage = normalizeMessage(this.messageEl?.innerText ?? this.message).replace(/\n+$/g, '')
    return {
      kind: normalizeCalloutKind(this.kind),
      message: nextMessage
    }
  }
}
