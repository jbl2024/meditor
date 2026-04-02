import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  readPdfDataUrl: vi.fn(async (path: string) => `data:application/pdf;base64,${btoa(path)}`),
  renderPandocPreviewHtml: vi.fn(async (path: string) => `<html><body><main>${path}</main></body></html>`),
  renderSpreadsheetPreviewHtml: vi.fn(async (path: string) => `<html><body><section>${path}</section></body></html>`)
}))

vi.mock('../../../shared/api/workspaceApi', () => ({
  readPdfDataUrl: hoisted.readPdfDataUrl,
  renderPandocPreviewHtml: hoisted.renderPandocPreviewHtml,
  renderSpreadsheetPreviewHtml: hoisted.renderSpreadsheetPreviewHtml
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

function decodePreviewSrc(iframe: HTMLIFrameElement | null): string {
  const src = iframe?.getAttribute('src') ?? ''
  const commaIndex = src.indexOf(',')
  if (commaIndex < 0) return src
  return decodeURIComponent(src.slice(commaIndex + 1))
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
    hoisted.renderSpreadsheetPreviewHtml.mockClear()
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
      `data:application/pdf;base64,${btoa('/vault/assets/report.pdf')}`
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
    expect(iframe?.getAttribute('srcdoc')).toBeNull()
    expect(iframe?.getAttribute('src')).toContain('data:text/html;charset=utf-8,')
    const decodedSrc = decodePreviewSrc(iframe)
    expect(decodedSrc).toContain('<main>/vault/assets/report.docx</main>')
    expect(decodedSrc).toContain('tomosona-preview-theme')
    expect(decodedSrc).toContain('rel="stylesheet"')
    expect(decodedSrc).toContain('script src=')
    expect(decodedSrc).not.toContain('<style>')
    expect(decodedSrc).not.toContain('event.metaKey || event.ctrlKey')
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')
    expect(hoisted.renderPandocPreviewHtml).toHaveBeenCalledWith('/vault/assets/report.docx')
    expect(hoisted.renderSpreadsheetPreviewHtml).not.toHaveBeenCalled()

    mounted.app.unmount()
  })

  it('renders spreadsheet files with automatic sheet tabs', async () => {
    const mounted = mountInspector('/vault/assets/report.xlsx')
    await flushUi()

    const iframe = mounted.root.querySelector<HTMLIFrameElement>('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('srcdoc')).toBeNull()
    expect(decodePreviewSrc(iframe)).toContain('<section>/vault/assets/report.xlsx</section>')
    expect(hoisted.renderSpreadsheetPreviewHtml).toHaveBeenCalledWith('/vault/assets/report.xlsx')
    expect(hoisted.renderPandocPreviewHtml).not.toHaveBeenCalled()

    mounted.app.unmount()
  })

  it('renders ods files with the spreadsheet preview pipeline', async () => {
    const mounted = mountInspector('/vault/assets/report.ods')
    await flushUi()

    const iframe = mounted.root.querySelector<HTMLIFrameElement>('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('srcdoc')).toBeNull()
    expect(decodePreviewSrc(iframe)).toContain('<section>/vault/assets/report.ods</section>')
    expect(hoisted.renderSpreadsheetPreviewHtml).toHaveBeenCalledWith('/vault/assets/report.ods')
    expect(hoisted.renderPandocPreviewHtml).not.toHaveBeenCalled()

    mounted.app.unmount()
  })
})
