import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WorkspaceSpellcheckDictionaryModal from './WorkspaceSpellcheckDictionaryModal.vue'

function mountHarness() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const visible = ref(true)
  const app = createApp(defineComponent({
    setup() {
      return () =>
        h(WorkspaceSpellcheckDictionaryModal, {
          visible: visible.value,
          workspacePath: '/vault',
          workspaceLabel: '/vault',
          onClose: () => {
            visible.value = false
          }
        })
    }
  }))

  app.mount(root)
  return { app, root, visible }
}

describe('WorkspaceSpellcheckDictionaryModal', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('adds, lists, removes, and clears workspace spellcheck words', async () => {
    const mounted = mountHarness()
    await nextTick()

    const input = mounted.root.querySelector<HTMLInputElement>('#spellcheck-dictionary-add-input')
    expect(input).toBeTruthy()
    expect(document.activeElement).toBe(input)

    if (!input) throw new Error('Missing dictionary input')
    input.value = 'orthographe'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    mounted.root.querySelector<HTMLButtonElement>('.spellcheck-dictionary-add-row button')?.click()
    await nextTick()

    expect(mounted.root.textContent).toContain('orthographe')
    expect(window.localStorage.getItem('tomosona:editor:spellcheck-ignore:%2Fvault')).toContain('orthographe')

    mounted.root.querySelector<HTMLButtonElement>('[aria-label="Remove orthographe"]')?.click()
    await nextTick()

    expect(mounted.root.textContent).not.toContain('orthographe')

    input.value = 'alpha'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    mounted.root.querySelector<HTMLButtonElement>('.spellcheck-dictionary-add-row button')?.click()
    await nextTick()

    Array.from(mounted.root.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('Clear all'))?.click()
    await nextTick()

    expect(mounted.root.textContent).toContain('No words have been added yet.')
    mounted.app.unmount()
  })
})
