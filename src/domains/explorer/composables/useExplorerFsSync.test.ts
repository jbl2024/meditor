import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useExplorerFsSync } from './useExplorerFsSync'
import type { TreeNode, WorkspaceFsChangedPayload } from '../../../shared/api/apiTypes'

const pathExists = vi.fn<(path: string) => Promise<boolean>>(async () => true)

vi.mock('../../../shared/api/workspaceApi', () => ({
  pathExists: (path: string) => pathExists(path)
}))

function fileNode(path: string): TreeNode {
  return {
    name: path.split('/').pop() ?? path,
    path,
    is_dir: false,
    is_markdown: true,
    has_children: false
  }
}

describe('useExplorerFsSync', () => {
  afterEach(() => {
    vi.useRealTimers()
    pathExists.mockClear()
  })

  it('batches matching filesystem events and refreshes loaded parents', async () => {
    vi.useFakeTimers()
    const loadChildren = vi.fn(async () => {})
    const setSelection = vi.fn()
    const emitSelection = vi.fn()
    const unlisten = vi.fn()
    const listenWorkspaceFsChanged = vi.fn(async (handler: (payload: WorkspaceFsChangedPayload) => void) => {
      handler({
        session_id: 4,
        root: '/vault',
        changes: [{ kind: 'created', path: '/vault/notes/new.md', parent: '/vault/notes' }],
        ts_ms: 1
      })
      handler({
        session_id: 3,
        root: '/vault',
        changes: [{ kind: 'created', path: '/vault/ignored.md', parent: '/vault' }],
        ts_ms: 1
      })
      return unlisten
    })

    const sync = useExplorerFsSync({
      folderPath: ref('/vault'),
      childrenByDir: ref<Record<string, TreeNode[]>>({
        '/vault': [fileNode('/vault/a.md')],
        '/vault/notes': []
      }),
      nodeByPath: ref<Record<string, TreeNode>>({
        '/vault/a.md': fileNode('/vault/a.md')
      }),
      parentByPath: ref<Record<string, string>>({
        '/vault/a.md': '/vault'
      }),
      expandedPaths: ref(new Set<string>()),
      focusedPath: ref(''),
      selectionPaths: ref<string[]>([]),
      setSelection,
      emitSelection,
      loadChildren,
      clearPendingReloadDirs: vi.fn(),
      listenWorkspaceFsChanged
    })

    sync.start()
    await Promise.resolve()
    await vi.runAllTimersAsync()

    expect(loadChildren).toHaveBeenCalledWith('/vault')
    expect(loadChildren).toHaveBeenCalledWith('/vault/notes')
    expect(loadChildren).not.toHaveBeenCalledWith('/vault/ignored.md')
    sync.stop()
    expect(unlisten).toHaveBeenCalled()
  })

  it('prunes removed paths from caches and selection', () => {
    const setSelection = vi.fn()
    const emitSelection = vi.fn()
    const sync = useExplorerFsSync({
      folderPath: ref('/vault'),
      childrenByDir: ref<Record<string, TreeNode[]>>({
        '/vault': [fileNode('/vault/a.md'), fileNode('/vault/b.md')]
      }),
      nodeByPath: ref<Record<string, TreeNode>>({
        '/vault/a.md': fileNode('/vault/a.md'),
        '/vault/b.md': fileNode('/vault/b.md')
      }),
      parentByPath: ref<Record<string, string>>({
        '/vault/a.md': '/vault',
        '/vault/b.md': '/vault'
      }),
      expandedPaths: ref(new Set<string>(['/vault/a.md'])),
      focusedPath: ref('/vault/a.md'),
      selectionPaths: ref<string[]>(['/vault/a.md']),
      setSelection,
      emitSelection,
      loadChildren: vi.fn(async () => {}),
      clearPendingReloadDirs: vi.fn(),
      listenWorkspaceFsChanged: vi.fn(async () => vi.fn())
    })

    sync.removePathFromCaches('/vault/a.md')

    expect(setSelection).toHaveBeenCalledWith([])
    expect(emitSelection).toHaveBeenCalledWith([])
  })
})
