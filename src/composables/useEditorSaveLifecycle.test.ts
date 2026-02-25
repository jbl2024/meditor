import type { OutputBlockData } from '@editorjs/editorjs'
import { describe, expect, it, vi } from 'vitest'
import { useEditorSaveLifecycle } from './useEditorSaveLifecycle'

type HarnessState = {
  currentPath: string
  loadedTextByPath: Record<string, string>
}

function createHarness(overrides: Partial<Parameters<typeof useEditorSaveLifecycle>[0]> = {}) {
  const state: HarnessState = {
    currentPath: 'notes/a.md',
    loadedTextByPath: { 'notes/a.md': '---\nfoo: bar\n---\nBODY' }
  }

  const setSaving = vi.fn()
  const setSaveError = vi.fn()
  const setDirty = vi.fn()
  const saveEditorData = vi.fn(async () => ({
    blocks: [{ id: 'b1', type: 'paragraph', data: { text: 'Body' } }] as OutputBlockData[]
  }))
  const resolveRequestedTitle = vi.fn(() => 'Title')
  const openFile = vi.fn(async () => state.loadedTextByPath[state.currentPath] ?? '')
  const renameFileFromTitle = vi.fn(async (path: string, _title: string) => ({ path, title: 'Title' }))
  const normalizeBlocksForTitle = vi.fn((blocks: OutputBlockData[]) => ({ blocks, changed: false }))
  const stripVirtualTitle = vi.fn((blocks: OutputBlockData[]) => blocks)
  const editorBlocksToMarkdown = vi.fn(() => 'BODY')
  const resolveFrontmatterYaml = vi.fn(() => 'foo: bar')
  const composeMarkdownDocument = vi.fn((body: string, yaml: string) => `---\n${yaml}\n---\n${body}`)
  const movePersistencePathState = vi.fn()
  const moveFrontmatterPathState = vi.fn()
  const emitPathRenamed = vi.fn()
  const renderBlocks = vi.fn(async () => {})
  const saveFile = vi.fn(async () => ({ persisted: true }))
  const setLoadedText = vi.fn((path: string, markdown: string) => {
    state.loadedTextByPath[path] = markdown
  })
  const deleteLoadedText = vi.fn((path: string) => {
    delete state.loadedTextByPath[path]
  })
  const parseAndStoreFrontmatter = vi.fn()
  const emitOutlineSoon = vi.fn()

  const options: Parameters<typeof useEditorSaveLifecycle>[0] = {
    getCurrentPath: () => state.currentPath,
    hasActiveEditor: () => true,
    isSavingPath: () => false,
    setSaving,
    setSaveError,
    setDirty,
    saveEditorData,
    resolveRequestedTitle,
    getLoadedText: (path: string) => state.loadedTextByPath[path] ?? '',
    openFile,
    renameFileFromTitle,
    normalizeBlocksForTitle,
    stripVirtualTitle,
    editorBlocksToMarkdown,
    resolveFrontmatterYaml,
    composeMarkdownDocument,
    movePersistencePathState,
    moveFrontmatterPathState,
    emitPathRenamed,
    renderBlocks,
    saveFile,
    setLoadedText,
    deleteLoadedText,
    parseAndStoreFrontmatter,
    emitOutlineSoon,
    ...overrides
  }

  return {
    state,
    api: useEditorSaveLifecycle(options),
    options
  }
}

describe('useEditorSaveLifecycle', () => {
  it('aborts save when on-disk content diverges from loaded snapshot', async () => {
    const { api, options } = createHarness({
      openFile: vi.fn(async () => 'DIFFERENT ON DISK')
    })

    await api.saveCurrentFile(true)

    expect(options.saveFile).not.toHaveBeenCalled()
    expect(options.setSaveError).toHaveBeenCalledWith(
      'notes/a.md',
      'File changed on disk. Reload before saving to avoid overwrite.'
    )
    expect(options.setSaving).toHaveBeenNthCalledWith(1, 'notes/a.md', true)
    expect(options.setSaving).toHaveBeenLastCalledWith('notes/a.md', false)
  })

  it('migrates path state and emits rename payload when title renames note', async () => {
    const { api, options } = createHarness({
      renameFileFromTitle: vi.fn(async () => ({ path: 'notes/renamed.md', title: 'Renamed' }))
    })

    await api.saveCurrentFile(true)

    expect(options.movePersistencePathState).toHaveBeenCalledWith('notes/a.md', 'notes/renamed.md')
    expect(options.moveFrontmatterPathState).toHaveBeenCalledWith('notes/a.md', 'notes/renamed.md')
    expect(options.emitPathRenamed).toHaveBeenCalledWith({ from: 'notes/a.md', to: 'notes/renamed.md', manual: true })
    expect(options.saveFile).toHaveBeenCalledWith('notes/renamed.md', '---\nfoo: bar\n---\nBODY', { explicit: true })
    expect(options.setLoadedText).toHaveBeenCalledWith('notes/renamed.md', '---\nfoo: bar\n---\nBODY')
    expect(options.deleteLoadedText).toHaveBeenCalledWith('notes/a.md')
  })

  it('skips write in autosave mode when content is unchanged', async () => {
    const { api, options } = createHarness()

    await api.saveCurrentFile(false)

    expect(options.saveFile).not.toHaveBeenCalled()
    expect(options.setDirty).toHaveBeenCalledWith('notes/a.md', false)
  })

  it('keeps document dirty when backend reports non-persisted save', async () => {
    const { api, options } = createHarness({
      saveFile: vi.fn(async () => ({ persisted: false }))
    })

    await api.saveCurrentFile(true)

    expect(options.setDirty).toHaveBeenCalledWith('notes/a.md', true)
    expect(options.setLoadedText).not.toHaveBeenCalled()
    expect(options.parseAndStoreFrontmatter).not.toHaveBeenCalled()
  })
})
