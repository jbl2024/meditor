import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  readPdfDataUrl: vi.fn(async (path: string) => `data:application/pdf;base64,${Buffer.from(path).toString('base64')}`)
}))

vi.mock('../../../shared/api/workspaceApi', () => ({
  readPdfDataUrl: hoisted.readPdfDataUrl
}))

import FileInspectorPaneSurface from './FileInspectorPaneSurface.vue'

function mountInspector(path = '/vault/assets/report.xlsx') {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const openExternally = vi.fn(async () => {})
  const toggleFavorite = vi.fn(async () => {})

  const app = createApp(defineComponent({
    setup() {
      return () => h(FileInspectorPaneSurface, {
        path,
        isFavorite: true,
        openExternally,
        toggleFavorite
      })
    }
  }))

  app.mount(root)
  return { app, root, openExternally, toggleFavorite }
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

    expect(mounted.root.textContent).toContain('report.xlsx')
    expect(mounted.root.textContent).toContain('Open natively')
    expect(mounted.root.textContent).toContain('Preview')
    expect(mounted.root.textContent).not.toContain('Created')
    expect(mounted.root.textContent).not.toContain('Updated')

    mounted.root.querySelector<HTMLButtonElement>('.file-inspector-action--primary')?.click()
    mounted.root.querySelector<HTMLButtonElement>('.file-inspector-action:not(.file-inspector-action--primary)')?.click()
    await nextTick()

    expect(mounted.openExternally).toHaveBeenCalledOnce()
    expect(mounted.toggleFavorite).toHaveBeenCalledOnce()
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
})
