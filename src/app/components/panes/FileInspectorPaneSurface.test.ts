import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  readPdfDataUrl: vi.fn(async (path: string) => `data:application/pdf;base64,${Buffer.from(path).toString('base64')}`),
  renderPandocPreviewHtml: vi.fn(async (path: string) => `<html><body><main>${path}</main></body></html>`)
}))

vi.mock('../../../shared/api/workspaceApi', () => ({
  readPdfDataUrl: hoisted.readPdfDataUrl,
  renderPandocPreviewHtml: hoisted.renderPandocPreviewHtml
}))

import FileInspectorPaneSurface from './FileInspectorPaneSurface.vue'

function mountInspector(path = '/vault/assets/report.bin') {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const openExternally = vi.fn(async () => {})

  const app = createApp(defineComponent({
    setup() {
      return () => h(FileInspectorPaneSurface, {
        path,
        openExternally
      })
    }
  }))

  app.mount(root)
  return { app, root, openExternally }
}

async function flushUi() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('FileInspectorPaneSurface', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.documentElement.classList.remove('dark')
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.colorScheme
    document.documentElement.style.removeProperty('--editor-body-text')
    document.documentElement.style.removeProperty('--editor-link')
    document.documentElement.style.removeProperty('--editor-code-bg')
    hoisted.readPdfDataUrl.mockClear()
    hoisted.renderPandocPreviewHtml.mockClear()
  })

  it('keeps file details out of the inspector surface and focuses on actions plus preview', async () => {
    const mounted = mountInspector()
    await flushUi()

    expect(mounted.root.textContent).toContain('Open natively')
    expect(mounted.root.textContent).toContain('Preview unavailable')
    expect(mounted.root.textContent).toContain('BIN')
    expect(mounted.root.textContent).not.toContain('report.bin')
    expect(mounted.root.textContent).not.toContain('Favorite')
    expect(mounted.root.textContent).not.toContain('Document')
    expect(mounted.root.textContent).not.toContain('Behavior')

    mounted.root.querySelector<HTMLButtonElement>('button')?.click()
    await nextTick()

    expect(mounted.openExternally).toHaveBeenCalledOnce()
    expect(mounted.root.querySelector('iframe')).toBeNull()

    mounted.app.unmount()
  })

  it('renders pdf files in the native browser viewer', async () => {
    const mounted = mountInspector('/vault/assets/report.pdf')
    await flushUi()

    const iframe = mounted.root.querySelector<HTMLIFrameElement>('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('src')).toBe(
      `data:application/pdf;base64,${Buffer.from('/vault/assets/report.pdf').toString('base64')}`
    )
    expect(hoisted.readPdfDataUrl).toHaveBeenCalledWith('/vault/assets/report.pdf')

    mounted.app.unmount()
  })

  it('renders pandoc-supported files as html previews', async () => {
    document.documentElement.classList.add('dark')
    document.documentElement.dataset.theme = 'tokyo-night'
    document.documentElement.dataset.colorScheme = 'dark'
    document.documentElement.style.setProperty('--editor-body-text', 'rgb(208, 215, 222)')
    document.documentElement.style.setProperty('--editor-link', 'rgb(125, 207, 255)')
    document.documentElement.style.setProperty('--editor-code-bg', 'rgb(34, 37, 56)')

    const mounted = mountInspector('/vault/assets/report.docx')
    await flushUi()

    const iframe = mounted.root.querySelector<HTMLIFrameElement>('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('srcdoc')).toContain('<main>/vault/assets/report.docx</main>')
    expect(iframe?.getAttribute('srcdoc')).toContain('color-scheme: dark')
    expect(iframe?.getAttribute('srcdoc')).toContain('--pandoc-scale: 0.88;')
    expect(iframe?.getAttribute('srcdoc')).toContain('color: var(--text-main, #1a1a18);')
    expect(iframe?.getAttribute('srcdoc')).toContain('--editor-link: rgb(125, 207, 255);')
    expect(iframe?.getAttribute('srcdoc')).toContain('--editor-code-bg: rgb(34, 37, 56);')
    expect(iframe?.getAttribute('srcdoc')).toContain('font-size: calc(var(--editor-font-size-base, 1rem) * var(--editor-zoom, 1) * var(--pandoc-scale, 1));')
    expect(iframe?.getAttribute('srcdoc')).toContain('width: 800px;')
    expect(iframe?.getAttribute('srcdoc')).toContain('box-sizing: border-box;')
    expect(iframe?.getAttribute('srcdoc')).toContain('padding: 0 0 2rem;')
    expect(iframe?.getAttribute('srcdoc')).toContain('padding-left: 5rem;')
    expect(iframe?.getAttribute('srcdoc')).toContain('padding-right: 2rem;')
    expect(iframe?.getAttribute('srcdoc')).toContain('list-style: disc;')
    expect(iframe?.getAttribute('srcdoc')).toContain('border-left: 0;')
    expect(iframe?.getAttribute('srcdoc')).toContain('event.metaKey || event.ctrlKey')
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')
    expect(hoisted.renderPandocPreviewHtml).toHaveBeenCalledWith('/vault/assets/report.docx')

    mounted.app.unmount()
  })
})
