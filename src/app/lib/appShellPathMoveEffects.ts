import type { Ref } from 'vue'
import type { PathMove } from '../../shared/api/apiTypes'
import { rewritePathWithMoves, sortPathMoves } from './pathMoves'

/**
 * Module: appShellPathMoveEffects
 *
 * Purpose:
 * - Host the shell's local path-move patching logic outside `App.vue`.
 *
 * Boundaries:
 * - Callers provide the mutable app state to patch.
 * - This module only applies the already-resolved move batches.
 */

type VirtualDoc = {
  content: string
  titleLine: string
}

type LocalMoveStatePort = {
  multiPane: { replacePath: (from: string, to: string) => void }
  documentHistory: { replacePath: (from: string, to: string) => void }
  editorState: { movePath: (from: string, to: string) => void }
  renameLaunchpadRecentNote: (from: string, to: string) => void
  virtualDocs: Ref<Record<string, VirtualDoc>>
  backlinks: Ref<string[]>
}

type DeferredMoveStatePort = LocalMoveStatePort & {
  replaceWorkspaceFilePath: (from: string, to: string) => void
}

function updateVirtualDocs(virtualDocs: Ref<Record<string, VirtualDoc>>, from: string, to: string) {
  if (!virtualDocs.value[from]) return
  const nextVirtual = { ...virtualDocs.value }
  nextVirtual[to] = nextVirtual[from]
  delete nextVirtual[from]
  virtualDocs.value = nextVirtual
}

/** Applies immediate local shell patches for the resolved path move batch. */
export function applyImmediatePathMovesLocally(
  port: LocalMoveStatePort,
  moves: PathMove[],
  expandedMarkdownMoves: PathMove[]
) {
  const normalizedMoves = sortPathMoves(moves)
  if (!normalizedMoves.length) return

  for (const move of expandedMarkdownMoves) {
    port.multiPane.replacePath(move.from, move.to)
    port.documentHistory.replacePath(move.from, move.to)
    port.editorState.movePath(move.from, move.to)
    port.renameLaunchpadRecentNote(move.from, move.to)
    updateVirtualDocs(port.virtualDocs, move.from, move.to)
  }

  port.backlinks.value = port.backlinks.value.map((path) => rewritePathWithMoves(path, normalizedMoves))
}

/** Applies deferred workspace-wide shell patches after move reconciliation completes. */
export function applyDeferredPathMovesLocally(
  port: DeferredMoveStatePort,
  moves: PathMove[],
  expandedMarkdownMoves: PathMove[]
) {
  const normalizedMoves = sortPathMoves(moves)
  if (!normalizedMoves.length) return

  for (const move of normalizedMoves) {
    port.replaceWorkspaceFilePath(move.from, move.to)
  }

  for (const move of expandedMarkdownMoves) {
    port.multiPane.replacePath(move.from, move.to)
    port.documentHistory.replacePath(move.from, move.to)
    port.editorState.movePath(move.from, move.to)
    port.renameLaunchpadRecentNote(move.from, move.to)
    updateVirtualDocs(port.virtualDocs, move.from, move.to)
  }
}
