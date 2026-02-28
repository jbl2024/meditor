import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mermaidInitialize, mermaidRender } = vi.hoisted(() => ({
  mermaidInitialize: vi.fn(),
  mermaidRender: vi.fn<(id: string, code: string) => Promise<{ svg: string }>>()
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: mermaidInitialize,
    render: mermaidRender
  }
}))

import MermaidNodeView from './MermaidNodeView.vue'

async function flush() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mountHarness(options?: {
  editable?: boolean
  initialCode?: string
  confirmReplace?: (payload: { templateLabel: string }) => Promise<boolean>
}) {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const code = ref(options?.initialCode ?? 'flowchart TD\n  A --> B')
  const editable = options?.editable ?? true
  const updateAttributes = vi.fn((attrs: Record<string, unknown>) => {
    if (typeof attrs.code === 'string') {
      code.value = attrs.code
    }
  })

  const HarnessComponent = defineComponent({
    setup() {
      return () => h(MermaidNodeView, {
        node: { attrs: { code: code.value } },
        updateAttributes,
        editor: { isEditable: editable },
        extension: { options: { confirmReplace: options?.confirmReplace } }
      })
    }
  })

  const app = createApp(HarnessComponent)
  app.provide('onDragStart', () => {})
  app.provide('decorationClasses', ref(''))
  app.mount(root)

  return { app, root, code, updateAttributes }
}

describe('MermaidNodeView', () => {
  beforeEach(() => {
    mermaidInitialize.mockReset()
    mermaidRender.mockReset()
    mermaidRender.mockImplementation(async (id, source) => ({
      svg: `<svg data-render-id="${id}"><text>${source}</text></svg>`
    }))
    ;(window as typeof window & { __meditorMermaidRuntime?: unknown }).__meditorMermaidRuntime = undefined
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders preview from mermaid source and initializes once', async () => {
    const harness = mountHarness({ initialCode: 'flowchart TD\n  A --> B' })
    await flush()

    expect(mermaidInitialize).toHaveBeenCalledTimes(1)
    expect(mermaidRender).toHaveBeenCalledTimes(1)
    expect(harness.root.querySelector('.meditor-mermaid-preview svg')).toBeTruthy()

    harness.app.unmount()
  })

  it('opens code editor on preview mouse down and keeps preview visible', async () => {
    const harness = mountHarness()
    await flush()

    const preview = harness.root.querySelector('.meditor-mermaid-preview') as HTMLDivElement
    preview.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await flush()

    const wrapper = harness.root.querySelector('.meditor-mermaid') as HTMLElement
    expect(wrapper.classList.contains('is-editing')).toBe(true)
    expect(harness.root.querySelector('.meditor-mermaid-code')).toBeTruthy()
    expect(harness.root.querySelector('.meditor-mermaid-preview')).toBeTruthy()

    harness.app.unmount()
  })

  it('updates raw syntax through editor textarea input', async () => {
    const harness = mountHarness()
    await flush()

    const preview = harness.root.querySelector('.meditor-mermaid-preview') as HTMLDivElement
    preview.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await flush()

    const textarea = harness.root.querySelector('.meditor-mermaid-code') as HTMLTextAreaElement
    textarea.value = 'sequenceDiagram\n  A->>B: Ping'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()

    expect(harness.updateAttributes).toHaveBeenCalledWith({ code: 'sequenceDiagram\n  A->>B: Ping' })
    expect(harness.code.value).toContain('sequenceDiagram')

    harness.app.unmount()
  })

  it('applies selected template from filterable dropdown', async () => {
    const harness = mountHarness()
    await flush()

    const trigger = harness.root.querySelector('.meditor-mermaid-template-btn') as HTMLButtonElement
    trigger.click()
    await flush()

    const options = Array.from(harness.root.querySelectorAll('.ui-filterable-dropdown-option')) as HTMLButtonElement[]
    const classOption = options.find((option) => option.textContent?.includes('Class'))
    expect(classOption).toBeTruthy()
    classOption?.click()
    await flush()

    expect(harness.updateAttributes).toHaveBeenCalled()
    expect(harness.code.value).toContain('classDiagram')

    harness.app.unmount()
  })

  it('does not replace template when confirm dialog rejects', async () => {
    const confirmReplace = vi.fn(async () => false)
    const harness = mountHarness({
      initialCode: 'flowchart TD\n  X --> Y',
      confirmReplace
    })
    await flush()

    const trigger = harness.root.querySelector('.meditor-mermaid-template-btn') as HTMLButtonElement
    trigger.click()
    await flush()

    const options = Array.from(harness.root.querySelectorAll('.ui-filterable-dropdown-option')) as HTMLButtonElement[]
    const sequenceOption = options.find((option) => option.textContent?.includes('Sequence'))
    sequenceOption?.click()
    await flush()

    expect(confirmReplace).toHaveBeenCalledTimes(1)
    expect(harness.code.value).toContain('flowchart TD')

    harness.app.unmount()
  })

  it('keeps latest render result when async renders resolve out of order', async () => {
    const pending: Array<(value: { svg: string }) => void> = []
    mermaidRender.mockImplementation(() => new Promise((resolve) => {
      pending.push(resolve)
    }))

    const harness = mountHarness({ initialCode: 'flowchart TD\n  A --> B' })
    await flush()

    harness.code.value = 'sequenceDiagram\n  A->>B: Ping'
    await flush()

    pending.shift()?.({ svg: '<svg data-version="old"></svg>' })
    await flush()
    pending.shift()?.({ svg: '<svg data-version="new"></svg>' })
    await flush()

    const preview = harness.root.querySelector('.meditor-mermaid-preview') as HTMLDivElement
    expect(preview.innerHTML).toContain('data-version="new"')
    expect(preview.innerHTML).not.toContain('data-version="old"')

    harness.app.unmount()
  })
})
