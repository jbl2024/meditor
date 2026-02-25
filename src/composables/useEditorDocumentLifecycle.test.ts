import type { OutputBlockData } from '@editorjs/editorjs'
import { describe, expect, it, vi } from 'vitest'
import { useEditorDocumentLifecycle } from './useEditorDocumentLifecycle'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

async function flushAsyncTicks(rounds = 4) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve()
  }
}

function createLifecycle(overrides: Partial<Parameters<typeof useEditorDocumentLifecycle>[0]> = {}) {
  const ensureEditor = vi.fn(async () => {})
  const ensurePropertySchemaLoaded = vi.fn(async () => {})
  const hasActiveEditor = vi.fn(() => true)
  const clearAutosaveTimer = vi.fn()
  const closeSlashMenu = vi.fn()
  const closeWikilinkMenu = vi.fn()
  const setSaveError = vi.fn()
  const openFile = vi.fn(async () => 'body')
  const parseAndStoreFrontmatter = vi.fn()
  const resolveEditorBody = vi.fn((_path: string, raw: string) => raw)
  const markdownToEditorData = vi.fn(() => ({
    version: '2.0.0',
    blocks: [{ id: 'b1', type: 'paragraph', data: { text: 'body' } }]
  }))
  const normalizeLoadedBlocks = vi.fn((blocks: OutputBlockData[]) => blocks)
  const setLoadedText = vi.fn()
  const setSuppressOnChange = vi.fn()
  const renderEditor = vi.fn(async () => {})
  const setDirty = vi.fn()
  const ensureCodeBlockUi = vi.fn()
  const nextUiTick = vi.fn(async () => {})
  const getRememberedScrollTop = vi.fn(() => undefined)
  const setEditorScrollTop = vi.fn()
  const restoreCaret = vi.fn(() => false)
  const focusFirstContentBlock = vi.fn(async () => {})
  const emitOutlineSoon = vi.fn()
  const flushUiFrame = vi.fn(async () => {})

  const options: Parameters<typeof useEditorDocumentLifecycle>[0] = {
    ensureEditor,
    ensurePropertySchemaLoaded,
    hasActiveEditor,
    clearAutosaveTimer,
    closeSlashMenu,
    closeWikilinkMenu,
    setSaveError,
    openFile,
    parseAndStoreFrontmatter,
    resolveEditorBody,
    markdownToEditorData,
    normalizeLoadedBlocks,
    setLoadedText,
    setSuppressOnChange,
    renderEditor,
    setDirty,
    ensureCodeBlockUi,
    nextUiTick,
    getRememberedScrollTop,
    setEditorScrollTop,
    restoreCaret,
    focusFirstContentBlock,
    emitOutlineSoon,
    flushUiFrame,
    ...overrides
  }

  return {
    api: useEditorDocumentLifecycle(options),
    options
  }
}

describe('useEditorDocumentLifecycle', () => {
  it('ignores stale load results when a newer request starts', async () => {
    const first = createDeferred<string>()

    const { api, options } = createLifecycle({
      openFile: vi.fn(async (path: string) => (path === 'notes/old.md' ? first.promise : 'new body'))
    })

    const p1 = api.loadCurrentFile('notes/old.md')
    const p2 = api.loadCurrentFile('notes/new.md')

    await p2

    first.resolve('old body')
    await p1

    expect(options.setLoadedText).toHaveBeenCalledTimes(1)
    expect(options.setLoadedText).toHaveBeenCalledWith('notes/new.md', 'new body')
    expect(options.renderEditor).toHaveBeenCalledTimes(1)
  })

  it('shows and resets large-document overlay state around load', async () => {
    const openDeferred = createDeferred<string>()
    const { api, options } = createLifecycle({
      largeDocumentThreshold: 10,
      openFile: vi.fn(async () => openDeferred.promise),
      resolveEditorBody: vi.fn(() => 'line1\nline2\nline3\nline4')
    })

    const pending = api.loadCurrentFile('notes/large.md')
    await flushAsyncTicks()
    expect(api.isLoadingLargeDocument.value).toBe(true)
    expect(api.loadStageLabel.value).toBe('Reading file...')
    expect(api.loadProgressIndeterminate.value).toBe(true)

    openDeferred.resolve('01234567890')
    await pending

    expect(options.flushUiFrame).toHaveBeenCalledTimes(4)
    expect(api.isLoadingLargeDocument.value).toBe(false)
    expect(api.loadStageLabel.value).toBe('')
    expect(api.loadProgressPercent.value).toBe(0)
    expect(api.loadDocumentStats.value).toBeNull()
  })

  it('normalizes parsed blocks before rendering', async () => {
    const parsedBlocks = [{ id: 'x', type: 'paragraph', data: { text: 'x' } }]
    const normalizedBlocks = [{ id: 'v', type: 'header', data: { text: 'Title', level: 1 } }]
    const { api, options } = createLifecycle({
      markdownToEditorData: vi.fn(() => ({ version: '2.0.0', blocks: parsedBlocks })),
      normalizeLoadedBlocks: vi.fn(() => normalizedBlocks as unknown as OutputBlockData[])
    })

    await api.loadCurrentFile('notes/a.md')

    expect(options.normalizeLoadedBlocks).toHaveBeenCalledWith(parsedBlocks, 'notes/a.md')
    expect(options.renderEditor).toHaveBeenCalledWith({
      version: '2.0.0',
      blocks: normalizedBlocks
    })
  })

  it('restores remembered scroll and avoids focus fallback when scroll exists', async () => {
    const { api, options } = createLifecycle({
      getRememberedScrollTop: vi.fn(() => 120),
      restoreCaret: vi.fn(() => false)
    })

    await api.loadCurrentFile('notes/a.md')

    expect(options.setEditorScrollTop).toHaveBeenCalledWith(120)
    expect(options.focusFirstContentBlock).not.toHaveBeenCalled()
  })

  it('focuses first content block when caret is not restorable and no scroll is remembered', async () => {
    const { api, options } = createLifecycle({
      getRememberedScrollTop: vi.fn(() => undefined),
      restoreCaret: vi.fn(() => false)
    })

    await api.loadCurrentFile('notes/a.md')

    expect(options.setEditorScrollTop).toHaveBeenCalledWith(0)
    expect(options.focusFirstContentBlock).toHaveBeenCalledTimes(1)
  })
})
