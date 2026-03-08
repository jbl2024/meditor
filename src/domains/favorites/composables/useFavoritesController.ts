import { computed, ref, type Ref } from 'vue'
import type { FavoriteEntry, WorkspaceFsChange } from '../../../shared/api/apiTypes'
import { toWorkspaceAbsolutePath, toWorkspacePathKey } from '../../explorer/lib/workspacePaths'

/**
 * Module: useFavoritesController
 *
 * Purpose:
 * - Own workspace-scoped favorites state and keep it synchronized with Tauri persistence.
 */

/** Services required to load and mutate workspace favorites. */
export type UseFavoritesControllerOptions = {
  workingFolderPath: Readonly<Ref<string>>
  listFavorites: () => Promise<FavoriteEntry[]>
  addFavorite: (path: string) => Promise<FavoriteEntry>
  removeFavorite: (path: string) => Promise<void>
  renameFavorite: (oldPath: string, newPath: string) => Promise<void>
}

/**
 * Manages favorites list state, existence markers, and filesystem synchronization.
 */
export function useFavoritesController(options: UseFavoritesControllerOptions) {
  const items = ref<FavoriteEntry[]>([])
  const loading = ref(false)

  const sortedItems = computed(() =>
    [...items.value].sort((left, right) =>
      left.path.localeCompare(right.path, undefined, { sensitivity: 'accent' })
    )
  )

  function reset() {
    items.value = []
    loading.value = false
  }

  function toAbsoluteEntry(entry: FavoriteEntry): FavoriteEntry {
    return {
      ...entry,
      path: toWorkspaceAbsolutePath(options.workingFolderPath.value, entry.path)
    }
  }

  function upsert(entry: FavoriteEntry) {
    const key = toWorkspacePathKey(entry.path)
    const next = items.value.filter((item) => toWorkspacePathKey(item.path) !== key)
    next.push(entry)
    items.value = next
  }

  function removeLocal(path: string) {
    const key = toWorkspacePathKey(path)
    items.value = items.value.filter((item) => toWorkspacePathKey(item.path) !== key)
  }

  function markMissing(path: string) {
    const key = toWorkspacePathKey(path)
    items.value = items.value.map((item) =>
      toWorkspacePathKey(item.path) === key ? { ...item, exists: false } : item
    )
  }

  function renameLocal(oldPath: string, newPath: string) {
    const oldKey = toWorkspacePathKey(oldPath)
    const existing = items.value.find((item) => toWorkspacePathKey(item.path) === oldKey)
    if (!existing) return
    const withoutOld = items.value.filter((item) => toWorkspacePathKey(item.path) !== oldKey)
    const deduped = withoutOld.filter((item) => toWorkspacePathKey(item.path) !== toWorkspacePathKey(newPath))
    deduped.push({
      ...existing,
      path: newPath,
      exists: true
    })
    items.value = deduped
  }

  function isFavorite(path: string): boolean {
    const key = toWorkspacePathKey(path)
    return items.value.some((item) => toWorkspacePathKey(item.path) === key)
  }

  async function loadFavorites() {
    if (!options.workingFolderPath.value) {
      reset()
      return
    }

    loading.value = true
    try {
      items.value = (await options.listFavorites()).map(toAbsoluteEntry)
    } finally {
      loading.value = false
    }
  }

  async function add(path: string) {
    const entry = toAbsoluteEntry(await options.addFavorite(path))
    upsert(entry)
    return entry
  }

  async function remove(path: string) {
    await options.removeFavorite(path)
    removeLocal(path)
  }

  async function rename(oldPath: string, newPath: string) {
    if (!isFavorite(oldPath)) return
    await options.renameFavorite(oldPath, newPath)
    renameLocal(oldPath, newPath)
  }

  function applyWorkspaceFsChanges(changes: WorkspaceFsChange[]) {
    for (const change of changes) {
      if (change.kind === 'removed' && change.path) {
        markMissing(change.path)
        continue
      }

      if (change.kind === 'renamed') {
        if (change.old_path && change.new_path) {
          renameLocal(change.old_path, change.new_path)
        } else if (change.old_path) {
          markMissing(change.old_path)
        }
      }
    }
  }

  return {
    items: sortedItems,
    loading,
    reset,
    isFavorite,
    loadFavorites,
    addFavorite: add,
    removeFavorite: remove,
    renameFavorite: rename,
    applyWorkspaceFsChanges,
    markFavoriteMissing: markMissing
  }
}
