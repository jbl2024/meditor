import { nextTick, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/vue-3'

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
const extractSelectionClipboardPayloadMock = vi.fn<
  (root: HTMLElement) => { plain: string; html: string; markdown: string } | null
>(() => null)
const writeSelectionPayloadToClipboardMock = vi.fn<(payload: unknown, format: unknown) => Promise<void>>(async () => {})

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

vi.mock('../lib/editorClipboard', () => ({
  extractSelectionClipboardPayload: (root: HTMLElement) => extractSelectionClipboardPayloadMock(root),
  writeSelectionPayloadToClipboard: (payload: unknown, format: unknown) => writeSelectionPayloadToClipboardMock(payload, format)
}))

const spellcheckSuggestionsMock = vi.fn(async (_language: string, _word: string) => ['world'])
const spellcheckWordHitMock = vi.fn((_state: unknown, _pos: number) => ({ from: 2, to: 6, word: 'wrld', language: 'en' as const }))

vi.mock('../lib/tiptap/extensions/Spellcheck', () => ({
  getSpellcheckSuggestions: (language: string, word: string) => spellcheckSuggestionsMock(language, word),
  getSpellcheckWordHitAtPos: (state: unknown, pos: number) => spellcheckWordHitMock(state, pos),
  normalizeSpellcheckToken: (value: string) => String(value ?? '').toLowerCase(),
  rankSpellcheckSuggestions: (_original: string, suggestions: string[]) =>
    suggestions.map((suggestion, index) => ({ suggestion, confidence: 1 - index * 0.1 })),
  resolveSpellcheckSuggestionPresentation: () => ({
    mode: 'single' as const,
    primarySuggestion: 'world',
    confidence: 0.99
  }),
  applySpellcheckSuggestionCase: (_original: string, suggestion: string) => suggestion
}))

import { useEditorChromeRuntime } from './useEditorChromeRuntime'

async function flushUi() {
  await nextTick()
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

function createEditorStub(selection = { from: 1, to: 2, empty: false }, text = 'Alpha') {
  const insertContentAt = vi.fn(() => ({ run: vi.fn(() => true) }))
  const insertContent = vi.fn(() => ({ run: vi.fn(() => true) }))
  const paragraph = {
    type: { name: 'paragraph' },
    nodeSize: 4,
    attrs: {},
    textContent: text
  }
  const normalizedSelection = {
    ...selection,
    $from: {
      depth: 1,
      parent: paragraph,
      before: () => 1,
      node: (depth: number) => (depth === 1 ? paragraph : { type: { name: 'doc' } })
    }
  }
  return {
    isFocused: false,
    commands: {
      focus: vi.fn(),
      setMeta: vi.fn(),
      insertContentAt
    },
    state: {
      selection: normalizedSelection,
      tr: {
        setMeta: vi.fn(() => ({}))
      },
      doc: {
        textBetween: vi.fn(() => text),
        nodeAt: vi.fn(() => paragraph),
        forEach: vi.fn((cb: (node: unknown, offset: number) => void) => {
          cb(paragraph, 1)
        })
      }
    },
    view: {
      dom: document.createElement('div'),
      hasFocus: vi.fn(() => false),
      coordsAtPos: vi.fn((pos: number) => {
        if (pos === selection.from) return { left: 100, right: 120, top: 80 }
        return { left: 200, right: 250, top: 84 }
      }),
      posAtCoords: vi.fn(() => ({ pos: 2 })),
      dispatch: vi.fn(),
      nodeDOM: vi.fn(() => document.createElement('p'))
    },
    isActive: vi.fn(() => false),
    getText: vi.fn(() => text),
    chain: vi.fn(() => ({
      focus: vi.fn(() => ({
        setTextSelection: vi.fn(() => ({
          insertContent
        }))
      }))
    })),
    __test: {
      insertContent
    }
  } as unknown as Editor & { __test: { insertContent: ReturnType<typeof vi.fn> } }
}

function createClipboardEvent() {
  const event = new Event('copy', { bubbles: true }) as ClipboardEvent
  Object.defineProperty(event, 'preventDefault', {
    configurable: true,
    value: vi.fn()
  })
  Object.defineProperty(event, 'stopPropagation', {
    configurable: true,
    value: vi.fn()
  })
  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: { setData: vi.fn() }
  })
  return event
}

function createRuntimeHarness(input?: {
  activeEditor?: Ref<Editor | null>
  currentPath?: string
}) {
  const activeEditor = input?.activeEditor ?? (ref<Editor | null>(createEditorStub()) as Ref<Editor | null>)
  const currentPath = ref(input?.currentPath ?? 'a.md')
  const holder = ref(document.createElement('div'))
  const contentShell = ref(document.createElement('div'))
  const pulsePanelWrap = ref(document.createElement('div'))
  document.body.appendChild(holder.value)
  document.body.appendChild(contentShell.value)
  document.body.appendChild(pulsePanelWrap.value)
  const interactionMocks = {
    closeSlashMenu: vi.fn(),
    dismissSlashMenu: vi.fn(),
    closeWikilinkMenu: vi.fn(),
    openSlashAtSelection: vi.fn(),
    onEditorKeydown: vi.fn(),
    onEditorKeyup: vi.fn(),
    onEditorContextMenu: vi.fn(),
    onEditorPaste: vi.fn(),
    markEditorInteraction: vi.fn(),
    resetWikilinkDataCache: vi.fn(),
    addIgnoredWord: vi.fn(),
    refreshSpellcheckForPath: vi.fn()
  }
  const emitPulseOpenSecondBrain = vi.fn()
  const runtime = useEditorChromeRuntime({
    chromeHostPort: {
      holder,
      contentShell,
      pulsePanelWrap,
      currentPath,
      getCurrentPath: () => currentPath.value,
      getEditor: () => activeEditor.value,
      getSession: vi.fn(() => null)
    },
    chromeInteractionPort: {
      menus: {
        closeSlashMenu: interactionMocks.closeSlashMenu,
        dismissSlashMenu: interactionMocks.dismissSlashMenu,
        closeWikilinkMenu: interactionMocks.closeWikilinkMenu,
        openSlashAtSelection: interactionMocks.openSlashAtSelection
      },
      editorEvents: {
        onEditorKeydown: interactionMocks.onEditorKeydown,
        onEditorKeyup: interactionMocks.onEditorKeyup,
        onEditorContextMenu: interactionMocks.onEditorContextMenu,
        onEditorPaste: interactionMocks.onEditorPaste,
        markEditorInteraction: interactionMocks.markEditorInteraction
      },
      caches: {
        resetWikilinkDataCache: interactionMocks.resetWikilinkDataCache
      },
      spellcheck: {
        addIgnoredWord: interactionMocks.addIgnoredWord,
        refreshForPath: interactionMocks.refreshSpellcheckForPath
      }
    },
    chromeOutputPort: {
      emitPulseOpenSecondBrain
    }
  })

  return {
    runtime,
    activeEditor,
    currentPath,
    holder,
    contentShell,
    pulsePanelWrap,
    interactionMocks,
    emitPulseOpenSecondBrain
  }
}

describe('useEditorChromeRuntime', () => {
  beforeEach(() => {
    vi.useRealTimers()
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
    extractSelectionClipboardPayloadMock.mockReset()
    writeSelectionPayloadToClipboardMock.mockReset()
    spellcheckSuggestionsMock.mockClear()
    spellcheckWordHitMock.mockClear()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('delegates focus to the active editor', () => {
    const { runtime, activeEditor } = createRuntimeHarness()

    runtime.layout.focusEditor()

    expect(activeEditor.value?.commands.focus).toHaveBeenCalled()
  })

  it('opens a spellcheck suggestion menu on misspelled word contextmenu and can ignore the word', async () => {
    const { runtime, activeEditor, interactionMocks, holder } = createRuntimeHarness()
    const editor = activeEditor.value as ReturnType<typeof createEditorStub>
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 32, clientY: 48 })

    runtime.layout.focusEditor()
    activeEditor.value = editor
    await runtime.dialogsAndLifecycle.onMountInit()
    holder.value.dispatchEvent(event)
    await flushUi()

    expect(event.defaultPrevented).toBe(true)
    expect(spellcheckWordHitMock).toHaveBeenCalled()
    expect(runtime.spellcheck.open.value).toBe(true)
    expect(runtime.spellcheck.word.value).toBe('wrld')
    if (runtime.spellcheck.mode.value === 'single') {
      expect(runtime.spellcheck.primarySuggestion.value).toBe('world')
    } else {
      expect(runtime.spellcheck.suggestions.value).toEqual(['world'])
    }

    runtime.spellcheck.ignoreWord()
    expect(interactionMocks.refreshSpellcheckForPath).toHaveBeenCalledWith('a.md')
    expect(runtime.spellcheck.open.value).toBe(false)

    runtime.spellcheck.open.value = true
    runtime.spellcheck.word.value = 'wrld'
    runtime.spellcheck.addToWorkspaceDictionary()
    expect(interactionMocks.addIgnoredWord).toHaveBeenCalledWith('wrld')
  })

  it('replaces the misspelled word range when a suggestion is selected', async () => {
    const { runtime, activeEditor } = createRuntimeHarness()
    const editor = activeEditor.value as ReturnType<typeof createEditorStub>
    const insertContentAt = vi.fn(() => ({ run: vi.fn(() => true) }))
    Object.assign(editor as any, {
      commands: {
      ...editor.commands,
      insertContentAt
      }
    })

    runtime.spellcheck.open.value = true
    runtime.spellcheck.range.value = { from: 10, to: 14 }
    runtime.spellcheck.selectSuggestion('word')

    expect(insertContentAt).toHaveBeenCalledWith({ from: 10, to: 14 }, 'word')
  })

  it('exposes selection-driven block gutter state', () => {
    const { runtime } = createRuntimeHarness()

    expect(runtime.blockAndTable.blockGutterVisible.value).toBe(false)
    runtime.blockAndTable.blockGutterTarget.value = {
      pos: 12,
      nodeType: 'paragraph',
      nodeSize: 4,
      canDelete: true,
      canConvert: true,
      text: 'Alpha'
    }
    runtime.blockAndTable.blockGutterAnchorRect.value = {
      left: 40,
      top: 64,
      width: 400,
      height: 24
    }
    runtime.blockAndTable.blockGutterContentFocused.value = true

    expect(runtime.blockAndTable.blockGutterVisible.value).toBe(true)
  })

  it('exposes loading overlay refs for document orchestration', () => {
    const { runtime } = createRuntimeHarness()

    expect(runtime.loading.loadUiState.isLoadingLargeDocument.value).toBe(false)
    runtime.loading.loadUiState.isLoadingLargeDocument.value = true
    runtime.loading.loadUiState.loadStageLabel.value = 'Parsing'

    expect(runtime.loading.loadUiState.loadStageLabel.value).toBe('Parsing')
  })

  it('resetTransientUiState closes menus, toolbars, and transient caches', async () => {
    const { runtime, interactionMocks } = createRuntimeHarness()
    runtime.blockAndTable.blockGutterTarget.value = {
      pos: 12,
      nodeType: 'paragraph',
      nodeSize: 4,
      canDelete: true,
      canConvert: true,
      text: 'Alpha'
    }
    runtime.blockAndTable.blockMenuTarget.value = {
      pos: 3,
      nodeType: 'heading',
      nodeSize: 4,
      canDelete: true,
      canConvert: true,
      text: 'Title'
    }
    runtime.toolbars.findToolbar.openToolbar()
    runtime.dialogsAndLifecycle.openMermaidPreview({
      svg: '<svg viewBox="0 0 10 10"></svg>',
      code: 'graph TD\nA-->B',
      templateId: 'flowchart'
    })
    runtime.dialogsAndLifecycle.openAssetPreview({
      src: 'assets/image.png',
      alt: 'Preview',
      title: 'Image',
      previewSrc: 'data:image/png;base64,ZmFrZQ=='
    })
    await flushUi()

    runtime.dialogsAndLifecycle.resetTransientUiState()

    expect(interactionMocks.dismissSlashMenu).toHaveBeenCalled()
    expect(interactionMocks.closeWikilinkMenu).toHaveBeenCalled()
    expect(interactionMocks.resetWikilinkDataCache).toHaveBeenCalled()
    expect(runtime.blockAndTable.blockMenuTarget.value).toBeNull()
    expect(runtime.blockAndTable.blockGutterTarget.value).toBeNull()
    expect(runtime.toolbars.findToolbar.open.value).toBe(false)
    expect(runtime.dialogsAndLifecycle.mermaidPreviewDialog.value.visible).toBe(false)
    expect(runtime.dialogsAndLifecycle.assetPreviewDialog.value.visible).toBe(false)
  })

  it('onHolderKeydown opens find on Cmd/Ctrl+F and otherwise delegates to editor input', async () => {
    const { runtime, holder, interactionMocks } = createRuntimeHarness()
    await runtime.dialogsAndLifecycle.onMountInit()

    holder.value?.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }))
    await flushUi()
    expect(runtime.toolbars.findToolbar.open.value).toBe(true)
    expect(interactionMocks.markEditorInteraction).toHaveBeenCalled()
    expect(interactionMocks.onEditorKeydown).not.toHaveBeenCalled()

    holder.value?.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))
    await flushUi()
    expect(interactionMocks.onEditorKeydown).toHaveBeenCalled()

    await runtime.dialogsAndLifecycle.onUnmountCleanup()
  })

  it('ignores title-field key events so header Enter does not route through body editor handlers', async () => {
    const { runtime, holder, interactionMocks } = createRuntimeHarness()
    await runtime.dialogsAndLifecycle.onMountInit()

    const title = document.createElement('div')
    title.className = 'editor-title-field'
    holder.value?.appendChild(title)

    title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    title.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))

    expect(interactionMocks.markEditorInteraction).not.toHaveBeenCalled()
    expect(interactionMocks.onEditorKeydown).not.toHaveBeenCalled()
    expect(interactionMocks.onEditorKeyup).not.toHaveBeenCalled()

    await runtime.dialogsAndLifecycle.onUnmountCleanup()
  })

  it('onHolderCopy is a safe no-op without payload and writes all clipboard formats when present', async () => {
    const { runtime, holder, interactionMocks } = createRuntimeHarness()
    await runtime.dialogsAndLifecycle.onMountInit()

    extractSelectionClipboardPayloadMock.mockReturnValueOnce(null)
    holder.value?.dispatchEvent(createClipboardEvent())
    expect(interactionMocks.markEditorInteraction).toHaveBeenCalled()

    const clipboardEvent = createClipboardEvent()
    extractSelectionClipboardPayloadMock.mockReturnValueOnce({
      plain: 'Plain',
      html: '<p>Plain</p>',
      markdown: '**Plain**'
    })
    holder.value?.dispatchEvent(clipboardEvent)

    expect(clipboardEvent.preventDefault).toHaveBeenCalled()
    expect(clipboardEvent.stopPropagation).toHaveBeenCalled()
    const clipboardData = clipboardEvent.clipboardData as unknown as { setData: ReturnType<typeof vi.fn> }
    expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', 'Plain')
    expect(clipboardData.setData).toHaveBeenCalledWith('text/html', '<p>Plain</p>')
    expect(clipboardData.setData).toHaveBeenCalledWith('text/markdown', '**Plain**')

    await runtime.dialogsAndLifecycle.onUnmountCleanup()
  })

  it('closePulsePanel cancels a running request and preserves the preview state', () => {
    const { runtime } = createRuntimeHarness()
    runtime.pulse.pulseOpen.value = true
    previewMarkdown.value = 'Draft'
    running.value = true

    runtime.pulse.closePulsePanel()

    expect(cancelMock).toHaveBeenCalled()
    expect(runtime.pulse.pulseOpen.value).toBe(false)
    expect(previewMarkdown.value).toBe('Draft')
  })

  it('replaces the selection with interpreted markdown blocks instead of raw markdown text', () => {
    const editor = createEditorStub()
    const { runtime } = createRuntimeHarness({ activeEditor: ref<Editor | null>(editor) as Ref<Editor | null> })

    previewMarkdown.value = '# Title\n\n- Item\n\n**Bold**'
    runtime.pulse.pulseSelectionRange.value = { from: 10, to: 20 }
    runtime.pulse.pulseOpen.value = true

    runtime.pulse.replaceSelectionWithPulseOutput()

    const insertContent = (editor as Editor & { __test: { insertContent: ReturnType<typeof vi.fn> } }).__test.insertContent
    expect(insertContent).toHaveBeenCalledTimes(1)
    const inserted = insertContent.mock.calls[0]?.[0]
    expect(Array.isArray(inserted)).toBe(true)
    expect(inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'heading' }),
        expect.objectContaining({ type: 'bulletList' }),
        expect.objectContaining({
          type: 'paragraph',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: 'Bold'
            })
          ])
        })
      ])
    )
    expect(inserted).not.toContain('# Title\n\n- Item\n\n**Bold**')
    expect(runtime.pulse.pulseOpen.value).toBe(false)
  })

  it('inserts interpreted markdown below the selection instead of raw markdown text', () => {
    const editor = createEditorStub()
    const { runtime } = createRuntimeHarness({ activeEditor: ref<Editor | null>(editor) as Ref<Editor | null> })

    previewMarkdown.value = '## Follow up\n\n- Item'
    runtime.pulse.pulseSelectionRange.value = { from: 10, to: 20 }
    runtime.pulse.pulseOpen.value = true

    runtime.pulse.insertPulseBelow()

    const insertContent = (editor as Editor & { __test: { insertContent: ReturnType<typeof vi.fn> } }).__test.insertContent
    expect(insertContent).toHaveBeenCalledTimes(1)
    const inserted = insertContent.mock.calls[0]?.[0]
    expect(Array.isArray(inserted)).toBe(true)
    expect(inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'heading' }),
        expect.objectContaining({ type: 'bulletList' })
      ])
    )
    expect(inserted).not.toContain('## Follow up\n\n- Item')
    expect(runtime.pulse.pulseOpen.value).toBe(false)
  })

  it('openPulseForSelection ignores missing or empty selections and initializes pulse state when valid', () => {
    const inactive = createRuntimeHarness({ activeEditor: ref<Editor | null>(null) as Ref<Editor | null> })
    inactive.runtime.pulse.openPulseForSelection()
    expect(inactive.runtime.pulse.pulseOpen.value).toBe(false)

    const emptySelectionEditor = ref<Editor | null>(createEditorStub({ from: 1, to: 1, empty: true })) as Ref<Editor | null>
    const emptySelection = createRuntimeHarness({ activeEditor: emptySelectionEditor })
    emptySelection.runtime.pulse.openPulseForSelection()
    expect(emptySelection.runtime.pulse.pulseOpen.value).toBe(false)

    const valid = createRuntimeHarness()
    valid.runtime.pulse.openPulseForSelection()
    expect(valid.runtime.pulse.pulseOpen.value).toBe(true)
    expect(valid.runtime.pulse.pulseSourceKind.value).toBe('editor_selection')
    expect(valid.runtime.pulse.pulseSelectionRange.value).toEqual({ from: 1, to: 2 })
    expect(valid.runtime.pulse.pulseSourceText.value).toBe('Alpha')
  })

  it('reopens Pulse with the existing draft when the same selection is opened again', () => {
    const harness = createRuntimeHarness()
    harness.runtime.pulse.pulseActionId.value = 'condense'
    harness.runtime.pulse.pulseInstruction.value = 'Keep the same draft.'
    previewMarkdown.value = 'Existing draft'
    harness.runtime.pulse.pulseSourceKind.value = 'editor_selection'
    harness.runtime.pulse.pulseSelectionRange.value = { from: 1, to: 2 }
    harness.runtime.pulse.pulseSourceText.value = 'Alpha'

    harness.runtime.pulse.closePulsePanel()
    harness.runtime.pulse.openPulseForSelection()

    expect(harness.runtime.pulse.pulseOpen.value).toBe(true)
    expect(harness.runtime.pulse.pulseActionId.value).toBe('condense')
    expect(harness.runtime.pulse.pulseInstruction.value).toBe('Keep the same draft.')
    expect(previewMarkdown.value).toBe('Existing draft')
    expect(harness.runtime.pulse.pulseSelectionRange.value).toEqual({ from: 1, to: 2 })
  })

  it('syncPulseSelectionFromEditor switches an open note session to the live selection', () => {
    const harness = createRuntimeHarness()
    harness.runtime.pulse.openPulseForNote()
    previewMarkdown.value = 'Existing note preview'

    harness.runtime.toolbars.syncPulseSelectionFromEditor()

    expect(harness.runtime.pulse.pulseSourceKind.value).toBe('editor_selection')
    expect(harness.runtime.pulse.pulseSelectionRange.value).toEqual({ from: 1, to: 2 })
    expect(harness.runtime.pulse.pulseSourceText.value).toBe('Alpha')
    expect(previewMarkdown.value).toBe('')
  })

  it('refreshes an open note Pulse source when the active session changes', () => {
    const harness = createRuntimeHarness({
      activeEditor: ref<Editor | null>(createEditorStub({ from: 1, to: 1, empty: true }, 'Alpha note')) as Ref<Editor | null>
    })
    harness.runtime.pulse.openPulseForNote()
    harness.runtime.pulse.pulseActionId.value = 'format'
    harness.runtime.pulse.pulseInstruction.value = 'Keep this draft instruction.'
    previewMarkdown.value = 'Existing note preview'

    harness.activeEditor.value = createEditorStub({ from: 1, to: 1, empty: true }, 'Beta note')
    harness.currentPath.value = 'b.md'
    harness.runtime.toolbars.onActiveSessionChanged()

    expect(harness.runtime.pulse.pulseSourceKind.value).toBe('editor_note')
    expect(harness.runtime.pulse.pulseContextPaths.value).toEqual(['b.md'])
    expect(harness.runtime.pulse.pulseSourceText.value).toBe('Beta note')
    expect(harness.runtime.pulse.pulseActionId.value).toBe('format')
    expect(harness.runtime.pulse.pulseInstruction.value).toBe('Keep this draft instruction.')
    expect(previewMarkdown.value).toBe('')
  })

  it('switches an open note Pulse source to the new tab selection on active session change', () => {
    const harness = createRuntimeHarness({
      activeEditor: ref<Editor | null>(createEditorStub({ from: 1, to: 1, empty: true }, 'Alpha note')) as Ref<Editor | null>
    })
    harness.runtime.pulse.openPulseForNote()
    previewMarkdown.value = 'Existing note preview'

    harness.activeEditor.value = createEditorStub({ from: 1, to: 5, empty: false }, 'Beta selection')
    harness.currentPath.value = 'b.md'
    harness.runtime.toolbars.onActiveSessionChanged()

    expect(harness.runtime.pulse.pulseSourceKind.value).toBe('editor_selection')
    expect(harness.runtime.pulse.pulseContextPaths.value).toEqual([])
    expect(harness.runtime.pulse.pulseSelectionRange.value).toEqual({ from: 1, to: 5 })
    expect(harness.runtime.pulse.pulseSourceText.value).toBe('Beta selection')
    expect(previewMarkdown.value).toBe('')
  })

  it('refreshes the inline toolbar position when the holder scrolls', () => {
    const harness = createRuntimeHarness()
    harness.runtime.toolbars.inlineFormatToolbar.updateFormattingToolbar()
    const initialTop = harness.runtime.toolbars.inlineFormatToolbar.formatToolbarTop.value

    harness.holder.value.scrollTop = 40
    harness.runtime.layout.onHolderScroll()

    expect(harness.runtime.toolbars.inlineFormatToolbar.formatToolbarTop.value).toBe(initialTop + 40)
  })

  it('sendPulseContextToSecondBrain emits and closes Pulse, but ignores note mode without currentPath', () => {
    const noPath = createRuntimeHarness({ currentPath: '' })
    noPath.runtime.pulse.pulseOpen.value = true
    noPath.runtime.pulse.pulseSourceKind.value = 'editor_note'
    noPath.runtime.pulse.sendPulseContextToSecondBrain()
    expect(noPath.emitPulseOpenSecondBrain).not.toHaveBeenCalled()
    expect(noPath.runtime.pulse.pulseOpen.value).toBe(true)

    const valid = createRuntimeHarness()
    valid.runtime.pulse.pulseOpen.value = true
    valid.runtime.pulse.pulseSourceKind.value = 'editor_note'
    valid.runtime.pulse.openPulseForNote()
    valid.runtime.pulse.pulseSourceText.value = 'Alpha'
    valid.runtime.pulse.sendPulseContextToSecondBrain()
    expect(valid.emitPulseOpenSecondBrain).toHaveBeenCalledWith({
      contextPaths: ['a.md'],
      prompt: expect.stringContaining('Source material:')
    })
    expect(valid.runtime.pulse.pulseOpen.value).toBe(false)
  })

  it('mount and unmount lifecycle bind listeners and resolve pending mermaid confirmations', async () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
    const holder = document.createElement('div')
    const holderAddEventListenerSpy = vi.spyOn(holder, 'addEventListener')
    const holderRemoveEventListenerSpy = vi.spyOn(holder, 'removeEventListener')
    const harness = createRuntimeHarness()
    harness.holder.value = holder
    let resolved = false
    harness.runtime.dialogsAndLifecycle.mermaidReplaceDialog.value.resolve = (approved) => {
      resolved = approved
    }

    await harness.runtime.dialogsAndLifecycle.onMountInit()
    await harness.runtime.dialogsAndLifecycle.onUnmountCleanup()

    expect(holderAddEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function), true)
    expect(holderRemoveEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function), true)
    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    expect(resolved).toBe(false)
  })

  it('does not bind document mousedown after unmount when teardown happens before the RAF callback', async () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
    const cancelAnimationFrameSpy = vi.fn()
    let scheduledFrame: FrameRequestCallback | null = null

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      scheduledFrame = callback
      return 42
    })
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy)

    const harness = createRuntimeHarness()
    const mountPromise = harness.runtime.dialogsAndLifecycle.onMountInit()
    await nextTick()
    await harness.runtime.dialogsAndLifecycle.onUnmountCleanup()
    const mousedownAddsBeforeFrame = addEventListenerSpy.mock.calls.filter(([name]) => name === 'mousedown').length

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(42)
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function), true)

    const frame = scheduledFrame as FrameRequestCallback | null
    if (frame) {
      frame(0)
    }
    await mountPromise

    const mousedownAdds = addEventListenerSpy.mock.calls.filter(([name]) => name === 'mousedown')
    expect(mousedownAdds).toHaveLength(mousedownAddsBeforeFrame)
  })

  it('drops stale pending mousedown binds when a newer mount sequence supersedes the older one', async () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    const frameCallbacks: FrameRequestCallback[] = []

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const harness = createRuntimeHarness()
    const firstMount = harness.runtime.dialogsAndLifecycle.onMountInit()
    await nextTick()
    const secondMount = harness.runtime.dialogsAndLifecycle.onMountInit()
    await nextTick()

    expect(frameCallbacks).toHaveLength(2)
    const mousedownAddsBeforeFrames = addEventListenerSpy.mock.calls.filter(([name]) => name === 'mousedown').length

    frameCallbacks[0]?.(0)
    await firstMount
    expect(addEventListenerSpy.mock.calls.filter(([name]) => name === 'mousedown')).toHaveLength(mousedownAddsBeforeFrames)

    frameCallbacks[1]?.(0)
    await secondMount
    expect(addEventListenerSpy.mock.calls.filter(([name]) => name === 'mousedown')).toHaveLength(mousedownAddsBeforeFrames + 1)
  })
})
