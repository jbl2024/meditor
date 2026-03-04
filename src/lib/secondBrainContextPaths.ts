const SECOND_BRAIN_LAST_SESSION_ID_STORAGE_PREFIX = 'tomosona:second-brain:last-session-id:'

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}

function isAbsolutePath(value: string): boolean {
  if (!value) return false
  if (value.startsWith('/')) return true
  return /^[A-Za-z]:\//.test(value)
}

/**
 * Returns an absolute workspace path for Second Brain context updates.
 *
 * - Absolute input paths are preserved (slashes normalized).
 * - Relative input paths are resolved under the provided workspace path.
 */
export function toAbsoluteWorkspacePath(workspacePath: string, path: string): string {
  const normalizedPath = normalizeSlashes(String(path ?? '').trim())
  if (!normalizedPath) return ''
  if (isAbsolutePath(normalizedPath)) return normalizedPath

  const normalizedWorkspace = normalizeSlashes(String(workspacePath ?? '').trim()).replace(/\/+$/, '')
  if (!normalizedWorkspace) return normalizedPath.replace(/^\.?\//, '')

  return `${normalizedWorkspace}/${normalizedPath.replace(/^\.?\//, '')}`
}

/**
 * Normalizes context paths for backend update payloads.
 *
 * - Converts all paths to absolute workspace paths.
 * - Drops empty entries.
 * - Deduplicates while preserving first-seen order.
 */
export function normalizeContextPathsForUpdate(workspacePath: string, paths: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const absolute = toAbsoluteWorkspacePath(workspacePath, path)
    if (!absolute) continue
    if (seen.has(absolute)) continue
    seen.add(absolute)
    out.push(absolute)
  }

  return out
}

/**
 * Builds a workspace-scoped storage key for persisted Second Brain session ids.
 */
export function workspaceScopedSecondBrainSessionKey(workspacePath: string): string {
  return `${SECOND_BRAIN_LAST_SESSION_ID_STORAGE_PREFIX}${encodeURIComponent(String(workspacePath ?? '').trim())}`
}
