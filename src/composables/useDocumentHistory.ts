import { computed, ref } from 'vue'

type HistoryTarget = {
  path: string
  index: number
}

/**
 * useDocumentHistory
 *
 * Maintains linear navigation history for opened documents (back/forward),
 * similarly to browser history semantics.
 *
 * Responsibilities:
 * - Track visited paths in order.
 * - Expose current location and navigation capabilities.
 * - Support direct jumps and path replacement after rename.
 *
 * Key invariant:
 * - Calling `record` after going back discards all forward entries so the
 *   history remains a single linear timeline.
 */
export function useDocumentHistory() {
  const entries = ref<string[]>([])
  const index = ref(-1)

  const currentPath = computed(() => {
    if (index.value < 0 || index.value >= entries.value.length) return ''
    return entries.value[index.value]
  })

  const canGoBack = computed(() => index.value > 0)
  const canGoForward = computed(() => index.value >= 0 && index.value < entries.value.length - 1)
  const backTargets = computed<HistoryTarget[]>(() => {
    const out: HistoryTarget[] = []
    for (let idx = index.value - 1; idx >= 0; idx -= 1) {
      out.push({ index: idx, path: entries.value[idx] })
    }
    return out
  })
  const forwardTargets = computed<HistoryTarget[]>(() => {
    const out: HistoryTarget[] = []
    for (let idx = index.value + 1; idx < entries.value.length; idx += 1) {
      out.push({ index: idx, path: entries.value[idx] })
    }
    return out
  })

  /** Clears the whole navigation history. */
  function reset() {
    entries.value = []
    index.value = -1
  }

  /**
   * Appends a visited path to history and makes it current.
   *
   * Notes:
   * - Empty/whitespace paths are ignored.
   * - Re-recording the current path is ignored.
   * - If user previously went back, forward entries are dropped.
   */
  function record(path: string) {
    const target = path.trim()
    if (!target) return
    if (target === currentPath.value) return

    const next = index.value >= 0
      ? entries.value.slice(0, index.value + 1)
      : []

    next.push(target)
    entries.value = next
    index.value = next.length - 1
  }

  /**
   * Moves to the previous history entry.
   * @returns The new current path, or empty string if no previous entry exists.
   */
  function goBack(): string {
    if (!canGoBack.value) return ''
    index.value -= 1
    return entries.value[index.value] ?? ''
  }

  /**
   * Moves to the next history entry.
   * @returns The new current path, or empty string if no next entry exists.
   */
  function goForward(): string {
    if (!canGoForward.value) return ''
    index.value += 1
    return entries.value[index.value] ?? ''
  }

  /**
   * Jumps to an absolute history index.
   * @returns The selected path, or empty string if index is out of range.
   */
  function jumpTo(targetIndex: number): string {
    if (targetIndex < 0 || targetIndex >= entries.value.length) return ''
    index.value = targetIndex
    return entries.value[index.value] ?? ''
  }

  /**
   * Rewrites all matching history entries when a document path changes.
   *
   * This keeps back/forward navigation valid after rename/move operations.
   */
  function replacePath(fromPath: string, toPath: string) {
    if (!fromPath || !toPath || fromPath === toPath) return

    let changed = false
    const next = entries.value.map((path) => {
      if (path !== fromPath) return path
      changed = true
      return toPath
    })

    if (changed) {
      entries.value = next
    }
  }

  return {
    currentPath,
    currentIndex: index,
    canGoBack,
    canGoForward,
    backTargets,
    forwardTargets,
    reset,
    record,
    goBack,
    goForward,
    jumpTo,
    replacePath
  }
}
