import { invoke } from '@tauri-apps/api/core'
import type { FavoriteEntry } from './apiTypes'

/**
 * Frontend IPC wrappers for favorites persistence. This module is transport-only.
 */

/** Lists persisted workspace favorites with their current existence state. */
export async function listFavorites(): Promise<FavoriteEntry[]> {
  return await invoke('list_favorites')
}

/** Adds a markdown note to workspace favorites. */
export async function addFavorite(path: string): Promise<FavoriteEntry> {
  return await invoke('add_favorite', { path })
}

/** Removes a favorite entry, including orphaned items. */
export async function removeFavorite(path: string): Promise<void> {
  await invoke('remove_favorite', { path })
}

/** Rewrites an existing favorite path after a note rename. */
export async function renameFavorite(oldPath: string, newPath: string): Promise<void> {
  await invoke('rename_favorite', { oldPath, newPath })
}
