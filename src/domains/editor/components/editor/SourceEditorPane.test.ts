import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import SourceEditorPane from './SourceEditorPane.vue'

async function flushUi() {
  await nextTick()
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

describe('SourceEditorPane', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders CodeMirror line numbers for raw text editing', async () => {
    const value = ref('first line\nsecond line')
    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = createApp(defineComponent({
      setup() {
        return () =>
          h(SourceEditorPane, {
            modelValue: value.value,
            languageLabel: 'txt',
            'onUpdate:modelValue': (next: string) => {
              value.value = next
            }
          })
      }
    }))

    app.mount(root)
    await flushUi()

    expect(root.querySelector('.cm-gutters')).toBeTruthy()
    expect(root.querySelector('.cm-editor')).toBeTruthy()

    app.unmount()
  })
})
