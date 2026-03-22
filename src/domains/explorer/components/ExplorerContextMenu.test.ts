import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import ExplorerContextMenu from './ExplorerContextMenu.vue'

function mountHarness() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const events: string[] = []

  const app = createApp(defineComponent({
    setup() {
      return () =>
        h(ExplorerContextMenu, {
          x: 24,
          y: 24,
          canOpen: true,
          canPaste: true,
          canRename: true,
          canDelete: true,
          onAction: (action: string) => events.push(action)
        })
    }
  }))

  app.mount(root)
  return { app, events }
}

describe('ExplorerContextMenu', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps icons limited to high-signal actions and marks destructive rows', async () => {
    const mounted = mountHarness()
    await nextTick()

    const menu = document.body.querySelector('.explorer-context-menu')
    const buttons = Array.from(menu?.querySelectorAll<HTMLButtonElement>('.explorer-context-menu-item') ?? [])
    const iconLabels = buttons
      .filter((button) => button.querySelector('svg'))
      .map((button) => button.textContent?.trim())

    expect(iconLabels).toEqual([
      'Open externally',
      'Delete',
      'New note',
      'New folder'
    ])
    expect(buttons.find((button) => button.textContent?.includes('Delete'))?.getAttribute('data-tone')).toBe('danger')
    expect(buttons.find((button) => button.textContent?.includes('Open'))?.querySelector('.ui-menu-item-icon-spacer')).toBeTruthy()

    mounted.app.unmount()
  })
})
