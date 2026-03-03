import { computed, ref } from 'vue'

/** Stable pane identifier within the current editor layout. */
export type PaneId = string

/** File tab metadata rendered inside one pane tab bar. */
export type PaneTab = {
  path: string
  pinned: boolean
}

/** Runtime state for a single editor pane. */
export type PaneState = {
  id: PaneId
  openTabs: PaneTab[]
  activePath: string
}

/** Binary split tree used to describe pane arrangement. */
export type SplitNode =
  | { kind: 'pane'; paneId: PaneId }
  | {
    kind: 'split'
    axis: 'row' | 'column'
    a: SplitNode
    b: SplitNode
    ratio: 0.5
  }

export type MultiPaneLayout = {
  root: SplitNode
  panesById: Record<PaneId, PaneState>
  activePaneId: PaneId
}

/** Direction used by focus/tab move shortcuts and commands. */
export type MoveDirection = 'next' | 'previous'

const MAX_PANES = 4

/**
 * Creates a one-pane initial layout.
 */
export function createInitialLayout(): MultiPaneLayout {
  const initialPaneId = 'pane-1'
  return {
    root: { kind: 'pane', paneId: initialPaneId },
    panesById: {
      [initialPaneId]: {
        id: initialPaneId,
        openTabs: [],
        activePath: ''
      }
    },
    activePaneId: initialPaneId
  }
}

/**
 * Validates and hydrates a serialized layout payload.
 * Returns null when payload cannot be trusted.
 */
export function hydrateLayout(payload: unknown): MultiPaneLayout | null {
  if (!payload || typeof payload !== 'object') return null
  const maybe = payload as Partial<MultiPaneLayout>
  if (!maybe.root || !maybe.panesById || typeof maybe.panesById !== 'object') return null
  if (typeof maybe.activePaneId !== 'string' || !maybe.activePaneId) return null

  const paneIds = new Set<string>()
  if (!collectPaneIds(maybe.root as SplitNode, paneIds)) return null
  if (!paneIds.size || paneIds.size > MAX_PANES) return null

  const panesById: Record<PaneId, PaneState> = {}
  const globalSeenPaths = new Set<string>()
  for (const paneId of paneIds) {
    const rawPane = (maybe.panesById as Record<string, unknown>)[paneId]
    if (!rawPane || typeof rawPane !== 'object') return null
    const raw = rawPane as Partial<PaneState>
    const rawTabs = Array.isArray(raw.openTabs) ? raw.openTabs : []
    const openTabs = rawTabs
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const tab = item as Partial<PaneTab>
        return {
          path: typeof tab.path === 'string' ? tab.path.trim() : '',
          pinned: Boolean(tab.pinned)
        }
      })
      .filter((item) => item.path.length > 0)
      .filter((item) => {
        if (globalSeenPaths.has(item.path)) return false
        globalSeenPaths.add(item.path)
        return true
      })

    const activePathRaw = typeof raw.activePath === 'string' ? raw.activePath.trim() : ''
    const activePath = openTabs.some((tab) => tab.path === activePathRaw)
      ? activePathRaw
      : (openTabs[0]?.path ?? '')

    panesById[paneId] = {
      id: paneId,
      openTabs,
      activePath
    }
  }

  const activePaneId = paneIds.has(maybe.activePaneId) ? maybe.activePaneId : Array.from(paneIds)[0]

  return {
    root: cloneNode(maybe.root as SplitNode),
    panesById,
    activePaneId
  }
}

/**
 * Produces a JSON-safe snapshot for storage.
 */
export function serializeLayout(layout: MultiPaneLayout): MultiPaneLayout {
  return {
    root: cloneNode(layout.root),
    panesById: Object.fromEntries(
      Object.entries(layout.panesById).map(([paneId, pane]) => [
        paneId,
        {
          id: pane.id,
          openTabs: pane.openTabs.map((tab) => ({ ...tab })),
          activePath: pane.activePath
        }
      ])
    ),
    activePaneId: layout.activePaneId
  }
}

function cloneNode(node: SplitNode): SplitNode {
  if (node.kind === 'pane') {
    return { kind: 'pane', paneId: node.paneId }
  }
  return {
    kind: 'split',
    axis: node.axis,
    ratio: 0.5,
    a: cloneNode(node.a),
    b: cloneNode(node.b)
  }
}

function collectPaneIds(node: SplitNode, ids: Set<string>): boolean {
  if (!node || typeof node !== 'object') return false
  if (node.kind === 'pane') {
    if (typeof node.paneId !== 'string' || !node.paneId.trim()) return false
    ids.add(node.paneId)
    return true
  }
  if (node.kind !== 'split') return false
  if ((node.axis !== 'row' && node.axis !== 'column') || node.ratio !== 0.5) return false
  return collectPaneIds(node.a, ids) && collectPaneIds(node.b, ids)
}

function makeNextPaneId(existing: Set<string>): string {
  let i = 1
  while (existing.has(`pane-${i}`)) {
    i += 1
  }
  return `pane-${i}`
}

function buildPathToPane(node: SplitNode, paneId: string, path: Array<'a' | 'b'> = []): Array<'a' | 'b'> | null {
  if (node.kind === 'pane') {
    return node.paneId === paneId ? path : null
  }

  const inA = buildPathToPane(node.a, paneId, [...path, 'a'])
  if (inA) return inA
  return buildPathToPane(node.b, paneId, [...path, 'b'])
}

function replaceNodeAtPath(root: SplitNode, path: Array<'a' | 'b'>, replacement: SplitNode): SplitNode {
  if (!path.length) return replacement
  if (root.kind !== 'split') return root
  const [head, ...tail] = path
  if (head === 'a') {
    return {
      ...root,
      a: replaceNodeAtPath(root.a, tail, replacement)
    }
  }
  return {
    ...root,
    b: replaceNodeAtPath(root.b, tail, replacement)
  }
}

function removePaneFromTree(root: SplitNode, paneId: PaneId): SplitNode {
  if (root.kind === 'pane') return root

  if (root.a.kind === 'pane' && root.a.paneId === paneId) {
    return cloneNode(root.b)
  }
  if (root.b.kind === 'pane' && root.b.paneId === paneId) {
    return cloneNode(root.a)
  }

  return {
    ...root,
    a: removePaneFromTree(root.a, paneId),
    b: removePaneFromTree(root.b, paneId)
  }
}

function listPaneIdsInOrder(node: SplitNode): PaneId[] {
  if (node.kind === 'pane') return [node.paneId]
  return [...listPaneIdsInOrder(node.a), ...listPaneIdsInOrder(node.b)]
}

/**
 * Multi-pane editor workspace state.
 * Invariant: a file path can be present in at most one pane at a time.
 */
export function useMultiPaneWorkspaceState(initial: MultiPaneLayout = createInitialLayout()) {
  const layout = ref<MultiPaneLayout>(serializeLayout(initial))

  const paneOrder = computed(() => listPaneIdsInOrder(layout.value.root))

  function paneCount(): number {
    return Object.keys(layout.value.panesById).length
  }

  function setActivePane(paneId: PaneId) {
    if (!layout.value.panesById[paneId]) return
    layout.value = {
      ...layout.value,
      activePaneId: paneId
    }
  }

  function findPaneContainingPath(path: string): PaneId | null {
    const target = path.trim()
    if (!target) return null
    const panes = Object.values(layout.value.panesById)
    for (const pane of panes) {
      if (pane.openTabs.some((tab) => tab.path === target)) {
        return pane.id
      }
    }
    return null
  }

  function setActivePathInPane(paneId: PaneId, path: string) {
    const pane = layout.value.panesById[paneId]
    if (!pane) return
    const target = path.trim()
    if (!target) return

    const existingPane = findPaneContainingPath(target)
    if (existingPane && existingPane !== paneId) {
      layout.value = {
        ...layout.value,
        activePaneId: existingPane
      }
      return
    }

    if (!pane.openTabs.some((tab) => tab.path === target)) return

    layout.value = {
      ...layout.value,
      panesById: {
        ...layout.value.panesById,
        [paneId]: {
          ...pane,
          activePath: target
        }
      },
      activePaneId: paneId
    }
  }

  /**
   * Opens a path in target pane. If path exists in another pane, focuses that pane.
   */
  function openPathInPane(path: string, paneId: PaneId = layout.value.activePaneId) {
    const target = path.trim()
    if (!target) return

    const existingPane = findPaneContainingPath(target)
    if (existingPane) {
      const existing = layout.value.panesById[existingPane]
      layout.value = {
        ...layout.value,
        panesById: {
          ...layout.value.panesById,
          [existingPane]: {
            ...existing,
            activePath: target
          }
        },
        activePaneId: existingPane
      }
      return
    }

    const pane = layout.value.panesById[paneId]
    if (!pane) return

    layout.value = {
      ...layout.value,
      panesById: {
        ...layout.value.panesById,
        [paneId]: {
          ...pane,
          openTabs: [...pane.openTabs, { path: target, pinned: false }],
          activePath: target
        }
      },
      activePaneId: paneId
    }
  }

  function closeTabInPane(paneId: PaneId, path: string) {
    const pane = layout.value.panesById[paneId]
    if (!pane) return
    const target = path.trim()
    const index = pane.openTabs.findIndex((tab) => tab.path === target)
    if (index < 0) return

    const nextTabs = pane.openTabs.filter((tab) => tab.path !== target)
    const activePath = pane.activePath === target
      ? (nextTabs[index]?.path ?? nextTabs[index - 1]?.path ?? '')
      : pane.activePath

    layout.value = {
      ...layout.value,
      panesById: {
        ...layout.value.panesById,
        [paneId]: {
          ...pane,
          openTabs: nextTabs,
          activePath
        }
      }
    }
  }

  function closeOtherTabsInPane(paneId: PaneId, path: string) {
    const pane = layout.value.panesById[paneId]
    if (!pane) return
    const target = path.trim()
    const active = pane.openTabs.find((tab) => tab.path === target)
    if (!active) return

    layout.value = {
      ...layout.value,
      panesById: {
        ...layout.value.panesById,
        [paneId]: {
          ...pane,
          openTabs: [active],
          activePath: target
        }
      },
      activePaneId: paneId
    }
  }

  function closeAllTabsInPane(paneId: PaneId) {
    const pane = layout.value.panesById[paneId]
    if (!pane) return

    layout.value = {
      ...layout.value,
      panesById: {
        ...layout.value.panesById,
        [paneId]: {
          ...pane,
          openTabs: [],
          activePath: ''
        }
      },
      activePaneId: paneId
    }
  }

  function splitPane(paneId: PaneId, axis: 'row' | 'column'): PaneId | null {
    const sourcePane = layout.value.panesById[paneId]
    if (!sourcePane) return null
    if (paneCount() >= MAX_PANES) return null

    const existingIds = new Set(Object.keys(layout.value.panesById))
    const newPaneId = makeNextPaneId(existingIds)
    const newPane: PaneState = {
      id: newPaneId,
      // Keep panes strictly unique by path; split starts empty in MVP.
      openTabs: [],
      activePath: ''
    }

    const pathToSource = buildPathToPane(layout.value.root, paneId)
    if (!pathToSource) return null

    const replacement: SplitNode = {
      kind: 'split',
      axis,
      ratio: 0.5,
      a: { kind: 'pane', paneId },
      b: { kind: 'pane', paneId: newPaneId }
    }

    layout.value = {
      ...layout.value,
      root: replaceNodeAtPath(layout.value.root, pathToSource, replacement),
      panesById: {
        ...layout.value.panesById,
        [newPaneId]: newPane
      },
      activePaneId: newPaneId
    }

    return newPaneId
  }

  /**
   * Closes pane when more than one pane exists, then focuses nearest remaining pane.
   */
  function closePane(paneId: PaneId): boolean {
    if (!layout.value.panesById[paneId]) return false
    if (paneCount() <= 1) return false

    const orderBefore = paneOrder.value
    const indexBefore = orderBefore.indexOf(paneId)

    const nextPanes = { ...layout.value.panesById }
    delete nextPanes[paneId]

    const nextRoot = removePaneFromTree(layout.value.root, paneId)
    const orderAfter = listPaneIdsInOrder(nextRoot)
    const nextFocus = orderAfter[Math.max(0, Math.min(indexBefore, orderAfter.length - 1))] ?? orderAfter[0]

    layout.value = {
      root: nextRoot,
      panesById: nextPanes,
      activePaneId: nextFocus
    }

    return true
  }

  function focusPaneByIndex(index1to4: number): boolean {
    if (!Number.isInteger(index1to4) || index1to4 < 1 || index1to4 > 4) return false
    const paneId = paneOrder.value[index1to4 - 1]
    if (!paneId) return false
    setActivePane(paneId)
    return true
  }

  function focusAdjacentPane(direction: MoveDirection): boolean {
    const order = paneOrder.value
    if (order.length <= 1) return false
    const current = order.indexOf(layout.value.activePaneId)
    if (current < 0) return false
    const step = direction === 'next' ? 1 : -1
    const nextIndex = (current + step + order.length) % order.length
    setActivePane(order[nextIndex])
    return true
  }

  /**
   * Moves active tab to adjacent pane. If destination already has path, destination is focused.
   */
  function moveActiveTabToAdjacentPane(direction: MoveDirection): boolean {
    const order = paneOrder.value
    if (order.length <= 1) return false

    const sourceId = layout.value.activePaneId
    const source = layout.value.panesById[sourceId]
    if (!source || !source.activePath) return false

    const sourceIndex = order.indexOf(sourceId)
    if (sourceIndex < 0) return false
    const step = direction === 'next' ? 1 : -1
    const targetId = order[(sourceIndex + step + order.length) % order.length]
    const target = layout.value.panesById[targetId]
    if (!target) return false

    const movingPath = source.activePath
    if (target.openTabs.some((tab) => tab.path === movingPath)) {
      layout.value = {
        ...layout.value,
        activePaneId: targetId,
        panesById: {
          ...layout.value.panesById,
          [targetId]: {
            ...target,
            activePath: movingPath
          }
        }
      }
      closeTabInPane(sourceId, movingPath)
      return true
    }

    const sourceTabs = source.openTabs.filter((tab) => tab.path !== movingPath)
    const nextSourceActive = sourceTabs[0]?.path ?? ''

    layout.value = {
      ...layout.value,
      panesById: {
        ...layout.value.panesById,
        [sourceId]: {
          ...source,
          openTabs: sourceTabs,
          activePath: nextSourceActive
        },
        [targetId]: {
          ...target,
          openTabs: [...target.openTabs, { path: movingPath, pinned: false }],
          activePath: movingPath
        }
      },
      activePaneId: targetId
    }

    return true
  }

  function replacePath(fromPath: string, toPath: string) {
    const from = fromPath.trim()
    const to = toPath.trim()
    if (!from || !to || from === to) return

    const nextPanes: Record<PaneId, PaneState> = {}
    for (const [paneId, pane] of Object.entries(layout.value.panesById)) {
      const nextTabs = pane.openTabs.map((tab) => (tab.path === from ? { ...tab, path: to } : tab))
      nextPanes[paneId] = {
        ...pane,
        openTabs: nextTabs,
        activePath: pane.activePath === from ? to : pane.activePath
      }
    }

    layout.value = {
      ...layout.value,
      panesById: nextPanes
    }
  }

  function resetToSinglePane() {
    const activePane = layout.value.panesById[layout.value.activePaneId]
    const activePath = activePane?.activePath ?? ''
    const single = createInitialLayout()

    if (activePath) {
      single.panesById[single.activePaneId] = {
        ...single.panesById[single.activePaneId],
        openTabs: [{ path: activePath, pinned: false }],
        activePath
      }
    }

    layout.value = single
  }

  /**
   * Joins all panes into one pane and keeps a deduplicated tab list.
   * Active file remains active when present in merged tabs.
   */
  function joinAllPanes() {
    const activePath = layout.value.panesById[layout.value.activePaneId]?.activePath ?? ''
    const mergedTabs: PaneTab[] = []
    const seen = new Set<string>()

    for (const paneId of paneOrder.value) {
      const pane = layout.value.panesById[paneId]
      if (!pane) continue
      for (const tab of pane.openTabs) {
        if (seen.has(tab.path)) continue
        seen.add(tab.path)
        mergedTabs.push({ ...tab })
      }
    }

    const single = createInitialLayout()
    const mergedActivePath = mergedTabs.some((tab) => tab.path === activePath)
      ? activePath
      : (mergedTabs[0]?.path ?? '')
    single.panesById[single.activePaneId] = {
      ...single.panesById[single.activePaneId],
      openTabs: mergedTabs,
      activePath: mergedActivePath
    }
    layout.value = single
  }

  return {
    layout,
    paneOrder,
    openPathInPane,
    setActivePane,
    setActivePathInPane,
    closeTabInPane,
    closeOtherTabsInPane,
    closeAllTabsInPane,
    splitPane,
    closePane,
    moveActiveTabToAdjacentPane,
    focusAdjacentPane,
    focusPaneByIndex,
    replacePath,
    resetToSinglePane,
    joinAllPanes,
    findPaneContainingPath
  }
}
