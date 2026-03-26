import { createApp, defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../shared/components/ui/UiMenu.vue', () => ({
  default: defineComponent({
    setup(_, { slots }) {
      return () => h('div', { class: 'ui-menu-stub' }, slots.default?.())
    }
  })
}))

vi.mock('../../../../shared/components/ui/UiMenuList.vue', () => ({
  default: defineComponent({
    setup(_, { slots }) {
      return () => h('div', { class: 'ui-menu-list-stub' }, slots.default?.())
    }
  })
}))

import EditorSpellcheckMenu from './EditorSpellcheckMenu.vue'

describe('EditorSpellcheckMenu', () => {
  it('focuses the first action and lets arrow keys move through the menu', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = createApp(defineComponent({
      setup() {
        return () => h(EditorSpellcheckMenu, {
          open: true,
          left: 12,
          top: 24,
          mode: 'single',
          word: 'orthografe',
          primarySuggestion: 'orthographe',
          suggestions: [],
          loading: false
        })
      }
    }))

    app.mount(root)
    await nextTick()
    await Promise.resolve()

    const buttons = Array.from(document.body.querySelectorAll('.tomosona-spellcheck-menu button')) as HTMLButtonElement[]
    expect(buttons).toHaveLength(3)
    expect(document.activeElement).toBe(buttons[0])

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    expect(document.activeElement).toBe(buttons[1])

    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    expect(document.activeElement).toBe(buttons[2])

    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    await nextTick()
    expect(document.activeElement).toBe(buttons[1])

    app.unmount()
    document.body.innerHTML = ''
  })

  it('renders the ranked suggestions dropdown with English secondary actions', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = createApp(defineComponent({
      setup() {
        return () => h(EditorSpellcheckMenu, {
          open: true,
          left: 12,
          top: 24,
          mode: 'list',
          word: 'orthografe',
          primarySuggestion: 'orthographe',
          suggestions: ['ornithologie', 'orthographe'],
          loading: false
        })
      }
    }))

    app.mount(root)
    await nextTick()
    await Promise.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 50))

    const input = document.body.querySelector('.ui-filterable-dropdown-filter-input') as HTMLInputElement | null
    expect(input).toBeTruthy()
    expect(input?.placeholder).toBe('Search suggestions...')
    expect(document.activeElement).toBe(input)

    const options = Array.from(document.body.querySelectorAll('.ui-filterable-dropdown-option')).map((node) => node.textContent?.trim())
    expect(options[0]).toContain('orthographe')
    expect(options[1]).toContain('ornithologie')
    expect(document.body.textContent).not.toContain('%')
    expect(document.body.textContent).toContain('Ignore')
    expect(document.body.textContent).toContain('Add to dictionary')

    if (!input) throw new Error('Expected spellcheck filter input')
    input.value = 'orn'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    const filteredOptions = Array.from(document.body.querySelectorAll('.ui-filterable-dropdown-option')).map((node) => node.textContent?.trim())
    expect(filteredOptions).toEqual(['ornithologie'])

    app.unmount()
    document.body.innerHTML = ''
  })

  it('exposes the teleported list menu element so the runtime can focus its input', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    let capturedMenuEl: HTMLDivElement | null = null

    const app = createApp(defineComponent({
      setup() {
        return () => h(EditorSpellcheckMenu, {
          open: true,
          left: 12,
          top: 24,
          mode: 'list',
          word: 'orthografe',
          primarySuggestion: 'orthographe',
          suggestions: ['ornithologie', 'orthographe'],
          loading: false,
          onMenuEl: (element: HTMLDivElement | null) => {
            capturedMenuEl = element
          }
        })
      }
    }))

    app.mount(root)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(capturedMenuEl).toBeTruthy()
    const menuEl = capturedMenuEl as HTMLDivElement | null
    expect(menuEl?.querySelector('.ui-filterable-dropdown-filter-input')).toBeTruthy()

    app.unmount()
    document.body.innerHTML = ''
  })
})
