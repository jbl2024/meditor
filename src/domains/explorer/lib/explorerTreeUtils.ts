/**
 * Module: explorerTreeUtils
 *
 * Purpose:
 * - Centralize pure helpers shared by Explorer tree state, filesystem sync,
 *   and operations.
 *
 * Boundaries:
 * - These helpers never perform filesystem I/O.
 * - They normalize or inspect values used by Explorer workflows.
 */

import { normalizeWorkspacePath, toWorkspaceRelativePath } from './workspacePaths'

/** Options used when revealing a path in the rendered tree viewport. */
export type RevealPathOptions = {
  focusTree?: boolean
  behavior?: ScrollBehavior
}

/** Returns a UI-safe message extracted from an unknown thrown value. */
export function errorMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return null
}

/** Detects the current workspace conflict error contract returned by IPC. */
export function isConflictError(err: unknown): boolean {
  const message = errorMessage(err)
  return Boolean(message && /already exists/i.test(message))
}

/** Returns the normalized parent directory path for a workspace entry. */
export function getParentPath(path: string): string {
  const normalized = normalizeWorkspacePath(path)
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return path
  return normalized.slice(0, idx)
}

/** Lists ancestor directories that must be expanded to reveal a target path. */
export function getAncestorDirs(rootPath: string, path: string): string[] {
  const root = normalizeWorkspacePath(rootPath)
  const target = normalizeWorkspacePath(path)
  const relative = toWorkspaceRelativePath(root, target)
  if (!root || !target || relative === '.' || relative === target) return []
  const segments = relative.split('/').slice(0, -1)
  const dirs: string[] = []

  let current = root
  for (const segment of segments) {
    current = `${current}/${segment}`
    dirs.push(current)
  }
  return dirs
}

/** Escapes a path value for use inside a DOM attribute selector. */
export function escapeSelectorValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/["\\]/g, '\\$&')
}
