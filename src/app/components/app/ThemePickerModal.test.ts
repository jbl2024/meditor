import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import ThemePickerModal from './ThemePickerModal.vue'
import type { ThemePreference } from '../../composables/useAppTheme'

function mountHarness() {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const query = ref('')
  const activeIndex = ref(0)
  const selectedPreference = ref<ThemePreference>('system')
  const events: string[] = []

  const app = createApp(defineComponent({
    setup() {
      return () =>
        h(ThemePickerModal, {
          visible: true,
          query: query.value,
          items: [
            {
              kind: 'system',
              id: 'system',
              label: 'System',
              meta: 'System (Tomosona Light)',
              previewThemeIds: ['tomosona-light', 'tomosona-dark']
            },
            {
              kind: 'theme',
              id: 'tokyo-night',
              label: 'Tokyo Night',
              meta: 'Included • Dark',
              colorScheme: 'dark',
              group: 'community'
            }
          ],
          activeIndex: activeIndex.value,
          selectedPreference: selectedPreference.value,
          onSelect: (value: ThemePreference) => {
            selectedPreference.value = value
            events.push(`select:${value}`)
          },
          'onUpdate:query': (value: string) => {
            query.value = value
            events.push(`query:${value}`)
          },
          onSetActiveIndex: (value: number) => {
            activeIndex.value = value
            events.push(`index:${value}`)
          },
          onClose: () => events.push('close'),
          onKeydown: () => events.push('keydown')
        })
    }
  }))

  app.mount(root)
  return { app, root, events, query, selectedPreference }
}

describe('ThemePickerModal', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('emits filter and selection interactions', async () => {
    const mounted = mountHarness()

    const input = mounted.root.querySelector<HTMLInputElement>('[data-theme-picker-input="true"]')
    if (!input) throw new Error('Expected theme picker input')
    input.value = 'tokyo'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    const button = Array.from(mounted.root.querySelectorAll<HTMLButtonElement>('.theme-picker-item'))
      .find((item) => item.textContent?.includes('Tokyo Night'))
    button?.click()
    await nextTick()

    expect(mounted.events).toContain('query:tokyo')
    expect(mounted.events).toContain('select:tokyo-night')
    expect(mounted.selectedPreference.value).toBe('tokyo-night')

    mounted.app.unmount()
  })
})
