import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import WorkspaceOverflowMenu from './WorkspaceOverflowMenu.vue'

function mountHarness(showDebugTools = false) {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const open = ref(true)
  const theme = ref<'light' | 'dark' | 'system'>('system')
  const events: string[] = []

  const app = createApp(defineComponent({
    setup() {
      return () =>
        h(WorkspaceOverflowMenu, {
          open: open.value,
          hasWorkspace: true,
          indexingState: 'indexed',
          zoomPercentLabel: '100%',
          themePreference: theme.value,
          showDebugTools,
          onToggle: () => events.push('toggle'),
          onOpenCommandPalette: () => events.push('palette'),
          onOpenShortcuts: () => events.push('shortcuts'),
          onOpenAbout: () => events.push('about'),
          onOpenSettings: () => events.push('settings'),
          onOpenDesignSystemDebug: () => events.push('design-system'),
          onRebuildIndex: () => events.push('rebuild'),
          onCloseWorkspace: () => events.push('close-workspace'),
          onZoomIn: () => events.push('zoom-in'),
          onZoomOut: () => events.push('zoom-out'),
          onResetZoom: () => events.push('zoom-reset'),
          onSetTheme: (value: 'light' | 'dark' | 'system') => {
            theme.value = value
            events.push(`theme:${value}`)
          }
        })
    }
  }))

  app.mount(root)
  return { app, root, events, theme }
}

describe('WorkspaceOverflowMenu', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('emits menu actions and theme changes', async () => {
    const mounted = mountHarness()
    const buttons = mounted.root.querySelectorAll<HTMLButtonElement>('.overflow-item')

    buttons[0]?.click()
    buttons[2]?.click()
    buttons[6]?.click()
    buttons[9]?.click()
    await nextTick()

    expect(mounted.events).toEqual(['palette', 'about', 'zoom-in', 'theme:light'])
    expect(mounted.theme.value).toBe('light')

    mounted.app.unmount()
  })

  it('shows the design-system debug entry only when enabled', async () => {
    const hidden = mountHarness(false)
    expect(hidden.root.textContent).not.toContain('Design system debug')
    hidden.app.unmount()

    const shown = mountHarness(true)
    const debugButton = Array.from(shown.root.querySelectorAll<HTMLButtonElement>('.overflow-item'))
      .find((button) => button.textContent?.includes('Design system debug'))

    debugButton?.click()
    await nextTick()

    expect(debugButton).toBeTruthy()
    expect(shown.events).toContain('design-system')
    shown.app.unmount()
  })
})
