import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import EditorPropertiesPanel from './EditorPropertiesPanel.vue'
import type { PropertyType } from '../../lib/propertyTypes'

async function flushUi() {
  await nextTick()
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

describe('EditorPropertiesPanel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders collapsed row without overlay classes', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = createApp(defineComponent({
      setup() {
        return () => h(EditorPropertiesPanel, {
          expanded: false,
          hasProperties: true,
          mode: 'structured',
          canUseStructuredProperties: true,
          structuredPropertyFields: [],
          structuredPropertyKeys: [],
          activeRawYaml: '',
          activeParseErrors: [],
          corePropertyOptions: [],
          effectiveTypeForField: (): PropertyType => 'text',
          isPropertyTypeLocked: () => false
        })
      }
    }))

    app.mount(root)
    await flushUi()

    expect(root.querySelector('.properties-panel')).toBeTruthy()
    expect(root.querySelector('.properties-content-wrap')).toBeFalsy()
    expect(root.innerHTML).not.toContain('absolute')

    app.unmount()
  })
})
