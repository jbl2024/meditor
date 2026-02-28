import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import UiFilterableDropdown, { type FilterableDropdownItem } from './UiFilterableDropdown.vue'

describe('UiFilterableDropdown', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function mountHarness(options?: { showFilter?: boolean }) {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const open = ref(true)
    const query = ref('')
    const activeIndex = ref(0)
    const selected = ref<FilterableDropdownItem | null>(null)

    const items = ref<FilterableDropdownItem[]>([
      { id: 'alpha', label: 'Alpha' },
      { id: 'beta', label: 'Beta' }
    ])

    const Harness = defineComponent({
      setup() {
        return () =>
          h(
            UiFilterableDropdown,
            {
              items: items.value,
              modelValue: open.value,
              query: query.value,
              activeIndex: activeIndex.value,
              showFilter: options?.showFilter ?? true,
              onOpenChange: (value: boolean) => {
                open.value = value
              },
              onQueryChange: (value: string) => {
                query.value = value
              },
              onActiveIndexChange: (value: number) => {
                activeIndex.value = value
              },
              onSelect: (item: FilterableDropdownItem) => {
                selected.value = item
              }
            },
            {
              trigger: ({ toggleMenu }: { toggleMenu: () => void }) =>
                h(
                  'button',
                  {
                    type: 'button',
                    'data-testid': 'trigger',
                    onClick: toggleMenu
                  },
                  'Trigger'
                )
            }
          )
      }
    })

    const app = createApp(Harness)
    app.mount(root)

    return { app, root, open, query, activeIndex, selected, items }
  }

  it('renders list items and empty state when no matches', async () => {
    const ctx = mountHarness()
    await nextTick()

    expect(ctx.root.querySelectorAll('.ui-filterable-dropdown-option')).toHaveLength(2)

    const input = ctx.root.querySelector('input') as HTMLInputElement
    input.value = 'zzz'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(ctx.root.textContent).toContain('No matches')
    ctx.app.unmount()
  })

  it('emits select via click and Enter', async () => {
    const ctx = mountHarness()
    await nextTick()

    const options = Array.from(ctx.root.querySelectorAll('.ui-filterable-dropdown-option')) as HTMLButtonElement[]
    options[1].click()
    await nextTick()
    expect(ctx.selected.value?.id).toBe('beta')

    ctx.open.value = true
    ctx.activeIndex.value = 0
    await nextTick()
    const input = ctx.root.querySelector('input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(ctx.selected.value?.id).toBe('alpha')

    ctx.app.unmount()
  })

  it('updates active index with arrow keys', async () => {
    const ctx = mountHarness()
    await nextTick()

    const input = ctx.root.querySelector('input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    expect(ctx.activeIndex.value).toBe(1)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    await nextTick()
    expect(ctx.activeIndex.value).toBe(0)

    ctx.app.unmount()
  })

  it('sets combobox/listbox accessibility attributes', async () => {
    const ctx = mountHarness()
    await nextTick()

    const input = ctx.root.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-expanded')).toBe('true')

    const listbox = ctx.root.querySelector('[role=\"listbox\"]')
    expect(listbox).toBeTruthy()

    ctx.app.unmount()
  })
})
