import { createApp, defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/vue-3'
import { useEditorChromeRuntime } from './useEditorChromeRuntime'

async function flushUi() {
  await nextTick()
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

function createEditorStub() {
  return {
    commands: {
      focus: vi.fn(),
      setMeta: vi.fn()
    },
    state: {
      selection: { from: 1, to: 2, empty: false },
      doc: {
        textBetween: vi.fn(() => 'Alpha')
      }
    },
    getText: vi.fn(() => 'Alpha'),
    chain: vi.fn(() => ({
      focus: vi.fn(() => ({
        setTextSelection: vi.fn(() => ({
          insertContent: vi.fn(() => ({ run: vi.fn(() => true) }))
        })),
        insertContent: vi.fn(() => ({ run: vi.fn(() => true) }))
      }))
    }))
  } as unknown as Editor
}

describe('useEditorChromeRuntime', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('delegates focus to the active editor', async () => {
    const activeEditor = ref<Editor | null>(createEditorStub()) as Ref<Editor | null>
    let runtime!: ReturnType<typeof useEditorChromeRuntime>

    const app = createApp(defineComponent({
      setup() {
        runtime = useEditorChromeRuntime({
          chromeHostPort: {
            holder: ref(document.createElement('div')),
            contentShell: ref(document.createElement('div')),
            pulsePanelWrap: ref(document.createElement('div')),
            getCurrentPath: () => 'a.md',
            getEditor: () => activeEditor.value,
            getSession: vi.fn(() => null)
          },
          chromeInteractionPort: {
            menus: {
              closeSlashMenu: vi.fn(),
              dismissSlashMenu: vi.fn(),
              closeWikilinkMenu: vi.fn(),
              openSlashAtSelection: vi.fn()
            },
            editorEvents: {
              onEditorKeydown: vi.fn(),
              onEditorKeyup: vi.fn(),
              onEditorContextMenu: vi.fn(),
              onEditorPaste: vi.fn(),
              markEditorInteraction: vi.fn()
            },
            caches: {
              resetWikilinkDataCache: vi.fn()
            }
          },
          chromeOutputPort: {
            emitPulseOpenSecondBrain: vi.fn()
          }
        })
        return () => h('div')
      }
    }))

    app.mount(document.createElement('div'))
    await flushUi()

    runtime.focusEditor()

    expect(activeEditor.value?.commands.focus).toHaveBeenCalled()

    app.unmount()
  })

  it('exposes loading overlay refs for document orchestration', async () => {
    let runtime!: ReturnType<typeof useEditorChromeRuntime>
    const activeEditor = ref<Editor | null>(createEditorStub()) as Ref<Editor | null>

    const app = createApp(defineComponent({
      setup() {
        runtime = useEditorChromeRuntime({
          chromeHostPort: {
            holder: ref(document.createElement('div')),
            contentShell: ref(document.createElement('div')),
            pulsePanelWrap: ref(document.createElement('div')),
            getCurrentPath: () => 'a.md',
            getEditor: () => activeEditor.value,
            getSession: vi.fn(() => null)
          },
          chromeInteractionPort: {
            menus: {
              closeSlashMenu: vi.fn(),
              dismissSlashMenu: vi.fn(),
              closeWikilinkMenu: vi.fn(),
              openSlashAtSelection: vi.fn()
            },
            editorEvents: {
              onEditorKeydown: vi.fn(),
              onEditorKeyup: vi.fn(),
              onEditorContextMenu: vi.fn(),
              onEditorPaste: vi.fn(),
              markEditorInteraction: vi.fn()
            },
            caches: {
              resetWikilinkDataCache: vi.fn()
            }
          },
          chromeOutputPort: {
            emitPulseOpenSecondBrain: vi.fn()
          }
        })
        return () => h('div')
      }
    }))

    app.mount(document.createElement('div'))
    await flushUi()

    expect(runtime.loadUiState.isLoadingLargeDocument.value).toBe(false)
    runtime.loadUiState.isLoadingLargeDocument.value = true
    runtime.loadUiState.loadStageLabel.value = 'Parsing'
    expect(runtime.loadUiState.loadStageLabel.value).toBe('Parsing')

    app.unmount()
  })
})
