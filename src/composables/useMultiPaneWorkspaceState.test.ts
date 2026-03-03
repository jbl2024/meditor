import { describe, expect, it } from 'vitest'
import {
  createInitialLayout,
  hydrateLayout,
  serializeLayout,
  useMultiPaneWorkspaceState
} from './useMultiPaneWorkspaceState'

describe('useMultiPaneWorkspaceState', () => {
  it('starts with single pane layout', () => {
    const store = useMultiPaneWorkspaceState()
    expect(store.paneOrder.value).toEqual(['pane-1'])
    expect(store.layout.value.activePaneId).toBe('pane-1')
  })

  it('opens in active pane and enforces single-pane ownership per path', () => {
    const store = useMultiPaneWorkspaceState()
    store.openPathInPane('/vault/a.md')
    const pane2 = store.splitPane('pane-1', 'row')
    expect(pane2).toBe('pane-2')
    expect(store.layout.value.panesById['pane-2'].openTabs).toEqual([])
    store.openPathInPane('/vault/b.md', pane2!)

    store.openPathInPane('/vault/a.md', pane2!)

    expect(store.layout.value.activePaneId).toBe('pane-1')
    expect(store.layout.value.panesById['pane-1'].activePath).toBe('/vault/a.md')
    expect(store.layout.value.panesById['pane-2'].openTabs.some((tab) => tab.path === '/vault/a.md')).toBe(false)
  })

  it('supports split right/down and max 4 panes', () => {
    const store = useMultiPaneWorkspaceState()
    const p2 = store.splitPane('pane-1', 'row')
    const p3 = store.splitPane(p2!, 'column')
    const p4 = store.splitPane(p3!, 'row')
    const p5 = store.splitPane(p4!, 'column')

    expect(p2).toBeTruthy()
    expect(p3).toBeTruthy()
    expect(p4).toBeTruthy()
    expect(p5).toBeNull()
    expect(store.paneOrder.value).toHaveLength(4)
  })

  it('can close pane and keep one-pane minimum', () => {
    const store = useMultiPaneWorkspaceState()
    const p2 = store.splitPane('pane-1', 'row')
    expect(store.closePane(p2!)).toBe(true)
    expect(store.paneOrder.value).toEqual(['pane-1'])
    expect(store.closePane('pane-1')).toBe(false)
  })

  it('moves active tab to adjacent pane', () => {
    const store = useMultiPaneWorkspaceState()
    store.openPathInPane('/vault/a.md')
    const p2 = store.splitPane('pane-1', 'row')
    expect(p2).toBeTruthy()

    store.setActivePane('pane-1')
    const moved = store.moveActiveTabToAdjacentPane('next')

    expect(moved).toBe(true)
    expect(store.layout.value.activePaneId).toBe('pane-2')
    expect(store.layout.value.panesById['pane-2'].activePath).toBe('/vault/a.md')
  })

  it('focuses panes by index and adjacent navigation', () => {
    const store = useMultiPaneWorkspaceState()
    store.splitPane('pane-1', 'row')
    expect(store.focusPaneByIndex(2)).toBe(true)
    expect(store.layout.value.activePaneId).toBe('pane-2')
    expect(store.focusAdjacentPane('previous')).toBe(true)
    expect(store.layout.value.activePaneId).toBe('pane-1')
  })

  it('resets to one pane with current active path', () => {
    const store = useMultiPaneWorkspaceState()
    store.openPathInPane('/vault/a.md')
    const p2 = store.splitPane('pane-1', 'row')
    store.openPathInPane('/vault/b.md', p2!)
    store.setActivePane(p2!)
    store.resetToSinglePane()

    expect(store.paneOrder.value).toEqual(['pane-1'])
    expect(store.layout.value.panesById['pane-1'].activePath).toBe('/vault/b.md')
  })

  it('joins panes into one pane with unique merged tabs', () => {
    const store = useMultiPaneWorkspaceState()
    store.openPathInPane('/vault/a.md')
    const pane2 = store.splitPane('pane-1', 'row')
    store.openPathInPane('/vault/b.md', pane2!)
    store.setActivePane('pane-2')

    store.joinAllPanes()

    expect(store.paneOrder.value).toEqual(['pane-1'])
    expect(store.layout.value.panesById['pane-1'].openTabs.map((tab) => tab.path)).toEqual(['/vault/a.md', '/vault/b.md'])
    expect(store.layout.value.panesById['pane-1'].activePath).toBe('/vault/b.md')
  })

  it('serializes and hydrates valid layout', () => {
    const store = useMultiPaneWorkspaceState()
    store.openPathInPane('/vault/a.md')
    const p2 = store.splitPane('pane-1', 'row')
    store.openPathInPane('/vault/b.md', p2!)

    const payload = serializeLayout(store.layout.value)
    const hydrated = hydrateLayout(payload)

    expect(hydrated).toBeTruthy()
    expect(hydrated?.activePaneId).toBe(store.layout.value.activePaneId)
    expect(Object.keys(hydrated?.panesById ?? {})).toHaveLength(2)
  })

  it('rejects invalid hydrated payloads', () => {
    const invalid = {
      root: { kind: 'pane', paneId: 'pane-1' },
      panesById: {
        'pane-1': { id: 'pane-1', openTabs: [{ path: '', pinned: false }], activePath: '' }
      },
      activePaneId: 'missing'
    }

    const hydrated = hydrateLayout(invalid)
    expect(hydrated).toBeTruthy()
    expect(hydrated?.activePaneId).toBe('pane-1')
    expect(hydrated?.panesById['pane-1'].openTabs).toEqual([])

    expect(hydrateLayout({})).toBeNull()
    expect(hydrateLayout(null)).toBeNull()
  })

  it('deduplicates cross-pane tabs while hydrating', () => {
    const payload = {
      root: {
        kind: 'split',
        axis: 'row',
        ratio: 0.5,
        a: { kind: 'pane', paneId: 'pane-1' },
        b: { kind: 'pane', paneId: 'pane-2' }
      },
      panesById: {
        'pane-1': { id: 'pane-1', openTabs: [{ path: '/vault/a.md', pinned: false }], activePath: '/vault/a.md' },
        'pane-2': { id: 'pane-2', openTabs: [{ path: '/vault/a.md', pinned: false }], activePath: '/vault/a.md' }
      },
      activePaneId: 'pane-2'
    }

    const hydrated = hydrateLayout(payload)
    expect(hydrated).toBeTruthy()
    expect(hydrated?.panesById['pane-1'].openTabs.map((tab) => tab.path)).toEqual(['/vault/a.md'])
    expect(hydrated?.panesById['pane-2'].openTabs).toEqual([])
  })

  it('creates a valid initial layout helper', () => {
    const initial = createInitialLayout()
    expect(initial.root.kind).toBe('pane')
    expect(initial.activePaneId).toBe('pane-1')
  })
})
