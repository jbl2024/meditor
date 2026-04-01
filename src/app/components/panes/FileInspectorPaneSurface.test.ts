import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FileInspectorPaneSurface from './FileInspectorPaneSurface.vue'

function mountInspector() {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const openExternally = vi.fn(async () => {})
  const toggleFavorite = vi.fn(async () => {})

  const app = createApp(defineComponent({
    setup() {
      return () => h(FileInspectorPaneSurface, {
        path: '/vault/assets/report.xlsx',
        isFavorite: true,
        openExternally,
        toggleFavorite
      })
    }
  }))

  app.mount(root)
  return { app, root, openExternally, toggleFavorite }
}

describe('FileInspectorPaneSurface', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps file details out of the inspector surface and focuses on actions plus preview', async () => {
    const mounted = mountInspector()
    await nextTick()

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

    mounted.app.unmount()
  })
})
