import { computed, ref, type ComputedRef } from 'vue'

/**
 * Module: useConstitutedContext
 *
 * Purpose:
 * - Own the editor-shell "contexte constitue" state used by the right pane.
 *
 * Boundaries:
 * - Tracks only explicit note selections retained by the user.
 * - Keeps context local to the active note until explicitly preserved.
 * - Does not persist to disk or localStorage in V1.
 */

/** Distinguishes note-local context from the explicitly preserved session context. */
export type ConstitutedContextMode = 'local' | 'preserved'

/** Minimal note record rendered by the right-pane context list. */
export type ConstitutedContextItem = {
  path: string
  title: string
}

/** Public surface for the constituted-context controller. */
export type ConstitutedContextController = {
  mode: ComputedRef<ConstitutedContextMode>
  anchorPath: ComputedRef<string>
  paths: ComputedRef<string[]>
  items: ComputedRef<ConstitutedContextItem[]>
  isEmpty: ComputedRef<boolean>
  count: ComputedRef<number>
  contains: (path: string) => boolean
  resetForAnchor: (path: string) => void
  add: (path: string, anchorPath: string, resolver?: (path: string) => ConstitutedContextItem) => void
  remove: (path: string) => void
  toggle: (path: string, anchorPath: string, resolver?: (path: string) => ConstitutedContextItem) => void
  preserve: () => void
  clear: () => void
  replace: (
    paths: string[],
    anchorPath: string,
    mode?: ConstitutedContextMode,
    resolver?: (path: string) => ConstitutedContextItem
  ) => void
}

type UseConstitutedContextOptions = {
  resolveItem?: (path: string) => ConstitutedContextItem
}

function defaultResolveItem(path: string): ConstitutedContextItem {
  const normalized = String(path ?? '').trim()
  const filename = normalized.split('/').pop()?.replace(/\.(md|markdown)$/i, '') ?? ''
  return {
    path: normalized,
    title: filename || 'Untitled'
  }
}

/**
 * Creates the right-pane constituted-context state machine.
 *
 * Important behavior:
 * - `resetForAnchor` only clears items when the context is still local.
 * - `replace` keeps first-seen order and drops empty / duplicate paths.
 * - callers may provide a resolver to keep rendered titles in sync with shell naming.
 */
export function useConstitutedContext(
  options: UseConstitutedContextOptions = {}
): ConstitutedContextController {
  const resolveItem = options.resolveItem ?? defaultResolveItem
  const modeState = ref<ConstitutedContextMode>('local')
  const anchorPathState = ref('')
  const itemsState = ref<ConstitutedContextItem[]>([])

  function normalizePath(path: string): string {
    return String(path ?? '').trim()
  }

  function dedupeItems(paths: string[], resolver: (path: string) => ConstitutedContextItem): ConstitutedContextItem[] {
    const seen = new Set<string>()
    const out: ConstitutedContextItem[] = []
    for (const rawPath of paths) {
      const path = normalizePath(rawPath)
      if (!path || seen.has(path)) continue
      seen.add(path)
      out.push(resolver(path))
    }
    return out
  }

  function contains(path: string): boolean {
    const normalized = normalizePath(path)
    return normalized.length > 0 && itemsState.value.some((item) => item.path === normalized)
  }

  function resetForAnchor(path: string) {
    const normalizedAnchor = normalizePath(path)
    anchorPathState.value = normalizedAnchor
    if (modeState.value === 'preserved') return
    itemsState.value = []
  }

  function add(path: string, anchorPath: string, resolver: (path: string) => ConstitutedContextItem = resolveItem) {
    const normalizedAnchor = normalizePath(anchorPath)
    if (normalizedAnchor) {
      anchorPathState.value = normalizedAnchor
    }
    const normalized = normalizePath(path)
    if (!normalized || contains(normalized)) return
    itemsState.value = [...itemsState.value, resolver(normalized)]
  }

  function remove(path: string) {
    const normalized = normalizePath(path)
    if (!normalized) return
    itemsState.value = itemsState.value.filter((item) => item.path !== normalized)
  }

  function toggle(path: string, anchorPath: string, resolver: (path: string) => ConstitutedContextItem = resolveItem) {
    if (contains(path)) {
      remove(path)
      return
    }
    add(path, anchorPath, resolver)
  }

  function preserve() {
    if (!itemsState.value.length) return
    modeState.value = 'preserved'
  }

  function clear() {
    itemsState.value = []
  }

  function replace(
    paths: string[],
    anchorPath: string,
    mode: ConstitutedContextMode = modeState.value,
    resolver: (path: string) => ConstitutedContextItem = resolveItem
  ) {
    anchorPathState.value = normalizePath(anchorPath)
    modeState.value = mode
    itemsState.value = dedupeItems(paths, resolver)
  }

  return {
    mode: computed(() => modeState.value),
    anchorPath: computed(() => anchorPathState.value),
    paths: computed(() => itemsState.value.map((item) => item.path)),
    items: computed(() => itemsState.value),
    isEmpty: computed(() => itemsState.value.length === 0),
    count: computed(() => itemsState.value.length),
    contains,
    resetForAnchor,
    add,
    remove,
    toggle,
    preserve,
    clear,
    replace
  }
}
