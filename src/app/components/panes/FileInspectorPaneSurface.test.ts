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
    hoisted.readPdfDataUrl.mockClear()
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
    const mounted = mountInspector('/vault/assets/report.docx')
    await flushUi()

    const iframe = mounted.root.querySelector<HTMLIFrameElement>('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('srcdoc')).toContain('<main>/vault/assets/report.docx</main>')
    expect(hoisted.renderPandocPreviewHtml).toHaveBeenCalledWith('/vault/assets/report.docx')

    mounted.app.unmount()
  })
})
