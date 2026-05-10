import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const previewMarkdown = ref('')
const provenancePaths = ref<string[]>([])
const previewTitle = ref('')
const running = ref(false)
const error = ref('')
const requestId = ref('')
const outputId = ref('')
const runMock = vi.fn(async () => ({ request_id: 'pulse-test', output_id: 'pulse-output' }))
const cancelMock = vi.fn(async () => {})
const resetMock = vi.fn(() => {
  previewMarkdown.value = ''
  provenancePaths.value = []
  previewTitle.value = ''
  running.value = false
  error.value = ''
})

vi.mock('../../pulse/composables/usePulseTransformation', () => ({
  usePulseTransformation: () => ({
    requestId,
    outputId,
    previewMarkdown,
    provenancePaths,
    previewTitle,
    running,
    error,
    run: runMock,
    cancel: cancelMock,
    reset: resetMock
  })
}))

vi.mock('./editor/EditorInlineFormatToolbar.vue', () => ({
  default: defineComponent({
    emits: ['open-pulse'],
    setup(_props, { emit }) {
      return () => h('button', {
        type: 'button',
        'data-action': 'pulse',
        onClick: () => emit('open-pulse')
      }, 'Pulse')
    }
  })
}))

import EditorView from './EditorView.vue'

async function flushUi() {
  await nextTick()
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

function mountHarness() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const onPulseOpenSecondBrain = vi.fn()
  const onPulseStateChange = vi.fn()
  const editorRef = ref<unknown>(null)

  const app = createApp(defineComponent({
    setup() {
      return () => h(EditorView, {
        ref: editorRef,
        path: 'a.md',
        openPaths: ['a.md'],
        openFile: async () => '# Title\n\nAlpha beta gamma',
        saveFile: async () => ({ persisted: true }),
        renameFileFromTitle: async (path: string, title: string) => ({ path, title }),
        loadLinkTargets: async () => ['a.md'],
        loadLinkHeadings: async () => ['H1'],
        loadPropertyTypeSchema: async () => ({}),
        savePropertyTypeSchema: async () => {},
        openLinkTarget: async () => true,
        onStatus: () => {},
        onOutline: () => {},
        onProperties: () => {},
        onPathRenamed: () => {},
        onPulseStateChange,
        onPulseOpenSecondBrain
      })
    }
  }))

  app.mount(root)
  return { app, root, onPulseOpenSecondBrain, onPulseStateChange, editorRef }
}

function exposedPulseApi(editorRef: ReturnType<typeof ref<unknown>>) {
  return editorRef.value as {
    getPulseDrawerState: () => {
      open: boolean
      instruction: string
      applyModes: string[]
    }
    runPulseFromEditor: () => Promise<void>
    setPulseInstruction: (value: string) => void
    applyPulseMode: (mode: 'replace_selection' | 'insert_below' | 'send_to_second_brain') => void
    closePulsePanel: () => void
  }
}

function openPulseFromEditorHarness(editorRef: ReturnType<typeof ref<unknown>>) {
  const setupState = (editorRef.value as { $?: { setupState?: Record<string, any> } })?.$?.setupState
  if (!setupState) throw new Error('Expected EditorView setup state')
  setupState.pulseSourceKind = 'editor_selection'
  setupState.pulseActionId = 'rewrite'
  setupState.pulseSourceText = 'Alpha beta'
  setupState.pulseSelectionRange = { from: 10, to: 20 }
  setupState.setPulseInstruction('Clarify the selected passage without changing its meaning.', { markDirty: false })
  setupState.pulseOpen = true
}

describe('EditorView Pulse flow', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollBy', {
      configurable: true,
      value: vi.fn()
    })
    const rectList = () => [{ left: 0, top: 0, right: 40, bottom: 16, width: 40, height: 16 }]
    const rect = () => ({ left: 0, top: 0, right: 40, bottom: 16, width: 40, height: 16 })
    for (const prototype of [Node.prototype, Element.prototype, HTMLElement.prototype, Text.prototype, Range.prototype]) {
      Object.defineProperty(prototype, 'getClientRects', {
        configurable: true,
        value: rectList
      })
      Object.defineProperty(prototype, 'getBoundingClientRect', {
        configurable: true,
        value: rect
      })
    }
    previewMarkdown.value = ''
    provenancePaths.value = []
    previewTitle.value = ''
    running.value = false
    error.value = ''
    requestId.value = ''
    outputId.value = ''
    runMock.mockClear()
    cancelMock.mockClear()
    resetMock.mockClear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens Pulse from selection with a prefilled prompt and no auto-run', async () => {
    const harness = mountHarness()
    await flushUi()

    openPulseFromEditorHarness(harness.editorRef)
    await flushUi()

    const pulseState = exposedPulseApi(harness.editorRef).getPulseDrawerState()
    expect(harness.root.querySelector('.editor-pulse-panel-wrap')).toBeNull()
    expect(pulseState.open).toBe(true)
    expect(pulseState.instruction).toContain('Clarify the selected passage')
    expect(harness.onPulseStateChange).toHaveBeenCalled()
    expect(runMock).not.toHaveBeenCalled()

    harness.app.unmount()
  })

  it('opens Pulse from the full note when requested from the side panel', async () => {
    const harness = mountHarness()
    await flushUi()

    ;(harness.editorRef.value as { openPulseForNote?: () => void })?.openPulseForNote?.()
    await flushUi()

    const setupState = (harness.editorRef.value as { $?: { setupState?: Record<string, any> } })?.$?.setupState
    expect(setupState?.pulseSourceKind).toBe('editor_note')
    expect(setupState?.pulseSelectionRange).toBeNull()
    expect(setupState?.pulseActionId).toBe('synthesize')

    harness.app.unmount()
  })

  it('runs with Enter, invalidates stale preview on prompt edit, and applies with Cmd+Enter', async () => {
    const harness = mountHarness()
    await flushUi()

    openPulseFromEditorHarness(harness.editorRef)
    await flushUi()

    const api = exposedPulseApi(harness.editorRef)
    await api.runPulseFromEditor()
    await flushUi()
    expect(runMock).toHaveBeenCalledTimes(1)

    previewMarkdown.value = 'Alpha beta, clarified.'
    await flushUi()
    expect(api.getPulseDrawerState().applyModes).toContain('replace_selection')

    api.setPulseInstruction('Make it shorter.')
    await flushUi()
    expect(resetMock).toHaveBeenCalled()
    expect(api.getPulseDrawerState().applyModes).toContain('replace_selection')

    previewMarkdown.value = 'Alpha beta, clarified.'
    await flushUi()
    api.applyPulseMode('replace_selection')
    await flushUi()

    expect((harness.root.querySelector('.ProseMirror')?.textContent ?? '')).toContain('clarified')

    harness.app.unmount()
  })

  it('closes on Escape, supports send to Second Brain, and cancels when closing while running', async () => {
    const harness = mountHarness()
    await flushUi()

    openPulseFromEditorHarness(harness.editorRef)
    await flushUi()

    previewMarkdown.value = 'Alpha beta gamma.'
    await flushUi()
    const api = exposedPulseApi(harness.editorRef)
    api.applyPulseMode('send_to_second_brain')
    await flushUi()
    expect(harness.onPulseOpenSecondBrain).toHaveBeenCalledTimes(1)

    openPulseFromEditorHarness(harness.editorRef)
    await flushUi()

    running.value = true
    await flushUi()
    api.closePulsePanel()
    await flushUi()

    expect(cancelMock).toHaveBeenCalled()
    expect(api.getPulseDrawerState().open).toBe(false)

    harness.app.unmount()
  })
})
