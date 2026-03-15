import { createApp, defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import UiModalShell from './UiModalShell.vue'

describe('UiModalShell', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('closes from backdrop and renders footer actions', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const open = ref(true)
    const events: string[] = []

    const app = createApp(defineComponent({
      setup() {
        return () => h(UiModalShell, {
          modelValue: open.value,
          title: 'Test dialog',
          description: 'Dialog copy',
          onClose: () => events.push('close'),
          'onUpdate:modelValue': (value: boolean) => {
            open.value = value
            events.push(`model:${value}`)
          }
        }, {
          default: () => h('p', 'Body'),
          footer: () => h('button', { type: 'button' }, 'Done')
        })
      }
    }))

    app.mount(root)

    expect(root.textContent).toContain('Test dialog')
    expect(root.textContent).toContain('Done')

    root.querySelector('.ui-modal-shell')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(events).toEqual(['model:false', 'close'])
    app.unmount()
  })

  it('closes from Escape', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const open = ref(true)
    const events: string[] = []

    const app = createApp(defineComponent({
      setup() {
        return () => h(UiModalShell, {
          modelValue: open.value,
          title: 'Test dialog',
          onClose: () => events.push('close'),
          'onUpdate:modelValue': (value: boolean) => {
            open.value = value
            events.push(`model:${value}`)
          }
        }, {
          default: () => h('p', 'Body')
        })
      }
    }))

    app.mount(root)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(events).toEqual(['model:false', 'close'])
    app.unmount()
  })
})
