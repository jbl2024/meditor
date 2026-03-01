import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HtmlNodeView from './HtmlNodeView.vue'

async function flush() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mountHarness(options?: { editable?: boolean; initialHtml?: string }) {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const html = ref(options?.initialHtml ?? '<div>Hello</div>')
  const editable = options?.editable ?? true
  const updateAttributes = vi.fn((attrs: Record<string, unknown>) => {
    if (typeof attrs.html === 'string') {
      html.value = attrs.html
    }
  })

  const Harness = defineComponent({
    setup() {
      return () => h(HtmlNodeView, {
        node: { attrs: { html: html.value } },
        updateAttributes,
        editor: { isEditable: editable }
      })
    }
  })

  const app = createApp(Harness)
  app.provide('onDragStart', () => {})
  app.provide('decorationClasses', ref(''))
  app.mount(root)
  return { app, root, html, updateAttributes }
}

describe('HtmlNodeView', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders sanitized html preview', async () => {
    const harness = mountHarness({ initialHtml: '<div onclick="boom"><script>alert(1)</script>safe</div>' })
    await flush()
    const preview = harness.root.querySelector('.meditor-html-preview') as HTMLDivElement
    expect(preview.innerHTML).toContain('safe')
    expect(preview.innerHTML).not.toContain('onclick')
    expect(preview.innerHTML).not.toContain('script')
    harness.app.unmount()
  })

  it('toggles source mode and updates html through textarea input', async () => {
    const harness = mountHarness()
    await flush()

    const toggle = harness.root.querySelector('.meditor-html-toggle-btn') as HTMLButtonElement
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await flush()

    const textarea = harness.root.querySelector('.meditor-html-textarea') as HTMLTextAreaElement
    textarea.value = '<section>Updated</section>'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()

    expect(harness.updateAttributes).toHaveBeenCalledWith({ html: '<section>Updated</section>' })
    expect(harness.html.value).toBe('<section>Updated</section>')
    harness.app.unmount()
  })

  it('applies edit mode class while source editor is open', async () => {
    const harness = mountHarness()
    await flush()

    const wrapper = harness.root.querySelector('.meditor-html-node') as HTMLElement
    const toggle = harness.root.querySelector('.meditor-html-toggle-btn') as HTMLButtonElement
    expect(wrapper.classList.contains('is-editing')).toBe(false)

    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await flush()
    expect(wrapper.classList.contains('is-editing')).toBe(true)

    const editorToggle = harness.root.querySelector('.meditor-html-toggle-btn') as HTMLButtonElement
    editorToggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await flush()
    expect(wrapper.classList.contains('is-editing')).toBe(false)

    harness.app.unmount()
  })

  it('supports tab indentation and enter auto-indent', async () => {
    const harness = mountHarness({ initialHtml: '<div>\n  <span>x</span>\n</div>' })
    await flush()

    const toggle = harness.root.querySelector('.meditor-html-toggle-btn') as HTMLButtonElement
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await flush()

    const textarea = harness.root.querySelector('.meditor-html-textarea') as HTMLTextAreaElement
    textarea.setSelectionRange(0, 0)
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    await flush()
    expect(harness.html.value.startsWith('  <div>')).toBe(true)

    const latest = harness.root.querySelector('.meditor-html-textarea') as HTMLTextAreaElement
    const insertPos = latest.value.indexOf('<span')
    latest.setSelectionRange(insertPos, insertPos)
    latest.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flush()
    expect(harness.html.value).toContain('\n  \n  <span')
    harness.app.unmount()
  })
})
