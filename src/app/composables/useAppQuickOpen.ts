import { computed, ref, type Ref } from 'vue'

/**
 * Module: useAppQuickOpen
 *
 * Purpose:
 * - Derive quick-open and command-palette state from workspace files and actions.
 */

/** Represents a row shown in quick-open, either an existing file or a daily-note shortcut. */
export type QuickOpenResult =
  | { kind: 'file'; path: string; label: string }
  | { kind: 'daily'; date: string; path: string; label: string; exists: boolean }

/** Describes a command-palette action shown in quick-open action mode. */
export type PaletteAction = {
  id: string
  label: string
  run: () => boolean | Promise<boolean>
  closeBeforeRun?: boolean
  loadingLabel?: string
}

/** Groups the workspace-backed inputs required to derive file quick-open results. */
export type AppQuickOpenDataPort = {
  allWorkspaceFiles: Ref<string[]>
  workingFolderPath: Ref<string>
}

/** Groups document/path helpers so quick-open does not take a flat list of callbacks. */
export type AppQuickOpenDocumentPort = {
  isIsoDate: (value: string) => boolean
  toRelativePath: (path: string) => string
  dailyNotePath: (root: string, date: string) => string
}

/** Groups command palette inputs used only in action mode. */
export type AppQuickOpenPalettePort = {
  paletteActions: Ref<PaletteAction[]>
  paletteActionPriority: Record<string, number>
}

/**
 * Provides the grouped dependencies required to derive quick-open state.
 *
 * Ports keep workspace, document, and palette concerns readable without hiding
 * the optional controlled state refs, which remain top-level on purpose.
 */
export type UseAppQuickOpenOptions = {
  quickOpenDataPort: AppQuickOpenDataPort
  quickOpenDocumentPort: AppQuickOpenDocumentPort
  quickOpenPalettePort: AppQuickOpenPalettePort
  quickOpenQuery?: Ref<string>
  quickOpenActiveIndex?: Ref<number>
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Derives quick-open search results, action matches, and list navigation state.
 */
export function useAppQuickOpen(options: UseAppQuickOpenOptions) {
  const { quickOpenDataPort, quickOpenDocumentPort, quickOpenPalettePort } = options
  const quickOpenQuery = options.quickOpenQuery ?? ref('')
  const quickOpenActiveIndex = options.quickOpenActiveIndex ?? ref(0)

  const quickOpenIsActionMode = computed(() => quickOpenQuery.value.trimStart().startsWith('>'))
  const quickOpenActionQuery = computed(() => quickOpenQuery.value.trimStart().slice(1).trim().toLowerCase())

  const quickOpenResults = computed<QuickOpenResult[]>(() => {
    if (quickOpenIsActionMode.value) return []
    const rawQuery = quickOpenQuery.value.trim()
    const q = normalizeSearchText(rawQuery)
    if (!q) return []

    const fileResults = quickOpenDataPort.allWorkspaceFiles.value
      .filter((path) => {
        const relativePath = quickOpenDocumentPort.toRelativePath(path)
        return normalizeSearchText(path).includes(q) || normalizeSearchText(relativePath).includes(q)
      })
      .map((path) => ({ kind: 'file' as const, path, label: quickOpenDocumentPort.toRelativePath(path) }))
      .slice(0, 80)

    if (!quickOpenDocumentPort.isIsoDate(rawQuery) || !quickOpenDataPort.workingFolderPath.value) {
      return fileResults
    }

    const path = quickOpenDocumentPort.dailyNotePath(quickOpenDataPort.workingFolderPath.value, rawQuery)
    const exists = quickOpenDataPort.allWorkspaceFiles.value.some((item) => item.toLowerCase() === path.toLowerCase())
    const dateResult: QuickOpenResult = {
      kind: 'daily',
      date: rawQuery,
      path,
      exists,
      label: exists ? `Open daily note ${rawQuery}` : `Create daily note ${rawQuery}`
    }

    return [dateResult, ...fileResults]
  })

  const quickOpenActionResults = computed(() => {
    if (!quickOpenIsActionMode.value) return []
    const q = quickOpenActionQuery.value
    const withRank = quickOpenPalettePort.paletteActions.value
      .map((item) => {
        const label = item.label.toLowerCase()
        const matchRank = !q
          ? 0
          : label === q
            ? 0
            : label.startsWith(q)
              ? 1
            : label.includes(q)
                ? 2
                : 99
        const priority = quickOpenPalettePort.paletteActionPriority[item.id] ?? Number.MAX_SAFE_INTEGER
        return { item, matchRank, priority, label }
      })
      .filter((entry) => entry.matchRank < 99)
      .sort((left, right) =>
        left.matchRank - right.matchRank ||
        left.priority - right.priority ||
        left.label.localeCompare(right.label)
      )

    return withRank.map((entry) => entry.item)
  })

  const quickOpenItemCount = computed(() =>
    quickOpenIsActionMode.value ? quickOpenActionResults.value.length : quickOpenResults.value.length
  )

  /** Moves selection with wraparound so keyboard navigation never leaves the list. */
  function moveQuickOpenSelection(delta: number) {
    const count = quickOpenItemCount.value
    if (!count) return
    quickOpenActiveIndex.value = (quickOpenActiveIndex.value + delta + count) % count
  }

  /** Sets the active list index directly, typically from pointer hover. */
  function setQuickOpenActiveIndex(index: number) {
    quickOpenActiveIndex.value = index
  }

  /** Resets query and selection together so modal reopen starts from a stable state. */
  function resetQuickOpenState(nextQuery = '') {
    quickOpenQuery.value = nextQuery
    quickOpenActiveIndex.value = 0
  }

  return {
    quickOpenQuery,
    quickOpenActiveIndex,
    quickOpenIsActionMode,
    quickOpenActionQuery,
    quickOpenResults,
    quickOpenActionResults,
    quickOpenItemCount,
    moveQuickOpenSelection,
    setQuickOpenActiveIndex,
    resetQuickOpenState
  }
}
