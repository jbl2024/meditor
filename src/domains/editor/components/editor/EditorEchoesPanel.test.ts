import { createApp, defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import EditorEchoesPanel from './EditorEchoesPanel.vue'

describe('EditorEchoesPanel', () => {
  it('renders suggestion cards and emits open/add/remove intents', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const onOpen = vi.fn()
    const onAdd = vi.fn()
    const onRemove = vi.fn()

    const app = createApp(defineComponent({
      setup() {
        return () => h(EditorEchoesPanel, {
          items: [
            {
              path: '/vault/notes/a.md',
              title: 'Note A',
              reasonLabel: 'Direct link',
              reasonLabels: ['Direct link'],
              score: 1,
              signalSources: ['direct'],
              isInContext: false
            },
            {
              path: '/vault/notes/b.md',
              title: 'Note B',
              reasonLabel: 'Semantically related',
              reasonLabels: ['Semantically related'],
              score: 0.9,
              signalSources: ['semantic'],
              isInContext: true
            }
          ],
          loading: false,
          error: '',
          hintVisible: true,
          toRelativePath: (path: string) => path.replace('/vault/', ''),
          onOpen,
          onAdd,
          onRemove
        })
      }
    }))

    app.mount(root)
    expect(root.textContent).toContain('Echoes')
    expect(root.textContent).toContain('Suggestions around this note.')
    const signalBadges = Array.from(root.querySelectorAll('.echoes-signal')) as HTMLSpanElement[]
    expect(signalBadges[0].title).toBe('direct link')
    expect(signalBadges[1].title).toBe('semantic similarity')

    const openButtons = Array.from(root.querySelectorAll('.echoes-open-btn')) as HTMLButtonElement[]
    openButtons[0].click()
    openButtons[1].click()
    const cards = Array.from(root.querySelectorAll('.echoes-card')) as HTMLDivElement[]
    cards[0].click()
    cards[1].click()
    const actionButtons = Array.from(root.querySelectorAll('.echoes-action-btn')) as HTMLButtonElement[]
    actionButtons[0].click()
    actionButtons[1].click()

    expect(onOpen).toHaveBeenCalledWith('/vault/notes/a.md')
    expect(onOpen).toHaveBeenCalledWith('/vault/notes/b.md')
    expect(onOpen).toHaveBeenCalledTimes(4)
    expect(root.querySelector('.echoes-title-btn')).toBeNull()
    expect(onAdd).toHaveBeenCalledWith('/vault/notes/a.md')
    expect(onRemove).toHaveBeenCalledWith('/vault/notes/b.md')
    expect(root.textContent).not.toContain('notes/a.md')
    app.unmount()
  })

  it('renders empty and error states', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = createApp(defineComponent({
      setup() {
        return () => h(EditorEchoesPanel, {
          items: [],
          loading: false,
          error: 'broken',
          hintVisible: false,
          toRelativePath: (path: string) => path
        })
      }
    }))

    app.mount(root)
    expect(root.textContent).toContain('broken')
    app.unmount()
  })
})
