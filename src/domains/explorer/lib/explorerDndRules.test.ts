import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../../../shared/api/apiTypes'
import {
  normalizeDraggedPaths,
  resolveDropIntent,
  resolveExplorerDropTarget
} from './explorerDndRules'

function fileNode(path: string): TreeNode {
  return {
    name: path.split('/').pop() ?? path,
    path,
    is_dir: false,
    is_markdown: true,
    has_children: false
  }
}

function dirNode(path: string): TreeNode {
  return {
    name: path.split('/').pop() ?? path,
    path,
    is_dir: true,
    is_markdown: false,
    has_children: true
  }
}

describe('explorerDndRules', () => {
  it('normalizes drag selections by removing descendants already covered by a selected parent', () => {
    const parentByPath = {
      '/vault/projects': '/vault',
      '/vault/projects/a.md': '/vault/projects',
      '/vault/projects/nested': '/vault/projects',
      '/vault/projects/nested/b.md': '/vault/projects/nested'
    }

    expect(normalizeDraggedPaths([
      '/vault/projects',
      '/vault/projects/a.md',
      '/vault/projects/nested',
      '/vault/projects/nested/b.md'
    ], parentByPath)).toEqual(['/vault/projects'])
  })

  it('maps directory center hover to inside and edge hover to before/after', () => {
    expect(resolveDropIntent(
      dirNode('/vault/folder'),
      { top: false, right: false, bottom: false, left: false, center: true }
    )).toBe('inside')
    expect(resolveDropIntent(
      fileNode('/vault/a.md'),
      { top: false, right: false, bottom: false, left: false, center: true }
    )).toBe('after')
    expect(resolveDropIntent(
      fileNode('/vault/a.md'),
      { top: true, right: false, bottom: false, left: false, center: false }
    )).toBe('before')
    expect(resolveDropIntent(
      fileNode('/vault/a.md'),
      { top: false, right: false, bottom: true, left: false, center: false }
    )).toBe('after')
  })

  it('blocks moves into descendants', () => {
    const nodeByPath = {
      '/vault/folder': dirNode('/vault/folder'),
      '/vault/folder/nested': dirNode('/vault/folder/nested')
    }
    const parentByPath = {
      '/vault/folder': '/vault',
      '/vault/folder/nested': '/vault/folder'
    }

    expect(resolveExplorerDropTarget({
      folderPath: '/vault',
      targetPath: '/vault/folder/nested',
      intent: 'inside',
      draggedPaths: ['/vault/folder'],
      nodeByPath,
      parentByPath,
      hasActiveFilter: false
    })).toMatchObject({
      isValid: false,
      reason: 'descendant'
    })
  })

  it('treats before/after in the same parent as invalid because explorer order is not user-defined', () => {
    const nodeByPath = {
      '/vault/a.md': fileNode('/vault/a.md'),
      '/vault/b.md': fileNode('/vault/b.md')
    }
    const parentByPath = {
      '/vault/a.md': '/vault',
      '/vault/b.md': '/vault'
    }

    expect(resolveExplorerDropTarget({
      folderPath: '/vault',
      targetPath: '/vault/b.md',
      intent: 'before',
      draggedPaths: ['/vault/a.md'],
      nodeByPath,
      parentByPath,
      hasActiveFilter: false
    })).toMatchObject({
      isValid: false,
      reason: 'same_parent'
    })
  })

  it('disables drop resolution while filtering is active', () => {
    const nodeByPath = {
      '/vault/folder': dirNode('/vault/folder')
    }
    const parentByPath = {
      '/vault/folder': '/vault'
    }

    expect(resolveExplorerDropTarget({
      folderPath: '/vault',
      targetPath: '/vault/folder',
      intent: 'inside',
      draggedPaths: ['/vault/a.md'],
      nodeByPath,
      parentByPath,
      hasActiveFilter: true
    })).toMatchObject({
      isValid: false,
      reason: 'disabled'
    })
  })
})
