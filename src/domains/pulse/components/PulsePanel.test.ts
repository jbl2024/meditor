import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PulsePanel from './PulsePanel.vue'
import { PULSE_ACTIONS_BY_SOURCE } from '../lib/pulse'

async function flush() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mountHarness(options?: {
  actionId?: string
  instruction?: string
  previewMarkdown?: string
  running?: boolean
  error?: string
  sourceText?: string
  drawer?: boolean
}) {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const actionId = ref(options?.actionId ?? 'rewrite')
  const instruction = ref(options?.instruction ?? 'Clarify the selected passage without changing its meaning.')
  const previewMarkdown = ref(options?.previewMarkdown ?? '')
  const running = ref(options?.running ?? false)
  const error = ref(options?.error ?? '')

  const onRun = vi.fn()
  const onCancel = vi.fn()
  const onClose = vi.fn()
  const onApply = vi.fn()

  const app = createApp(defineComponent({
    setup() {
      return () => h(PulsePanel, {
        compact: true,
        drawer: options?.drawer ?? false,
        actionId: actionId.value,
        actions: PULSE_ACTIONS_BY_SOURCE.editor_selection,
        instruction: instruction.value,
        previewMarkdown: previewMarkdown.value,
        provenancePaths: [],
        running: running.value,
        error: error.value,
        applyModes: ['replace_selection', 'insert_below', 'send_to_second_brain'],
        primaryApplyMode: 'replace_selection',
        sourceText: options?.sourceText ?? 'Original selected text',
        'onUpdate:actionId': (value: string) => { actionId.value = value },
        'onUpdate:instruction': (value: string) => { instruction.value = value },
        onRun,
        onCancel,
        onClose,
        onApply
      })
    }
  }))

  app.mount(root)
  return {
    app,
    root,
    actionId,
    instruction,
    previewMarkdown,
    running,
    error,
    onRun,
    onCancel,
    onClose,
    onApply
  }
}

describe('PulsePanel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps the prompt editable and does not expose apply actions before results', async () => {
    const harness = mountHarness()
    await flush()

    const prompt = harness.root.querySelector('[data-pulse-prompt="true"]') as HTMLTextAreaElement
    expect(prompt.value).toContain('Clarify the selected passage')
    expect(harness.root.textContent).toContain('Nothing changes until you apply')
    expect(harness.root.textContent).not.toContain('Replace selection')

    prompt.value = 'Make it shorter.'
    prompt.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()

    expect(harness.instruction.value).toBe('Make it shorter.')

    harness.app.unmount()
  })

  it('runs on Cmd/Ctrl+Enter and does not run on plain Enter or action change', async () => {
    const harness = mountHarness()
    await flush()

    harness.actionId.value = 'condense'
    await flush()
    expect(harness.onRun).not.toHaveBeenCalled()

    const prompt = harness.root.querySelector('[data-pulse-prompt="true"]') as HTMLTextAreaElement
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()

    expect(harness.onRun).not.toHaveBeenCalled()

    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    await flush()

    expect(harness.onRun).toHaveBeenCalledTimes(1)

    harness.app.unmount()
  })

  it('shows cancel and disables editing while running', async () => {
    const harness = mountHarness({ running: true })
    await flush()

    const prompt = harness.root.querySelector('[data-pulse-prompt="true"]') as HTMLTextAreaElement
    expect(prompt.disabled).toBe(true)
    expect(harness.root.textContent).toContain('Generating…')

    const cancel = Array.from(harness.root.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Cancel') as HTMLButtonElement
    cancel.click()
    await flush()

    expect(harness.onCancel).toHaveBeenCalledTimes(1)

    harness.app.unmount()
  })

  it('renders diff by default for text actions and supports apply shortcuts', async () => {
    const harness = mountHarness({
      previewMarkdown: 'Original selected text with more clarity.',
      sourceText: 'Original selected text.'
    })
    await flush()

    const diff = harness.root.querySelector('[data-pulse-preview-mode="diff"]') as HTMLElement
    expect(diff).toBeTruthy()
    expect(diff.textContent).toContain('Original selected text')
    expect(harness.root.textContent).toContain('Replace selection')

    const previewTab = Array.from(harness.root.querySelectorAll('.pulse-tab-btn'))
      .find((button) => button.textContent?.trim() === 'Preview') as HTMLButtonElement
    previewTab.click()
    await flush()

    const rendered = harness.root.querySelector('[data-pulse-preview-mode="preview"]') as HTMLElement
    expect(rendered).toBeTruthy()
    expect(rendered.textContent).toContain('Original selected text with more clarity.')

    const prompt = harness.root.querySelector('[data-pulse-prompt="true"]') as HTMLTextAreaElement
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    await flush()

    expect(harness.onApply).toHaveBeenCalledWith('replace_selection')

    harness.app.unmount()
  })

  it('opens a large drawer preview modal with apply actions', async () => {
    const harness = mountHarness({
      drawer: true,
      previewMarkdown: 'Original selected text with more clarity.',
      sourceText: 'Original selected text.'
    })
    await flush()

    const expand = Array.from(harness.root.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Large')) as HTMLButtonElement
    expect(expand).toBeTruthy()
    expand.click()
    await flush()

    const modal = harness.root.querySelector('.pulse-preview-modal') as HTMLElement
    expect(modal).toBeTruthy()
    expect(modal.textContent).toContain('Pulse Preview')
    expect(modal.textContent).toContain('Replace selection')

    const replace = Array.from(modal.querySelectorAll('.pulse-apply--modal .pulse-btn'))
      .find((button) => button.textContent?.includes('Replace selection')) as HTMLButtonElement
    replace.click()
    await flush()

    expect(harness.onApply).toHaveBeenCalledWith('replace_selection')

    harness.app.unmount()
  })

  it('copies the generated preview markdown to the clipboard', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })

    const harness = mountHarness({
      previewMarkdown: '# Title\n\n- Item',
      sourceText: ''
    })
    await flush()

    const copyButton = Array.from(harness.root.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Copy') as HTMLButtonElement
    expect(copyButton).toBeTruthy()
    copyButton.click()
    await flush()

    expect(writeText).toHaveBeenCalledWith('# Title\n\n- Item')
    expect(copyButton.textContent?.trim()).toBe('Copied')

    harness.app.unmount()
  })

  it('falls back to rendered preview when no diff source is available', async () => {
    const harness = mountHarness({
      previewMarkdown: '# Title\n\n- Item',
      sourceText: ''
    })
    await flush()

    const preview = harness.root.querySelector('[data-pulse-preview-mode="preview"]') as HTMLElement
    expect(preview).toBeTruthy()
    expect(preview.innerHTML).toContain('<h1>Title</h1>')
    expect(harness.root.textContent).not.toContain('Diff')

    harness.app.unmount()
  })

  it('shows error state and keeps custom prompt intact', async () => {
    const harness = mountHarness({
      instruction: 'Make it funny.',
      error: 'Pulse generation failed.'
    })
    await flush()

    expect(harness.root.textContent).toContain('Pulse generation failed.')
    const prompt = harness.root.querySelector('[data-pulse-prompt="true"]') as HTMLTextAreaElement
    expect(prompt.value).toBe('Make it funny.')
    expect(harness.root.textContent).not.toContain('Replace selection')

    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()

    expect(harness.onClose).toHaveBeenCalledTimes(1)

    harness.app.unmount()
  })

  it('shows markdown fallback for empty rendered preview and supports long output scrolling', async () => {
    const longMarkdown = Array.from({ length: 40 }, (_, index) => `Line ${index + 1}`).join('\n')
    const harness = mountHarness({
      actionId: 'outline',
      previewMarkdown: longMarkdown,
      sourceText: ''
    })
    await flush()

    const markdown = harness.root.querySelector('[data-pulse-preview-mode="preview"], [data-pulse-preview-mode="markdown"]') as HTMLElement
    expect(markdown).toBeTruthy()
    const previewBody = harness.root.querySelector('.pulse-preview-body') as HTMLElement
    expect(previewBody.className).toContain('pulse-preview-body')

    harness.app.unmount()
  })
})
