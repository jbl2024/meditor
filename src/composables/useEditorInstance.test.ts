import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useEditorInstance } from './useEditorInstance'

type FakeEditor = {
  isReady: Promise<void>
  destroy: ReturnType<typeof vi.fn>
}

describe('useEditorInstance', () => {
  it('registers and unregisters listeners symmetrically with observer lifecycle', async () => {
    const holderEl = document.createElement('div')
    const holder = ref<HTMLElement | null>(holderEl)
    const addSpy = vi.spyOn(holderEl, 'addEventListener')
    const removeSpy = vi.spyOn(holderEl, 'removeEventListener')

    let editor: FakeEditor | null = null
    const startObservers = vi.fn()
    const stopObservers = vi.fn()
    const beforeDestroy = vi.fn()
    const destroy = vi.fn(async () => {})

    const instance = useEditorInstance({
      holder,
      getEditor: () => editor as unknown as never,
      setEditor: (next) => {
        editor = next as unknown as FakeEditor | null
      },
      createEditor: vi.fn(() => ({
        isReady: Promise.resolve(),
        destroy
      } as unknown as never)),
      onEditorChange: vi.fn(async () => {}),
      listeners: [
        { type: 'keydown', handler: vi.fn() as unknown as EventListener, useCapture: true },
        { type: 'click', handler: vi.fn() as unknown as EventListener, useCapture: true }
      ],
      startObservers,
      stopObservers,
      beforeDestroy
    })

    await instance.ensureEditor()

    expect(startObservers).toHaveBeenCalledTimes(1)
    expect(addSpy).toHaveBeenCalledTimes(2)

    await instance.destroyEditor()

    expect(beforeDestroy).toHaveBeenCalledTimes(1)
    expect(stopObservers).toHaveBeenCalledTimes(1)
    expect(removeSpy).toHaveBeenCalledTimes(2)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('forwards editor onChange callback to injected side effects', async () => {
    const holder = ref<HTMLElement | null>(document.createElement('div'))
    let editor: FakeEditor | null = null
    const onEditorChange = vi.fn(async () => {})
    let capturedOnChange: (() => Promise<void>) | null = null

    const instance = useEditorInstance({
      holder,
      getEditor: () => editor as unknown as never,
      setEditor: (next) => {
        editor = next as unknown as FakeEditor | null
      },
      createEditor: vi.fn((_holder, onChange) => {
        capturedOnChange = onChange
        return {
          isReady: Promise.resolve(),
          destroy: vi.fn(async () => {})
        } as unknown as never
      }),
      onEditorChange,
      listeners: [],
      startObservers: vi.fn(),
      stopObservers: vi.fn()
    })

    await instance.ensureEditor()
    if (capturedOnChange) {
      await (capturedOnChange as unknown as () => Promise<void>)()
    }

    expect(onEditorChange).toHaveBeenCalledTimes(1)
  })

  it('is idempotent on ensure and safe on destroy when editor is absent', async () => {
    const holder = ref<HTMLElement | null>(document.createElement('div'))
    let editor: FakeEditor | null = null
    const createEditor = vi.fn(() => ({
      isReady: Promise.resolve(),
      destroy: vi.fn(async () => {})
    } as unknown as never))
    const stopObservers = vi.fn()

    const instance = useEditorInstance({
      holder,
      getEditor: () => editor as unknown as never,
      setEditor: (next) => {
        editor = next as unknown as FakeEditor | null
      },
      createEditor,
      onEditorChange: vi.fn(async () => {}),
      listeners: [],
      startObservers: vi.fn(),
      stopObservers,
      beforeDestroy: vi.fn()
    })

    await instance.destroyEditor()
    expect(stopObservers).toHaveBeenCalledTimes(1)

    await instance.ensureEditor()
    await instance.ensureEditor()

    expect(createEditor).toHaveBeenCalledTimes(1)
  })
})
