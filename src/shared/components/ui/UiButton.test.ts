import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import UiButton from './UiButton.vue'

describe('UiButton', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders variants and loading state accessibly', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const loading = ref(true)

    const app = createApp(defineComponent({
      setup() {
        return () => h(UiButton, {
          variant: 'danger',
          loading: loading.value,
          onClick: () => {}
        }, () => 'Delete')
      }
    }))

    app.mount(root)
    await nextTick()

    const button = root.querySelector('button')
    expect(button?.className).toContain('ui-button--danger')
    expect(button?.getAttribute('aria-busy')).toBe('true')
    expect(button?.disabled).toBe(true)
    expect(root.querySelector('.ui-button__spinner')).toBeTruthy()

    app.unmount()
  })
})
