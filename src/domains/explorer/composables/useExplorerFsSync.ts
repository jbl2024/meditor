import { listenWorkspaceFsChanged, pathExists } from '../../../shared/api/workspaceApi'
import type { TreeNode, WorkspaceFsChange, WorkspaceFsChangedPayload } from '../../../shared/api/apiTypes'
import { normalizeWorkspacePath } from '../lib/workspacePaths'
import { planWorkspaceFsActions } from '../components/workspaceFsPlanner'

/** Declares dependencies required to sync loaded explorer state with FS events. */
export type UseExplorerFsSyncOptions = {
  folderPath: { value: string }
  childrenByDir: { value: Record<string, TreeNode[]> }
  nodeByPath: { value: Record<string, TreeNode> }
  parentByPath: { value: Record<string, string> }
  expandedPaths: { value: Set<string> }
  focusedPath: { value: string }
  selectionPaths: { value: string[] }
  setSelection: (paths: string[]) => void
  emitSelection: (paths: string[]) => void
  loadChildren: (dirPath: string) => Promise<void>
  clearPendingReloadDirs: () => void
  listenWorkspaceFsChanged: typeof listenWorkspaceFsChanged
}

/**
 * Owns explorer filesystem watcher orchestration, event batching, cache prune,
 * and incremental reload scheduling for loaded directories.
 */
export function useExplorerFsSync(options: UseExplorerFsSyncOptions) {
  let pendingWorkspaceChanges: WorkspaceFsChange[] = []
  let workspaceChangeFlushTimer: number | null = null
  let latestWatcherSessionId = 0
  let unlistenWorkspaceFsChanged: (() => void) | null = null

  function workspaceRootMatches(rootPath: string): boolean {
    const folder = normalizeWorkspacePath(options.folderPath.value)
    if (!folder) return false
    return normalizeWorkspacePath(rootPath) === folder
  }

  function removePathFromCaches(path: string) {
    const normalizedPath = normalizeWorkspacePath(path)
    const descendants = Object.keys(options.nodeByPath.value).filter(
      (candidate) => candidate === normalizedPath || candidate.startsWith(`${normalizedPath}/`)
    )

    for (const candidate of descendants) {
      delete options.nodeByPath.value[candidate]
      delete options.parentByPath.value[candidate]
      delete options.childrenByDir.value[candidate]
    }

    for (const dirPath of Object.keys(options.childrenByDir.value)) {
      const currentChildren = options.childrenByDir.value[dirPath] ?? []
      const filteredChildren = currentChildren.filter(
        (node) => node.path !== normalizedPath && !node.path.startsWith(`${normalizedPath}/`)
      )
      if (filteredChildren.length !== currentChildren.length) {
        options.childrenByDir.value[dirPath] = filteredChildren
      }
    }

    options.expandedPaths.value = new Set(
      Array.from(options.expandedPaths.value).filter(
        (candidate) => candidate !== normalizedPath && !candidate.startsWith(`${normalizedPath}/`)
      )
    )

    const nextSelection = options.selectionPaths.value.filter(
      (selected) => selected !== normalizedPath && !selected.startsWith(`${normalizedPath}/`)
    )
    if (nextSelection.length !== options.selectionPaths.value.length) {
      options.setSelection(nextSelection)
      options.emitSelection(nextSelection)
    }

    if (
      options.focusedPath.value === normalizedPath ||
      options.focusedPath.value.startsWith(`${normalizedPath}/`)
    ) {
      options.focusedPath.value = ''
    }
  }

  async function refreshLoadedDirs() {
    if (!options.folderPath.value) return

    const dirs = new Set<string>([options.folderPath.value, ...Object.keys(options.childrenByDir.value)])
    for (const dir of dirs) {
      try {
        await options.loadChildren(dir)
      } catch {
        try {
          const exists = await pathExists(dir)
          if (!exists) {
            removePathFromCaches(dir)
          }
        } catch {
          // Skip transient refresh errors.
        }
      }
    }
  }

  async function refreshSpecificDirs(dirs: Iterable<string>) {
    if (!options.folderPath.value) return

    const loaded = new Set(Object.keys(options.childrenByDir.value))
    for (const dir of dirs) {
      if (dir !== options.folderPath.value && !loaded.has(dir)) {
        continue
      }

      try {
        await options.loadChildren(dir)
      } catch {
        try {
          const exists = await pathExists(dir)
          if (!exists) {
            removePathFromCaches(dir)
          }
        } catch {
          // Skip transient refresh errors.
        }
      }
    }
  }

  function queueWorkspaceChanges(sessionId: number, changes: WorkspaceFsChange[]) {
    if (!options.folderPath.value || !changes.length) return
    if (sessionId < latestWatcherSessionId) return
    latestWatcherSessionId = sessionId

    pendingWorkspaceChanges.push(...changes)
    if (workspaceChangeFlushTimer !== null) return

    workspaceChangeFlushTimer = window.setTimeout(() => {
      workspaceChangeFlushTimer = null
      void flushWorkspaceChanges()
    }, 120)
  }

  async function flushWorkspaceChanges() {
    if (!options.folderPath.value || !pendingWorkspaceChanges.length) return

    const changes = pendingWorkspaceChanges
    pendingWorkspaceChanges = []

    const loaded = new Set(Object.keys(options.childrenByDir.value))
    const plan = planWorkspaceFsActions(options.folderPath.value, loaded, changes)

    for (const removedPath of plan.pathsToPrune) {
      removePathFromCaches(removedPath)
    }

    await refreshSpecificDirs(plan.dirsToRefresh)
  }

  function handleWorkspaceFsPayload(payload: WorkspaceFsChangedPayload) {
    if (!workspaceRootMatches(payload.root)) return
    queueWorkspaceChanges(payload.session_id, payload.changes)
  }

  function start() {
    void options.listenWorkspaceFsChanged(handleWorkspaceFsPayload).then((unlisten) => {
      unlistenWorkspaceFsChanged = unlisten
    })
  }

  function stop() {
    if (workspaceChangeFlushTimer !== null) {
      window.clearTimeout(workspaceChangeFlushTimer)
      workspaceChangeFlushTimer = null
    }
    pendingWorkspaceChanges = []
    options.clearPendingReloadDirs()
    if (unlistenWorkspaceFsChanged) {
      unlistenWorkspaceFsChanged()
      unlistenWorkspaceFsChanged = null
    }
  }

  function resetWatcherSession() {
    pendingWorkspaceChanges = []
    latestWatcherSessionId = 0
  }

  return {
    refreshLoadedDirs,
    refreshSpecificDirs,
    removePathFromCaches,
    queueWorkspaceChanges,
    flushWorkspaceChanges,
    handleWorkspaceFsPayload,
    start,
    stop,
    resetWatcherSession
  }
}
