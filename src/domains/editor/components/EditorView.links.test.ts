import { createApp, defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import EditorView from './EditorView.vue'

async function flushUi() {
  await nextTick()
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

describe('EditorView markdown link routing', () => {
  const rect = () => ({
    left: 0,
    top: 0,
    right: 40,
    bottom: 16,
    width: 40,
    height: 16,
    x: 0,
    y: 0,
    toJSON: () => ({})
  })

  const rectList = () => [rect()]

  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {}
  }
  if (!HTMLElement.prototype.scrollTo) {
    HTMLElement.prototype.scrollTo = () => {}
  }
  for (const prototype of [Node.prototype, Element.prototype, HTMLElement.prototype, Text.prototype, Range.prototype]) {
    Object.defineProperty(prototype, 'getClientRects', {
      configurable: true,
      value: rectList
    })
    Object.defineProperty(prototype, 'getBoundingClientRect', {
      configurable: true,
      value: rect
    })
  }

  it('opens relative markdown links without delegating to browser navigation', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const openLinkTarget = vi.fn(async () => true)

    const app = createApp(defineComponent({
      setup() {
        return () =>
          h(EditorView, {
            path: '/vault/docs/current.md',
            openPaths: ['/vault/docs/current.md'],
            openFile: async () => '# Title\n\n- [Mattermost](mattermost/index.md)\n- [Code](code)',
            saveFile: async () => ({ persisted: true }),
            renameFileFromTitle: async (valuePath: string, title: string) => ({ path: valuePath, title }),
            loadLinkTargets: async () => ['/vault/docs/mattermost/index.md', '/vault/docs/code/index.md'],
            loadLinkHeadings: async () => ['H1'],
            loadPropertyTypeSchema: async () => ({}),
            savePropertyTypeSchema: async () => {},
            openLinkTarget,
            onStatus: () => {},
            onOutline: () => {},
            onProperties: () => {},
            onPathRenamed: () => {}
          })
      }
    }))

    app.mount(root)
    await flushUi()

    const links = Array.from(root.querySelectorAll('.ProseMirror a')) as HTMLAnchorElement[]
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['mattermost/index.md', 'code'])

    const firstClick = links[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const secondClick = links[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await flushUi()

    expect(firstClick).toBe(false)
    expect(secondClick).toBe(false)
    expect(openLinkTarget).toHaveBeenNthCalledWith(1, '/vault/docs/mattermost/index.md')
    expect(openLinkTarget).toHaveBeenNthCalledWith(2, '/vault/docs/code')

    app.unmount()
    document.body.innerHTML = ''
  })
})
