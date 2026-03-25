import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppNotePersistence } from './useAppNotePersistence'

const editorSyncApi = vi.hoisted(() => ({
  readNoteSnapshot: vi.fn(),
  saveNoteBuffer: vi.fn()
}))

vi.mock('../../shared/api/editorSyncApi', () => editorSyncApi)

function createOptions() {
  const workingFolderPath = ref('/vault')
  const virtualDocs = ref<Record<string, { content: string; titleLine: string }>>({})
  const allWorkspaceFiles = ref<string[]>(['/vault/seed.md'])
  const workspaceMutationEchoesToken = ref(0)
  const ensureParentFolders = vi.fn(async () => {})
  const refreshActiveFileMetadata = vi.fn(async () => {})
  const upsertWorkspaceFilePath = vi.fn()
  const loadAllFiles = vi.fn(async () => {})
  const enqueueMarkdownReindex = vi.fn()
  const pathExists = vi.fn(async (_path: string) => false)
  const renameEntry = vi.fn(async (path: string, nextName: string) => `${path.replace(/\/[^/]+$/, '')}/${nextName}`)

  return {
    options: {
      workingFolderPath,
      virtualDocs,
      allWorkspaceFiles,
      workspaceMutationEchoesToken,
      ensureParentFolders,
      refreshActiveFileMetadata,
      upsertWorkspaceFilePath,
      loadAllFiles,
      enqueueMarkdownReindex,
      pathExists: pathExists as unknown as (path: string) => Promise<boolean>,
      renameEntry
    },
    spies: {
      ensureParentFolders,
      refreshActiveFileMetadata,
      upsertWorkspaceFilePath,
      loadAllFiles,
      enqueueMarkdownReindex,
      pathExists,
      renameEntry
    },
    refs: {
      workingFolderPath,
      virtualDocs,
      allWorkspaceFiles,
      workspaceMutationEchoesToken
    }
  }
}

describe('useAppNotePersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    editorSyncApi.readNoteSnapshot.mockResolvedValue({
      path: '/vault/notes/a.md',
      content: '# A',
      version: { mtimeMs: 1, size: 2 }
    })
    editorSyncApi.saveNoteBuffer.mockResolvedValue({
      ok: true,
      version: { mtimeMs: 2, size: 3 }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the virtual buffer for an unsaved note snapshot', async () => {
    const { options, refs } = createOptions()
    refs.virtualDocs.value['/vault/notes/a.md'] = {
      content: '# Unsaved',
      titleLine: '# Unsaved'
    }

    const persistence = useAppNotePersistence(options)
    const snapshot = await persistence.readNoteSnapshot('/vault/notes/a.md')

    expect(snapshot).toEqual({
      path: '/vault/notes/a.md',
      content: '# Unsaved',
      version: null
    })
    expect(editorSyncApi.readNoteSnapshot).not.toHaveBeenCalled()
  })

  it('chooses a unique filename when renaming a missing note', async () => {
    const { options, spies } = createOptions()
    spies.pathExists.mockImplementation(async (path: string) => {
      if (path === '/vault/notes/a.md') return false
      if (path === '/vault/notes/Idea.md') return true
      return false
    })

    const persistence = useAppNotePersistence(options)
    const result = await persistence.renameFileFromTitle('/vault/notes/a.md', 'Idea')

    expect(result).toEqual({
      path: '/vault/notes/Idea (1).md',
      title: 'Idea (1)'
    })
    expect(spies.renameEntry).not.toHaveBeenCalled()
  })

  it('short-circuits title-only virtual saves and preserves the base version', async () => {
    const { options, refs } = createOptions()
    refs.virtualDocs.value['/vault/notes/a.md'] = {
      content: '# A',
      titleLine: '# A'
    }

    const persistence = useAppNotePersistence(options)
    const result = await persistence.saveNoteBuffer('/vault/notes/a.md', '# A', {
      explicit: false,
      expectedBaseVersion: { mtimeMs: 3, size: 4 }
    })

    expect(result).toEqual({
      ok: true,
      version: { mtimeMs: 3, size: 4 }
    })
    expect(editorSyncApi.saveNoteBuffer).not.toHaveBeenCalled()
    expect(options.ensureParentFolders).not.toHaveBeenCalled()
  })

  it('persists a new note and refreshes shell state after success', async () => {
    const { options, refs } = createOptions()

    const persistence = useAppNotePersistence(options)
    const result = await persistence.saveNoteBuffer('/vault/notes/a.md', '# Body', {
      explicit: true,
      expectedBaseVersion: null
    })

    expect(result).toEqual({
      ok: true,
      version: { mtimeMs: 2, size: 3 }
    })
    expect(editorSyncApi.saveNoteBuffer).toHaveBeenCalledWith(expect.objectContaining({
      path: '/vault/notes/a.md',
      content: '# Body',
      expectedBaseVersion: null,
      force: undefined
    }))
    expect(options.ensureParentFolders).toHaveBeenCalledWith('/vault/notes/a.md')
    expect(options.refreshActiveFileMetadata).toHaveBeenCalledWith('/vault/notes/a.md')
    expect(options.upsertWorkspaceFilePath).toHaveBeenCalledWith('/vault/notes/a.md')
    expect(options.enqueueMarkdownReindex).toHaveBeenCalledWith('/vault/notes/a.md')
    expect(options.loadAllFiles).toHaveBeenCalledTimes(1)
    expect(refs.workspaceMutationEchoesToken.value).toBe(1)
  })
})
