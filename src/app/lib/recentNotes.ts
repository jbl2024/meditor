import { toWorkspacePathKey } from '../../domains/explorer/lib/workspacePaths'

export type RecentNoteItem = {
  path: string
  title: string
  lastViewedAtMs: number
}

const MAX_RECENT_NOTES = 7

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function sanitizeEntry(value: unknown): RecentNoteItem | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<RecentNoteItem>
  if (typeof entry.path !== 'string' || typeof entry.title !== 'string' || typeof entry.lastViewedAtMs !== 'number') {
    return null
  }
  const path = entry.path.trim()
  const title = entry.title.trim()
  if (!path || !title || !Number.isFinite(entry.lastViewedAtMs)) return null
  return {
    path,
    title,
    lastViewedAtMs: Math.max(0, Math.round(entry.lastViewedAtMs))
  }
}

/**
 * Module: recentNotes
 *
 * Purpose:
 * - Persist workspace-scoped "recently viewed" note history in localStorage.
 * - Keep note recency distinct from filesystem-derived "recently updated".
 *
 * Invariants:
 * - Entries are deduplicated by normalized path key.
 * - Reads sanitize corrupted/legacy payloads defensively.
 * - Callers scope storage keys per workspace root.
 */

/**
 * Reads and normalizes recent note entries from local storage.
 */
export function readRecentNotes(storageKey: string): RecentNoteItem[] {
  const payload = safeJsonParse(window.localStorage.getItem(storageKey))
  if (!Array.isArray(payload)) return []
  return payload
    .map((item) => sanitizeEntry(item))
    .filter((item): item is RecentNoteItem => Boolean(item))
    .sort((left, right) => right.lastViewedAtMs - left.lastViewedAtMs)
    .slice(0, MAX_RECENT_NOTES)
}

/**
 * Persists the provided recent note list after enforcing ordering and size.
 */
export function writeRecentNotes(storageKey: string, items: RecentNoteItem[]) {
  const normalized = items
    .map((item) => sanitizeEntry(item))
    .filter((item): item is RecentNoteItem => Boolean(item))
    .sort((left, right) => right.lastViewedAtMs - left.lastViewedAtMs)
    .slice(0, MAX_RECENT_NOTES)
  window.localStorage.setItem(storageKey, JSON.stringify(normalized))
}

/**
 * Inserts or refreshes one recent note entry and keeps the list deduplicated.
 */
export function upsertRecentNote(storageKey: string, item: RecentNoteItem): RecentNoteItem[] {
  const candidate = sanitizeEntry(item)
  if (!candidate) return readRecentNotes(storageKey)
  const next = readRecentNotes(storageKey).filter(
    (entry) => toWorkspacePathKey(entry.path) !== toWorkspacePathKey(candidate.path)
  )
  next.unshift(candidate)
  writeRecentNotes(storageKey, next)
  return readRecentNotes(storageKey)
}

/**
 * Removes one recent note entry by path and returns the persisted list.
 */
export function removeRecentNote(storageKey: string, path: string): RecentNoteItem[] {
  const target = toWorkspacePathKey(path)
  const next = readRecentNotes(storageKey).filter(
    (entry) => toWorkspacePathKey(entry.path) !== target
  )
  writeRecentNotes(storageKey, next)
  return next
}

/**
 * Rewrites one recent note path after a rename while preserving its recency.
 */
export function renameRecentNote(storageKey: string, fromPath: string, toPath: string, nextTitle?: string): RecentNoteItem[] {
  const source = toWorkspacePathKey(fromPath)
  const target = toWorkspacePathKey(toPath)
  const items = readRecentNotes(storageKey)
  const current = items.find((entry) => toWorkspacePathKey(entry.path) === source)
  if (!current) return items

  const renamed: RecentNoteItem = {
    path: toPath.trim(),
    title: nextTitle?.trim() || current.title,
    lastViewedAtMs: current.lastViewedAtMs
  }

  const next = items.filter((entry) => {
    const key = toWorkspacePathKey(entry.path)
    return key !== source && key !== target
  })
  next.unshift(renamed)
  writeRecentNotes(storageKey, next)
  return readRecentNotes(storageKey)
}
