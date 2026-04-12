import { createApp, defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./EditorAtMenu.vue', () => ({
  default: defineComponent({
    emits: ['update:index', 'update:query', 'select', 'close'],
    setup(_, { emit }) {
      return () =>
        h(
          'button',
          {
            class: 'at-overlay-stub',
            onClick: () => {
              emit('update:index', 2)
              emit('update:query', 'tod')
              emit('select', { id: 'today', label: 'Today', group: 'Time', description: '', replacement: '2026-04-12', aliases: ['today'] })
              emit('close')
            }
          },
          'at'
        )
    }
  })
}))

import EditorAtOverlay from './EditorAtOverlay.vue'

describe('EditorAtOverlay', () => {
  it('forwards macro menu events', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const onIndex = vi.fn()
    const onQuery = vi.fn()
    const onSelect = vi.fn()
    const onClose = vi.fn()

    const app = createApp(defineComponent({
      setup() {
        return () =>
          h(EditorAtOverlay, {
            open: true,
            index: 0,
            left: 8,
            top: 16,
            query: '',
            items: [],
            'onUpdate:index': onIndex,
            'onUpdate:query': onQuery,
            onSelect,
            onClose
          })
      }
    }))

    app.mount(root)
    ;(document.body.querySelector('.at-overlay-stub') as HTMLButtonElement).click()

    expect(onIndex).toHaveBeenCalledWith(2)
    expect(onQuery).toHaveBeenCalledWith('tod')
    expect(onSelect).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    app.unmount()
    document.body.innerHTML = ''
  })
})
