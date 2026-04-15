import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import EditorPaneTabs from './EditorPaneTabs.vue'
import type { PaneState } from '../../composables/useMultiPaneWorkspaceState'

function mountTabs(pane: PaneState) {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const events: string[] = []

  const app = createApp(defineComponent({
    setup() {
      return () =>
        h(EditorPaneTabs, {
          pane,
          isActivePane: true,
          getStatus: () => ({ dirty: false, saving: false, saveError: '' }),
          onPaneFocus: (payload: { paneId: string }) => events.push(`focus:${payload.paneId}`),
          onTabClick: (payload: { paneId: string; tabId: string }) => events.push(`click:${payload.tabId}`),
          onTabClose: (payload: { paneId: string; tabId: string }) => events.push(`close:${payload.tabId}`),
          onTabCloseOthers: (payload: { paneId: string; tabId: string }) => events.push(`close-others:${payload.tabId}`),
          onTabCloseLeft: (payload: { paneId: string; tabId: string }) => events.push(`close-left:${payload.tabId}`),
          onTabCloseRight: (payload: { paneId: string; tabId: string }) => events.push(`close-right:${payload.tabId}`),
          onTabCloseAll: (payload: { paneId: string }) => events.push(`close-all:${payload.paneId}`),
          onRequestMoveTab: (payload: { paneId: string; direction: 'next' | 'previous' }) =>
            events.push(`move:${payload.direction}`)
        })
    }
  }))

  app.mount(root)
  return { app, root, events }
}

describe('EditorPaneTabs', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens a context menu for common close actions', async () => {
    const mounted = mountTabs({
      id: 'pane-1',
      activeTabId: 'doc-2',
      openTabs: [
        { id: 'doc-1', type: 'document', path: '/vault/a.md', pinned: false },
        { id: 'doc-2', type: 'document', path: '/vault/b.md', pinned: false },
        { id: 'doc-3', type: 'document', path: '/vault/c.md', pinned: false }
      ],
      activePath: '/vault/b.md'
    })

    const tabs = mounted.root.querySelectorAll<HTMLElement>('.pane-tab-item')
    tabs[1]?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 72 })
    )
    await nextTick()

    const menu = mounted.root.querySelector<HTMLElement>('.pane-tab-menu')
    expect(menu).toBeTruthy()

    const clickMenuItem = (label: string) => {
      const button = Array.from(mounted.root.querySelectorAll<HTMLButtonElement>('.pane-tab-menu .ui-menu-item'))
        .find((item) => item.textContent?.includes(label))
      expect(button).toBeTruthy()
      button?.click()
    }

    clickMenuItem('Close')
    tabs[1]?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 72 })
    )
    await nextTick()
    clickMenuItem('Close Others')
    tabs[1]?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 72 })
    )
    await nextTick()
    clickMenuItem('Close Tabs to the Left')
    tabs[1]?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 72 })
    )
    await nextTick()
    clickMenuItem('Close Tabs to the Right')

    expect(mounted.events).toEqual([
      'focus:pane-1',
      'close:doc-2',
      'focus:pane-1',
      'close-others:doc-2',
      'focus:pane-1',
      'close-left:doc-2',
      'focus:pane-1',
      'close-right:doc-2'
    ])

    mounted.app.unmount()
  })

  it('closes the tab on middle click', async () => {
    const mounted = mountTabs({
      id: 'pane-1',
      activeTabId: 'doc-2',
      openTabs: [
        { id: 'doc-1', type: 'document', path: '/vault/a.md', pinned: false },
        { id: 'doc-2', type: 'document', path: '/vault/b.md', pinned: false }
      ],
      activePath: '/vault/b.md'
    })

    const tab = mounted.root.querySelectorAll<HTMLElement>('.pane-tab-item')[1]
    tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 1 }))
    tab?.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))
    await nextTick()

    expect(mounted.events).toEqual(['focus:pane-1', 'close:doc-2'])
    expect(mounted.root.querySelector('.pane-tab-menu')).toBeNull()

    mounted.app.unmount()
  })
})
