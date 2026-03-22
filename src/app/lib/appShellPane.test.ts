import { describe, expect, it, vi } from 'vitest'
import { clearEditorStatusForPaths, documentPathsForPane } from './appShellPane'

describe('appShellPane', () => {
  it('returns only document paths for a pane', () => {
    const panesById = {
      'pane-1': {
        openTabs: [
          { id: 'home', type: 'home' },
          { id: 'doc-1', type: 'document', path: '/vault/a.md' },
          { id: 'doc-2', type: 'document', path: '/vault/b.md' }
        ]
      }
    }

    expect(documentPathsForPane(panesById, 'pane-1')).toEqual(['/vault/a.md', '/vault/b.md'])
    expect(documentPathsForPane(panesById, 'pane-missing')).toEqual([])
  })

  it('clears editor status for a path batch', () => {
    const clearStatus = vi.fn()
    clearEditorStatusForPaths(['/vault/a.md', '/vault/b.md'], clearStatus)
    expect(clearStatus).toHaveBeenCalledWith('/vault/a.md')
    expect(clearStatus).toHaveBeenCalledWith('/vault/b.md')
  })
})
