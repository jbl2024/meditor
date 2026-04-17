import { ref, type Ref } from 'vue'
import { normalizeWorkspacePath } from '../../explorer/lib/workspacePaths'
import { editorSurfaceModeForPath, isSourceTextPath } from '../../../app/lib/appShellDocuments'
import { isMarkdownPath } from '../../../app/lib/appShellPaths'

/**
 * Module: useEditorSourceMode
 *
 * Owns the per-path source-vs-rich editor preference for the editor shell.
 * Markdown files default to rich editing, while plain text formats default to
 * source mode.
 */

const SOURCE_MODE_STORAGE_KEY = 'tomosona:editor:source-mode'

type SourceModeByPath = Record<string, true>

function readStoredSourceMode(): SourceModeByPath {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(SOURCE_MODE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const entries = Object.entries(parsed).filter(([, value]) => value === true)
    return Object.fromEntries(entries.map(([path]) => [path, true]))
  } catch {
    return {}
  }
}

function writeStoredSourceMode(state: SourceModeByPath) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SOURCE_MODE_STORAGE_KEY, JSON.stringify(state))
}

/**
 * Keeps the source-mode preference stable across note renames and reloads.
 */
export function useEditorSourceMode(currentPath: Ref<string>) {
  const sourceModeByPath = ref<SourceModeByPath>(readStoredSourceMode())

  function normalizePath(path: string) {
    return normalizeWorkspacePath(path).trim()
  }

  function isSourceMode(path: string): boolean {
    const normalized = normalizePath(path)
    if (!normalized) return false
    if (isSourceTextPath(normalized)) return true
    if (!isMarkdownPath(normalized)) return true
    return sourceModeByPath.value[normalized] === true
  }

  function setMarkdownSourceMode(path: string, enabled: boolean) {
    const normalized = normalizePath(path)
    if (!normalized || !isMarkdownPath(normalized)) return
    const next = { ...sourceModeByPath.value }
    if (enabled) {
      next[normalized] = true
    } else {
      delete next[normalized]
    }
    sourceModeByPath.value = next
    writeStoredSourceMode(next)
  }

  function toggleMarkdownSourceMode(path: string) {
    setMarkdownSourceMode(path, !isSourceMode(path))
  }

  function movePath(from: string, to: string) {
    const fromPath = normalizePath(from)
    const toPath = normalizePath(to)
    if (!fromPath || !toPath || fromPath === toPath) return
    const next = { ...sourceModeByPath.value }
    if (next[fromPath]) {
      delete next[fromPath]
      if (isMarkdownPath(toPath)) {
        next[toPath] = true
      }
      sourceModeByPath.value = next
      writeStoredSourceMode(next)
    }
  }

  function defaultSurfaceForCurrentPath(): 'rich' | 'source' {
    return editorSurfaceModeForPath(currentPath.value)
  }

  return {
    isSourceMode,
    setMarkdownSourceMode,
    toggleMarkdownSourceMode,
    movePath,
    defaultSurfaceForCurrentPath
  }
}
