import { normalizeWorkspacePath } from '../../explorer/lib/workspacePaths'

/**
 * Workspace-scoped spellcheck ignore list persistence.
 *
 * Purpose:
 * - Keep per-workspace "personal dictionary" entries in browser storage.
 * - Provide a small, testable contract for editor spellcheck UI and plugins.
 *
 * Invariants:
 * - Entries are stored lowercase and deduplicated.
 * - Storage is namespaced by workspace root so separate vaults do not leak
 *   ignore decisions into each other.
 */
export type WorkspaceSpellcheckIgnoreEntry = string

const WORKSPACE_SPELLCHECK_IGNORE_STORAGE_PREFIX = 'tomosona:editor:spellcheck-ignore:'

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function normalizeWorkspaceSpellcheckWord(word: string): string {
  return String(word ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
}

export function workspaceSpellcheckIgnoreStorageKey(workspacePath: string): string {
  const normalized = normalizeWorkspacePath(workspacePath)
  return `${WORKSPACE_SPELLCHECK_IGNORE_STORAGE_PREFIX}${encodeURIComponent(normalized)}`
}

function sanitizeIgnoredWord(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = normalizeWorkspaceSpellcheckWord(value)
  return normalized ? normalized : null
}

export function readWorkspaceSpellcheckIgnoredWords(workspacePath: string): string[] {
  if (typeof window === 'undefined') return []
  const payload = safeJsonParse(window.localStorage.getItem(workspaceSpellcheckIgnoreStorageKey(workspacePath)))
  if (!Array.isArray(payload)) return []
  return Array.from(
    new Set(
      payload
        .map((item) => sanitizeIgnoredWord(item))
        .filter((item): item is string => Boolean(item))
    )
  )
}

export function writeWorkspaceSpellcheckIgnoredWords(workspacePath: string, words: string[]) {
  if (typeof window === 'undefined') return
  const normalized = Array.from(
    new Set(
      words
        .map((word) => sanitizeIgnoredWord(word))
        .filter((word): word is string => Boolean(word))
    )
  )
  window.localStorage.setItem(workspaceSpellcheckIgnoreStorageKey(workspacePath), JSON.stringify(normalized))
}

export function addWorkspaceSpellcheckIgnoredWord(workspacePath: string, word: string): string[] {
  const normalized = normalizeWorkspaceSpellcheckWord(word)
  if (!normalized) return readWorkspaceSpellcheckIgnoredWords(workspacePath)
  const next = readWorkspaceSpellcheckIgnoredWords(workspacePath)
  if (!next.includes(normalized)) {
    next.unshift(normalized)
    writeWorkspaceSpellcheckIgnoredWords(workspacePath, next)
  }
  return readWorkspaceSpellcheckIgnoredWords(workspacePath)
}

export function removeWorkspaceSpellcheckIgnoredWord(workspacePath: string, word: string): string[] {
  const target = normalizeWorkspaceSpellcheckWord(word)
  if (!target) return readWorkspaceSpellcheckIgnoredWords(workspacePath)
  const next = readWorkspaceSpellcheckIgnoredWords(workspacePath).filter((item) => item !== target)
  writeWorkspaceSpellcheckIgnoredWords(workspacePath, next)
  return next
}

export function clearWorkspaceSpellcheckIgnoredWords(workspacePath: string): string[] {
  writeWorkspaceSpellcheckIgnoredWords(workspacePath, [])
  return []
}
