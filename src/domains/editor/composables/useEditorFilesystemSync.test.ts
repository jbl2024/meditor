import { describe, expect, it, vi } from 'vitest'
import type { DocumentSession } from './useDocumentEditorSessions'
import { useEditorFilesystemSync } from './useEditorFilesystemSync'

function createSession(path: string, overrides: Partial<DocumentSession> = {}): DocumentSession {
  return {
    path,
    editor: {} as any,
    loadedText: '',
    baseVersion: null,
    currentDiskVersion: null,
    conflict: null,
    isLoaded: true,
    dirty: false,
    saving: false,
    saveError: '',
    scrollTop: 0,
    caret: null,
    autosaveTimer: null,
    outlineTimer: null,
    ...overrides
  }
}

describe('useEditorFilesystemSync', () => {
  it('reloads a clean open note after an external modification', async () => {
    const session = createSession('a.md')
    const loadCurrentFile = vi.fn(async () => {})
    const emitExternalReload = vi.fn()

    const sync = useEditorFilesystemSync({
      getSession: (path) => (path === 'a.md' ? session : null),
      listPaths: () => ['a.md'],
      currentPath: () => 'a.md',
      renameSessionPath: vi.fn(),
      moveLifecyclePathState: vi.fn(),
      moveFrontmatterPathState: vi.fn(),
      moveTitlePathState: vi.fn(),
      setActiveSession: vi.fn(),
      nextRequestId: vi.fn(() => 7),
      loadCurrentFile,
      emitExternalReload
    })

    await sync.applyWorkspaceFsChanges([{ kind: 'modified', path: 'a.md', is_dir: false, version: { mtimeMs: 9, size: 12 } }])

    expect(session.currentDiskVersion).toEqual({ mtimeMs: 9, size: 12 })
    expect(loadCurrentFile).toHaveBeenCalledWith('a.md', { forceReload: true, requestId: 7 })
    expect(emitExternalReload).toHaveBeenCalledWith({ path: 'a.md' })
  })

  it('marks a dirty note conflicted instead of reloading it', async () => {
    const session = createSession('a.md', { dirty: true })
    const loadCurrentFile = vi.fn(async () => {})

    const sync = useEditorFilesystemSync({
      getSession: () => session,
      listPaths: () => ['a.md'],
      currentPath: () => 'a.md',
      renameSessionPath: vi.fn(),
      moveLifecyclePathState: vi.fn(),
      moveFrontmatterPathState: vi.fn(),
      moveTitlePathState: vi.fn(),
      setActiveSession: vi.fn(),
      nextRequestId: vi.fn(() => 1),
      loadCurrentFile,
      emitExternalReload: vi.fn()
    })

    await sync.applyWorkspaceFsChanges([{ kind: 'modified', path: 'a.md', is_dir: false, version: { mtimeMs: 4, size: 6 } }])

    expect(loadCurrentFile).not.toHaveBeenCalled()
    expect(session.conflict).toEqual({
      kind: 'modified',
      diskVersion: { mtimeMs: 4, size: 6 },
      detectedAt: expect.any(Number)
    })
  })

  it('does not reload a clean note again for a duplicate watcher version', async () => {
    const session = createSession('a.md', {
      baseVersion: { mtimeMs: 9, size: 12 },
      currentDiskVersion: { mtimeMs: 9, size: 12 }
    })
    const loadCurrentFile = vi.fn(async () => {})
    const emitExternalReload = vi.fn()

    const sync = useEditorFilesystemSync({
      getSession: (path) => (path === 'a.md' ? session : null),
      listPaths: () => ['a.md'],
      currentPath: () => 'a.md',
      renameSessionPath: vi.fn(),
      moveLifecyclePathState: vi.fn(),
      moveFrontmatterPathState: vi.fn(),
      moveTitlePathState: vi.fn(),
      setActiveSession: vi.fn(),
      nextRequestId: vi.fn(() => 8),
      loadCurrentFile,
      emitExternalReload
    })

    await sync.applyWorkspaceFsChanges([{ kind: 'modified', path: 'a.md', is_dir: false, version: { mtimeMs: 9, size: 12 } }])

    expect(loadCurrentFile).not.toHaveBeenCalled()
    expect(emitExternalReload).not.toHaveBeenCalled()
    expect(session.conflict).toBeNull()
  })

  it('ignores watcher changes for an in-flight manual rename save target', async () => {
    const session = createSession('b.md', { dirty: true, saving: true })
    const loadCurrentFile = vi.fn(async () => {})

    const sync = useEditorFilesystemSync({
      getSession: () => session,
      listPaths: () => ['b.md'],
      currentPath: () => 'b.md',
      renameSessionPath: vi.fn(),
      moveLifecyclePathState: vi.fn(),
      moveFrontmatterPathState: vi.fn(),
      moveTitlePathState: vi.fn(),
      setActiveSession: vi.fn(),
      nextRequestId: vi.fn(() => 1),
      loadCurrentFile,
      emitExternalReload: vi.fn(),
      shouldIgnoreOwnSaveWatcherChange: (path) => path === 'b.md'
    })

    await sync.applyWorkspaceFsChanges([{ kind: 'modified', path: 'b.md', is_dir: false, version: { mtimeMs: 5, size: 7 } }])

    expect(loadCurrentFile).not.toHaveBeenCalled()
    expect(session.currentDiskVersion).toBeNull()
    expect(session.conflict).toBeNull()
  })

  it('ignores watcher removal on the source path during an in-flight manual rename save', async () => {
    const session = createSession('a.md', { dirty: true, saving: true })

    const sync = useEditorFilesystemSync({
      getSession: () => session,
      listPaths: () => ['a.md'],
      currentPath: () => 'a.md',
      renameSessionPath: vi.fn(),
      moveLifecyclePathState: vi.fn(),
      moveFrontmatterPathState: vi.fn(),
      moveTitlePathState: vi.fn(),
      setActiveSession: vi.fn(),
      nextRequestId: vi.fn(() => 1),
      loadCurrentFile: vi.fn(async () => {}),
      emitExternalReload: vi.fn(),
      shouldIgnoreOwnSaveWatcherChange: (path) => path === 'a.md'
    })

    await sync.applyWorkspaceFsChanges([{ kind: 'removed', path: 'a.md', is_dir: false }])

    expect(session.currentDiskVersion).toBeNull()
    expect(session.conflict).toBeNull()
  })
})
