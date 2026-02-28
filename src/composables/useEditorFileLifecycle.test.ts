import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { EditorBlock } from '../lib/markdownBlocks'
import type { DocumentSession } from './useDocumentEditorSessions'
import { useEditorFileLifecycle, type UseEditorFileLifecycleOptions } from './useEditorFileLifecycle'

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

function createOptions(overrides: Partial<UseEditorFileLifecycleOptions> = {}) {
  const currentPath = ref('a.md')
  const holder = ref<HTMLDivElement | null>(document.createElement('div'))
  const activeEditor = {
    commands: {
      focus: vi.fn()
    }
  } as unknown as UseEditorFileLifecycleOptions['getEditor'] extends () => infer T ? T : never
  const sessions: Record<string, DocumentSession> = {
    'a.md': createSession('a.md')
  }

  const base: UseEditorFileLifecycleOptions = {
    currentPath,
    holder,
    getEditor: () => activeEditor,
    getSession: (path) => sessions[path] ?? null,
    ensureSession: (path) => {
      if (!sessions[path]) sessions[path] = createSession(path)
      return sessions[path]
    },
    ensurePropertySchemaLoaded: async () => {},
    openFile: vi.fn(async () => '# Title\n\nBody'),
    saveFile: vi.fn(async () => ({ persisted: true })),
    renameFileFromTitle: vi.fn(async (path, title) => ({ path, title })),
    parseAndStoreFrontmatter: vi.fn(),
    frontmatterByPath: ref({}),
    propertyEditorMode: ref<'structured' | 'raw'>('structured'),
    rawYamlByPath: ref({}),
    serializableFrontmatterFields: (fields) => fields,
    moveFrontmatterPathState: vi.fn(),
    renameSessionPath: vi.fn((from: string, to: string) => {
      const session = sessions[from]
      if (!session) return
      delete sessions[from]
      session.path = to
      sessions[to] = session
    }),
    moveLifecyclePathState: vi.fn(),
    emitPathRenamed: vi.fn(),
    clearAutosaveTimer: vi.fn(),
    clearOutlineTimer: vi.fn(),
    emitOutlineSoon: vi.fn(),
    resetTransientUiState: vi.fn(),
    countLines: (input) => input.split('\n').length,
    noteTitleFromPath: () => 'Title',
    readVirtualTitle: () => 'Title',
    blockTextCandidate: () => 'Title',
    withVirtualTitle: (blocks, _title) => ({ blocks, changed: false }),
    stripVirtualTitle: (blocks) => blocks,
    serializeCurrentDocBlocks: () => [{ id: 'b1', type: 'paragraph', data: { text: 'Body' } }] as EditorBlock[],
    renderBlocks: vi.fn(async () => {}),
    restoreCaret: vi.fn(() => false),
    setSuppressOnChange: vi.fn(),
    setDirty: vi.fn(),
    setSaving: vi.fn(),
    setSaveError: vi.fn(),
    updateGutterHitboxStyle: vi.fn(),
    syncWikilinkUiFromPluginState: vi.fn(),
    isCurrentRequest: vi.fn(() => true),
    largeDocThreshold: 50_000,
    ui: {
      isLoadingLargeDocument: ref(false),
      loadStageLabel: ref(''),
      loadProgressPercent: ref(0),
      loadProgressIndeterminate: ref(false),
      loadDocumentStats: ref(null)
    }
  }

  return {
    options: { ...base, ...overrides },
    sessions,
    currentPath
  }
}

describe('useEditorFileLifecycle', () => {
  it('drops stale load completion when request token changes before content apply', async () => {
    const openFileDeferred = deferred<string>()
    const isCurrentRequest = vi.fn((requestId: number) => requestId === 1)
    const { options } = createOptions({
      openFile: vi.fn(() => openFileDeferred.promise),
      isCurrentRequest
    })

    const lifecycle = useEditorFileLifecycle(options)
    const loadPromise = lifecycle.loadCurrentFile('a.md', { requestId: 1 })
    isCurrentRequest.mockImplementation((requestId: number) => requestId === 2)
    openFileDeferred.resolve('# Title\n\nBody')
    await loadPromise

    expect(options.parseAndStoreFrontmatter).not.toHaveBeenCalled()
    expect(options.setSuppressOnChange).not.toHaveBeenCalled()
  })

  it('renames path state before persisting when title-triggered rename occurs', async () => {
    const { options, sessions } = createOptions({
      renameFileFromTitle: vi.fn(async () => ({ path: 'b.md', title: 'Renamed' }))
    })
    sessions['a.md'].loadedText = 'saved-before'
    options.openFile = vi.fn(async () => 'saved-before')

    const lifecycle = useEditorFileLifecycle(options)
    await lifecycle.saveCurrentFile(false)

    expect(options.renameSessionPath).toHaveBeenCalledWith('a.md', 'b.md')
    expect(options.moveLifecyclePathState).toHaveBeenCalledWith('a.md', 'b.md')
    expect(options.moveFrontmatterPathState).toHaveBeenCalledWith('a.md', 'b.md')
    expect(options.emitPathRenamed).toHaveBeenCalledWith({ from: 'a.md', to: 'b.md', manual: false })
    expect(options.saveFile).toHaveBeenCalledWith('b.md', expect.any(String), { explicit: false })

    const renameOrder = (options.renameSessionPath as any).mock.invocationCallOrder[0]
    const saveOrder = (options.saveFile as any).mock.invocationCallOrder[0]
    expect(renameOrder).toBeLessThan(saveOrder)
  })

  it('reports save error and skips write when on-disk content changed', async () => {
    const { options, sessions } = createOptions()
    sessions['a.md'].loadedText = 'original'
    options.openFile = vi.fn(async () => 'external-change')

    const lifecycle = useEditorFileLifecycle(options)
    await lifecycle.saveCurrentFile(false)
    await nextTick()

    expect(options.saveFile).not.toHaveBeenCalled()
    expect(options.setSaveError).toHaveBeenCalledWith('a.md', 'File changed on disk. Reload before saving to avoid overwrite.')
    expect(options.setSaving).toHaveBeenCalledWith('a.md', false)
  })
})
