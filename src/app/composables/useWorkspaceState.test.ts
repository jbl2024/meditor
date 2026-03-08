import { describe, expect, it } from 'vitest'
import { useWorkspaceState } from './useWorkspaceState'

describe('useWorkspaceState', () => {
  it('supports explorer/favorites/search sidebar modes', () => {
    const workspace = useWorkspaceState()
    workspace.setSidebarMode('favorites')
    expect(workspace.sidebarMode.value).toBe('favorites')
    workspace.setSidebarMode('search')
    expect(workspace.sidebarMode.value).toBe('search')
    expect(workspace.sidebarVisible.value).toBe(true)
  })
})
