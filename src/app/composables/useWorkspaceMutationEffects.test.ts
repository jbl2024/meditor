import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { FavoriteEntry, PathMove } from '../../shared/api/apiTypes'
import { useWorkspaceMutationEffects } from './useWorkspaceMutationEffects'
import { rewritePathWithMoves } from '../lib/pathMoves'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve()
  }
}

function createEffects() {
  const workingFolderPath = ref('/vault')
  const allWorkspaceFiles = ref([
    '/vault/journal/2026-03-06.md',
    '/vault/journal/2026-03-07.md',
    '/vault/notes/a.md'
  ])
  const favoriteItems = ref<FavoriteEntry[]>([
    { path: '/vault/journal/2026-03-06.md', added_at_ms: 1, exists: true }
  ])
  const filesystemErrorMessage = ref('')
  const getImmediatePathCandidates = vi.fn(() => ['/vault/journal/2026-03-06.md', '/vault/notes/a.md'])
  const applyImmediateLocalPathMoves = vi.fn()
  const applyDeferredLocalPathMoves = vi.fn((moves: PathMove[]) => {
    allWorkspaceFiles.value = allWorkspaceFiles.value.map((path) => rewritePathWithMoves(path, moves))
  })
  const renameFavorite = vi.fn(async () => {})
  const updateWikilinksForRename = vi.fn(async () => ({ updated_files: 2 }))
  const updateWikilinksForPathMoves = vi.fn(async () => ({
    updated_files: 3,
    reindexed_files: 4,
    moved_markdown_files: 2,
    expanded_markdown_moves: [
      {
        from: '/vault/journal/2026-03-06.md',
        to: '/vault/archive/journal/2026-03-06.md'
      },
      {
        from: '/vault/journal/2026-03-07.md',
        to: '/vault/archive/journal/2026-03-07.md'
      }
      ]
    }))
  const moveNoteHistoryEntries = vi.fn(async () => {})
  const runWorkspaceMutation = vi.fn(async (task: () => Promise<unknown>) => {
    await task()
  })
  const bumpEchoesRefreshToken = vi.fn()

  return {
    workingFolderPath,
    allWorkspaceFiles,
    favoriteItems,
    filesystemErrorMessage,
    getImmediatePathCandidates,
    applyImmediateLocalPathMoves,
    applyDeferredLocalPathMoves,
    renameFavorite,
    updateWikilinksForRename,
    updateWikilinksForPathMoves,
    moveNoteHistoryEntries,
    runWorkspaceMutation,
    bumpEchoesRefreshToken,
    effects: useWorkspaceMutationEffects({
      workingFolderPath,
      allWorkspaceFiles,
      favoriteItems,
      filesystemErrorMessage,
      getImmediatePathCandidates,
      applyImmediateLocalPathMoves,
      applyDeferredLocalPathMoves,
      renameFavorite,
      updateWikilinksForRename,
      updateWikilinksForPathMoves,
      moveNoteHistoryEntries,
      runWorkspaceMutation,
      bumpEchoesRefreshToken
    })
  }
}

describe('useWorkspaceMutationEffects', () => {
  it('applies the immediate rename patch before the backend mutation starts', async () => {
    const ctx = createEffects()
    const order: string[] = []

    ctx.applyImmediateLocalPathMoves.mockImplementation(() => {
      order.push('immediate')
    })
    ctx.runWorkspaceMutation.mockImplementation(async (task: () => Promise<unknown>) => {
      order.push('mutation')
      await task()
    })

    await ctx.effects.handlePathRenamed({ from: '/vault/notes/a.md', to: '/vault/notes/b.md' })

    expect(order[0]).toBe('immediate')
    expect(order).toContain('mutation')
  })

  it('moves note history entries after a rename completes', async () => {
    const ctx = createEffects()

    await ctx.effects.handlePathRenamed({ from: '/vault/notes/a.md', to: '/vault/notes/b.md' })

    expect(ctx.moveNoteHistoryEntries).toHaveBeenCalledWith([
      { from: '/vault/notes/a.md', to: '/vault/notes/b.md' }
    ])
  })

  it('uses only immediate path candidates for the hot-path move expansion', async () => {
    const ctx = createEffects()
    const moves: PathMove[] = [{ from: '/vault/journal', to: '/vault/archive/journal' }]

    await ctx.effects.handlePathsMoved(moves)

    expect(ctx.getImmediatePathCandidates).toHaveBeenCalledOnce()
    expect(ctx.applyImmediateLocalPathMoves).toHaveBeenCalledWith(
      moves,
      [
        {
          from: '/vault/journal/2026-03-06.md',
          to: '/vault/archive/journal/2026-03-06.md'
        }
      ]
    )
    expect(ctx.applyDeferredLocalPathMoves).toHaveBeenCalledWith(
      moves,
      [
        {
          from: '/vault/journal/2026-03-06.md',
          to: '/vault/archive/journal/2026-03-06.md'
        },
        {
          from: '/vault/journal/2026-03-07.md',
          to: '/vault/archive/journal/2026-03-07.md'
        }
      ]
    )
    expect(ctx.moveNoteHistoryEntries).toHaveBeenCalledWith([
      {
        from: '/vault/journal/2026-03-06.md',
        to: '/vault/archive/journal/2026-03-06.md'
      },
      {
        from: '/vault/journal/2026-03-07.md',
        to: '/vault/archive/journal/2026-03-07.md'
      }
    ])
  })

  it('does nothing for an empty move batch', async () => {
    const ctx = createEffects()

    await ctx.effects.handlePathsMoved([])

    expect(ctx.applyImmediateLocalPathMoves).not.toHaveBeenCalled()
    expect(ctx.runWorkspaceMutation).not.toHaveBeenCalled()
    expect(ctx.bumpEchoesRefreshToken).not.toHaveBeenCalled()
  })

  it('serializes rapid successive move batches instead of overlapping them', async () => {
    const ctx = createEffects()
    const first = deferred<void>()
    const second = deferred<void>()
    const callOrder: string[] = []

    ctx.runWorkspaceMutation
      .mockImplementationOnce(async (task: () => Promise<unknown>) => {
        callOrder.push('run-1:start')
        await task()
        await first.promise
        callOrder.push('run-1:end')
      })
      .mockImplementationOnce(async (task: () => Promise<unknown>) => {
        callOrder.push('run-2:start')
        await task()
        await second.promise
        callOrder.push('run-2:end')
      })

    const firstMove = ctx.effects.handlePathsMoved([{ from: '/vault/notes/a.md', to: '/vault/notes/b.md' }])
    const secondMove = ctx.effects.handlePathsMoved([{ from: '/vault/notes/b.md', to: '/vault/notes/c.md' }])
    await flushMicrotasks()

    expect(ctx.updateWikilinksForPathMoves).toHaveBeenCalledTimes(1)
    first.resolve()
    await firstMove
    await flushMicrotasks()
    expect(ctx.updateWikilinksForPathMoves).toHaveBeenCalledTimes(2)

    second.resolve()
    await secondMove

    expect(callOrder).toEqual([
      'run-1:start',
      'run-1:end',
      'run-2:start',
      'run-2:end'
    ])
  })

  it('applies deferred workspace-wide sync after the backend mutation result arrives', async () => {
    const ctx = createEffects()
    const order: string[] = []

    ctx.applyImmediateLocalPathMoves.mockImplementation(() => {
      order.push('immediate')
    })
    ctx.updateWikilinksForPathMoves.mockImplementation(async () => {
      order.push('backend')
      return {
        updated_files: 1,
        reindexed_files: 1,
        moved_markdown_files: 1,
        expanded_markdown_moves: [{ from: '/vault/notes/a.md', to: '/vault/notes/b.md' }]
      }
    })
    ctx.applyDeferredLocalPathMoves.mockImplementation(() => {
      order.push('deferred')
    })

    await ctx.effects.handlePathsMoved([{ from: '/vault/notes/a.md', to: '/vault/notes/b.md' }])

    expect(order).toEqual(['immediate', 'backend', 'deferred'])
    expect(ctx.bumpEchoesRefreshToken).toHaveBeenCalledOnce()
  })

  it('keeps the mutation pipeline running when favorite updates fail', async () => {
    const ctx = createEffects()
    ctx.renameFavorite.mockRejectedValueOnce(new Error('favorite failed'))

    await ctx.effects.handlePathsMoved([{ from: '/vault/journal', to: '/vault/archive/journal' }])

    expect(ctx.filesystemErrorMessage.value).toBe('favorite failed')
    expect(ctx.updateWikilinksForPathMoves).toHaveBeenCalledOnce()
    expect(ctx.applyDeferredLocalPathMoves).toHaveBeenCalledOnce()
  })

  it('keeps the mutation pipeline running when note history migration fails', async () => {
    const ctx = createEffects()
    ctx.moveNoteHistoryEntries.mockRejectedValueOnce(new Error('history failed'))

    await ctx.effects.handlePathsMoved([{ from: '/vault/journal', to: '/vault/archive/journal' }])

    expect(ctx.filesystemErrorMessage.value).toBe('history failed')
    expect(ctx.updateWikilinksForPathMoves).toHaveBeenCalledOnce()
    expect(ctx.applyDeferredLocalPathMoves).toHaveBeenCalledOnce()
  })

  it('does not rewrite closed-note state during the immediate phase', async () => {
    const ctx = createEffects()

    await ctx.effects.handlePathsMoved([{ from: '/vault/journal', to: '/vault/archive/journal' }])

    expect(ctx.applyImmediateLocalPathMoves).toHaveBeenCalledWith(
      [{ from: '/vault/journal', to: '/vault/archive/journal' }],
      [{ from: '/vault/journal/2026-03-06.md', to: '/vault/archive/journal/2026-03-06.md' }]
    )
    expect(ctx.allWorkspaceFiles.value).toContain('/vault/archive/journal/2026-03-07.md')
  })
})
