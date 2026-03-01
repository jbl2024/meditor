import { describe, expect, it } from 'vitest'
import { useWorkspaceState } from './useWorkspaceState'

describe('useWorkspaceState', () => {
  it('supports second-brain sidebar mode', () => {
    const workspace = useWorkspaceState()
    workspace.setSidebarMode('second-brain')
    expect(workspace.sidebarMode.value).toBe('second-brain')
    expect(workspace.sidebarVisible.value).toBe(true)
  })
})
