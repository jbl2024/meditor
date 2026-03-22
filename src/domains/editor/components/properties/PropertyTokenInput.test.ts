import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import PropertyTokenInput from './PropertyTokenInput.vue'

describe('PropertyTokenInput', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders autocomplete suggestions through a datalist', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = createApp(defineComponent({
      setup() {
        return () => h(PropertyTokenInput, {
          modelValue: ['draft'],
          suggestions: ['draft', 'review', 'published', 'review']
        })
      }
    }))

    app.mount(root)
    await nextTick()

    const input = root.querySelector('.token-editor') as HTMLInputElement | null
    expect(input?.getAttribute('list')).toContain('property-token-input-suggestions-')

    const datalist = root.querySelector('datalist')
    expect(datalist).toBeTruthy()
    expect(datalist?.querySelectorAll('option')).toHaveLength(2)
    expect(Array.from(datalist?.querySelectorAll('option') ?? []).map((option) => (option as HTMLOptionElement).value)).toEqual([
      'review',
      'published'
    ])

    app.unmount()
  })
})
