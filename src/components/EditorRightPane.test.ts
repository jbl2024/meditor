import { createApp, defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import EditorRightPane from './EditorRightPane.vue'

describe('EditorRightPane', () => {
  it('renders rows and forwards outline/backlink intents', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const onOutlineClick = vi.fn()
    const onBacklinkOpen = vi.fn()

    const app = createApp(defineComponent({
      setup() {
        return () => h(EditorRightPane, {
          width: 320,
          outline: [{ level: 2, text: 'Roadmap' }],
          backlinks: ['/wk/notes/a.md'],
          backlinksLoading: false,
          metadataRows: [{ label: 'Path', value: 'notes/a.md' }],
          propertiesPreview: [{ key: 'tags', value: 'doc' }],
          propertyParseErrorCount: 0,
          toRelativePath: (path: string) => path.replace('/wk/', ''),
          onOutlineClick,
          onBacklinkOpen
        })
      }
    }))

    app.mount(root)
    const buttons = Array.from(root.querySelectorAll('.outline-row')) as HTMLButtonElement[]
    expect(buttons.length).toBe(2)

    buttons[0].click()
    expect(onOutlineClick).toHaveBeenCalledWith({ index: 0, heading: { level: 2, text: 'Roadmap' } })

    buttons[1].click()
    expect(onBacklinkOpen).toHaveBeenCalledWith('/wk/notes/a.md')

    expect(root.querySelector('.right-pane')?.getAttribute('style')).toContain('width: 320px;')

    app.unmount()
    document.body.innerHTML = ''
  })
})
