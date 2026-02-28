import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { EditorBlock } from '../lib/markdownBlocks'
import type { DocumentSession } from './useDocumentEditorSessions'
import {
  type EditorFileLifecycleDocumentPort,
  useEditorFileLifecycle,
  type EditorFileLifecycleIoPort,
  type EditorFileLifecycleRequestPort,
  type EditorFileLifecycleSessionPort,
  type EditorFileLifecycleUiPort,
  type UseEditorFileLifecycleOptions
} from './useEditorFileLifecycle'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function createSession(path: string): DocumentSession {
  return {
    path,
    editor: {
      commands: {
        setContent: vi.fn()
      }
    } as unknown as DocumentSession['editor'],
    loadedText: '',
    isLoaded: false,
    dirty: false,
    saving: false,
    saveError: '',
    scrollTop: 0,
    caret: null,
    autosaveTimer: null,
    outlineTimer: null
  }
}

type UseEditorFileLifecycleOverrides = {
  sessionPort?: Partial<EditorFileLifecycleSessionPort>
  documentPort?: Partial<EditorFileLifecycleDocumentPort>
  uiPort?: Partial<EditorFileLifecycleUiPort>
  ioPort?: Partial<EditorFileLifecycleIoPort>
  requestPort?: Partial<EditorFileLifecycleRequestPort>
}

function createOptions(overrides: UseEditorFileLifecycleOverrides = {}) {
  const currentPath = ref('a.md')
  const holder = ref<HTMLDivElement | null>(document.createElement('div'))
  const activeEditor = {
    commands: {
      focus: vi.fn()
    }
  } as unknown as DocumentSession['editor']
  const sessions: Record<string, DocumentSession> = {
    'a.md': createSession('a.md')
  }

  const sessionPort: EditorFileLifecycleSessionPort = {
    currentPath,
    holder,
    getEditor: () => activeEditor,
    getSession: (path) => sessions[path] ?? null,
    ensureSession: (path) => {
      if (!sessions[path]) sessions[path] = createSession(path)
      return sessions[path]
    },
    renameSessionPath: vi.fn((from: string, to: string) => {
      const session = sessions[from]
      if (!session) return
      delete sessions[from]
      session.path = to
      sessions[to] = session
    }),
    moveLifecyclePathState: vi.fn(),
    setSuppressOnChange: vi.fn(),
    restoreCaret: vi.fn(() => false),
    setDirty: vi.fn(),
    setSaving: vi.fn(),
    setSaveError: vi.fn()
  }

  const documentPort: EditorFileLifecycleDocumentPort = {
    ensurePropertySchemaLoaded: async () => {},
    parseAndStoreFrontmatter: vi.fn(),
    frontmatterByPath: ref({}),
    propertyEditorMode: ref<'structured' | 'raw'>('structured'),
    rawYamlByPath: ref({}),
    serializableFrontmatterFields: (fields) => fields,
    moveFrontmatterPathState: vi.fn(),
    countLines: (input) => input.split('\n').length,
    noteTitleFromPath: () => 'Title',
    readVirtualTitle: () => 'Title',
    blockTextCandidate: () => 'Title',
    withVirtualTitle: (blocks, _title) => ({ blocks, changed: false }),
    stripVirtualTitle: (blocks) => blocks,
    serializeCurrentDocBlocks: () => [{ id: 'b1', type: 'paragraph', data: { text: 'Body' } }] as EditorBlock[],
    renderBlocks: vi.fn(async () => {})
  }

  const uiPort: EditorFileLifecycleUiPort = {
    clearAutosaveTimer: vi.fn(),
    clearOutlineTimer: vi.fn(),
    emitOutlineSoon: vi.fn(),
    emitPathRenamed: vi.fn(),
    resetTransientUiState: vi.fn(),
    updateGutterHitboxStyle: vi.fn(),
    syncWikilinkUiFromPluginState: vi.fn(),
    largeDocThreshold: 50_000,
    ui: {
      isLoadingLargeDocument: ref(false),
      loadStageLabel: ref(''),
      loadProgressPercent: ref(0),
      loadProgressIndeterminate: ref(false),
      loadDocumentStats: ref(null)
    }
  }

  const ioPort: EditorFileLifecycleIoPort = {
    openFile: vi.fn(async () => '# Title\n\nBody'),
    saveFile: vi.fn(async () => ({ persisted: true })),
    renameFileFromTitle: vi.fn(async (path, title) => ({ path, title }))
  }

  const requestPort: EditorFileLifecycleRequestPort = {
    isCurrentRequest: vi.fn(() => true)
  }

  const base: UseEditorFileLifecycleOptions = {
    sessionPort,
    documentPort,
    uiPort,
    ioPort,
    requestPort
  }

  return {
    options: {
      ...base,
      sessionPort: { ...sessionPort, ...(overrides.sessionPort ?? {}) },
      documentPort: { ...documentPort, ...(overrides.documentPort ?? {}) },
      uiPort: { ...uiPort, ...(overrides.uiPort ?? {}) },
      ioPort: { ...ioPort, ...(overrides.ioPort ?? {}) },
      requestPort: { ...requestPort, ...(overrides.requestPort ?? {}) }
    },
    sessions,
    currentPath
  }
}

describe('useEditorFileLifecycle', () => {
  it('drops stale load completion when request token changes before content apply', async () => {
    const openFileDeferred = deferred<string>()
    const isCurrentRequest = vi.fn((requestId: number) => requestId === 1)
    const { options } = createOptions({
      ioPort: { openFile: vi.fn(() => openFileDeferred.promise) } as Partial<EditorFileLifecycleIoPort>,
      requestPort: { isCurrentRequest } as Partial<EditorFileLifecycleRequestPort>
    })

    const lifecycle = useEditorFileLifecycle(options)
    const loadPromise = lifecycle.loadCurrentFile('a.md', { requestId: 1 })
    isCurrentRequest.mockImplementation((requestId: number) => requestId === 2)
    openFileDeferred.resolve('# Title\n\nBody')
    await loadPromise

    expect(options.documentPort.parseAndStoreFrontmatter).not.toHaveBeenCalled()
    expect(options.sessionPort.setSuppressOnChange).not.toHaveBeenCalled()
  })

  it('renames path state before persisting when title-triggered rename occurs', async () => {
    const { options, sessions } = createOptions({
      ioPort: { renameFileFromTitle: vi.fn(async () => ({ path: 'b.md', title: 'Renamed' })) } as Partial<EditorFileLifecycleIoPort>
    })
    sessions['a.md'].loadedText = 'saved-before'
    options.ioPort.openFile = vi.fn(async () => 'saved-before')

    const lifecycle = useEditorFileLifecycle(options)
    await lifecycle.saveCurrentFile(false)

    expect(options.sessionPort.renameSessionPath).toHaveBeenCalledWith('a.md', 'b.md')
    expect(options.sessionPort.moveLifecyclePathState).toHaveBeenCalledWith('a.md', 'b.md')
    expect(options.documentPort.moveFrontmatterPathState).toHaveBeenCalledWith('a.md', 'b.md')
    expect(options.uiPort.emitPathRenamed).toHaveBeenCalledWith({ from: 'a.md', to: 'b.md', manual: false })
    expect(options.ioPort.saveFile).toHaveBeenCalledWith('b.md', expect.any(String), { explicit: false })

    const renameOrder = (options.sessionPort.renameSessionPath as any).mock.invocationCallOrder[0]
    const saveOrder = (options.ioPort.saveFile as any).mock.invocationCallOrder[0]
    expect(renameOrder).toBeLessThan(saveOrder)
  })

  it('reports save error and skips write when on-disk content changed', async () => {
    const { options, sessions } = createOptions()
    sessions['a.md'].loadedText = 'original'
    options.ioPort.openFile = vi.fn(async () => 'external-change')

    const lifecycle = useEditorFileLifecycle(options)
    await lifecycle.saveCurrentFile(false)
    await nextTick()

    expect(options.ioPort.saveFile).not.toHaveBeenCalled()
    expect(options.sessionPort.setSaveError).toHaveBeenCalledWith('a.md', 'File changed on disk. Reload before saving to avoid overwrite.')
    expect(options.sessionPort.setSaving).toHaveBeenCalledWith('a.md', false)
  })

  it('keeps large-doc overlay visible for minimum duration to avoid imperceptible flash', async () => {
    vi.useFakeTimers()
    const largeDoc = 'x'.repeat(60_000)
    const { options } = createOptions({
      ioPort: { openFile: vi.fn(async () => largeDoc) } as Partial<EditorFileLifecycleIoPort>,
      uiPort: { largeDocThreshold: 50_000 } as Partial<EditorFileLifecycleUiPort>
    })

    const lifecycle = useEditorFileLifecycle({
      ...options,
      minLargeDocOverlayVisibleMs: 1_000
    })
    const loadPromise = lifecycle.loadCurrentFile('a.md', { requestId: 1 })

    await vi.advanceTimersByTimeAsync(20)
    expect(options.uiPort.ui.isLoadingLargeDocument.value).toBe(true)

    await vi.advanceTimersByTimeAsync(400)
    expect(options.uiPort.ui.isLoadingLargeDocument.value).toBe(true)

    await vi.advanceTimersByTimeAsync(700)
    await loadPromise
    expect(options.uiPort.ui.isLoadingLargeDocument.value).toBe(false)
    vi.useRealTimers()
  })

  it('shows large-doc overlay when file length crosses configured threshold', async () => {
    vi.useFakeTimers()
    const mediumDoc = 'x'.repeat(42_428)
    const { options } = createOptions({
      ioPort: { openFile: vi.fn(async () => mediumDoc) } as Partial<EditorFileLifecycleIoPort>,
      uiPort: { largeDocThreshold: 40_000 } as Partial<EditorFileLifecycleUiPort>
    })

    const lifecycle = useEditorFileLifecycle(options)
    const loadPromise = lifecycle.loadCurrentFile('a.md', { requestId: 1 })
    await vi.advanceTimersByTimeAsync(20)

    expect(options.uiPort.ui.isLoadingLargeDocument.value).toBe(true)
    expect(options.uiPort.ui.loadStageLabel.value.length).toBeGreaterThan(0)

    await vi.runAllTimersAsync()
    await loadPromise
    vi.useRealTimers()
  })
})
