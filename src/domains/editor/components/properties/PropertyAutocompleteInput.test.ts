import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import PropertyAutocompleteInput from './PropertyAutocompleteInput.vue'

describe('PropertyAutocompleteInput', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows all autocomplete suggestions on focus and filters as the user types', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const value = ref('')

    const app = createApp(defineComponent({
      setup() {
        return () => h(PropertyAutocompleteInput, {
          modelValue: value.value,
          suggestions: ['status', 'stage', 'source', 'status'],
          placeholder: 'key',
          'onUpdate:modelValue': (next: string) => { value.value = next }
        })
      }
    }))

    app.mount(root)
    await nextTick()

    const input = root.querySelector('.ui-input') as HTMLInputElement | null
    input?.focus()
    await nextTick()

    let menu = document.body.querySelector('.property-autocomplete-input-menu')
    expect(menu).toBeTruthy()
    let options = Array.from(menu?.querySelectorAll('.ui-filterable-dropdown-option') ?? []).map(
      (option) => option.textContent?.trim()
    )
    expect(options).toEqual(['status', 'stage', 'source'])

    input!.value = 'st'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    menu = document.body.querySelector('.property-autocomplete-input-menu')
    expect(menu).toBeTruthy()
    options = Array.from(menu?.querySelectorAll('.ui-filterable-dropdown-option') ?? []).map(
      (option) => option.textContent?.trim()
    )
    expect(options).toEqual(['status', 'stage'])

    Array.from(menu?.querySelectorAll<HTMLButtonElement>('.ui-filterable-dropdown-option') ?? [])
      .find((button) => button.textContent?.trim() === 'stage')
      ?.click()
    await nextTick()

    expect(value.value).toBe('stage')

    app.unmount()
  })
})
