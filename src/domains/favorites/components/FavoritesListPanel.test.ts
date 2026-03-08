import { createApp, defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import FavoritesListPanel from './FavoritesListPanel.vue'

function mountHarness() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const events: string[] = []
  const items = ref([
    { path: 'Alpha.md', added_at_ms: 1, exists: true },
    { path: 'ghost.md', added_at_ms: 2, exists: false }
  ])

  const app = createApp(defineComponent({
    setup() {
      return () =>
        h(FavoritesListPanel, {
          items: items.value,
          activePath: 'Alpha.md',
          loading: false,
          toRelativePath: (path: string) => path,
          onOpen: (path: string) => events.push(`open:${path}`),
          onRemove: (path: string) => events.push(`remove:${path}`)
        })
    }
  }))

  app.mount(root)
  return { app, root, events }
}

describe('FavoritesListPanel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens existing favorites and removes missing ones', () => {
    const mounted = mountHarness()

    const rows = mounted.root.querySelectorAll<HTMLButtonElement>('.favorites-row')
    rows[0]?.click()
    rows[1]?.click()
    mounted.root.querySelector<HTMLButtonElement>('.favorites-row-remove')?.click()

    expect(mounted.events).toEqual(['open:Alpha.md', 'remove:ghost.md'])

    mounted.app.unmount()
  })
})
