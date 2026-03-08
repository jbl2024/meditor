import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useFavoritesController } from './useFavoritesController'

describe('useFavoritesController', () => {
  it('loads and sorts favorites alphabetically', async () => {
    const api = useFavoritesController({
      workingFolderPath: ref('/vault'),
      listFavorites: vi.fn(async () => [
        { path: 'zeta.md', added_at_ms: 2, exists: true },
        { path: 'Alpha.md', added_at_ms: 1, exists: true }
      ]),
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
      renameFavorite: vi.fn()
    })

    await api.loadFavorites()

    expect(api.items.value.map((item) => item.path)).toEqual(['/vault/Alpha.md', '/vault/zeta.md'])
  })

  it('supports add, remove, rename, and missing synchronization', async () => {
    const addFavorite = vi.fn(async (path: string) => ({ path, added_at_ms: 5, exists: true }))
    const removeFavorite = vi.fn(async () => {})
    const renameFavorite = vi.fn(async () => {})
    const api = useFavoritesController({
      workingFolderPath: ref('/vault'),
      listFavorites: vi.fn(async () => [{ path: 'notes/a.md', added_at_ms: 1, exists: true }]),
      addFavorite,
      removeFavorite,
      renameFavorite
    })

    await api.loadFavorites()
    expect(api.isFavorite('/vault/notes/a.md')).toBe(true)

    await api.addFavorite('/vault/notes/b.md')
    expect(api.items.value.map((item) => item.path)).toEqual(['/vault/notes/a.md', '/vault/notes/b.md'])

    api.applyWorkspaceFsChanges([{ kind: 'removed', path: '/vault/notes/a.md' }])
    expect(api.items.value.find((item) => item.path === '/vault/notes/a.md')?.exists).toBe(false)

    await api.renameFavorite('/vault/notes/b.md', '/vault/notes/c.md')
    expect(renameFavorite).toHaveBeenCalledWith('/vault/notes/b.md', '/vault/notes/c.md')
    expect(api.isFavorite('/vault/notes/c.md')).toBe(true)

    await api.removeFavorite('/vault/notes/a.md')
    expect(removeFavorite).toHaveBeenCalledWith('/vault/notes/a.md')
    expect(api.isFavorite('/vault/notes/a.md')).toBe(false)
  })
})
