/**
 * Module: explorerDndRules
 *
 * Purpose:
 * - Keep explorer drag-and-drop validation and target resolution pure.
 * - Translate row hover state into move intents that reuse existing explorer
 *   operations instead of introducing a second filesystem workflow.
 *
 * Boundaries:
 * - This module never performs I/O.
 * - It only reasons about paths, visible rows, and already-loaded tree state.
 */

import type { IPlacement } from '@vue-dnd-kit/core'
import type { TreeNode } from '../../../shared/api/apiTypes'

export type ExplorerDropIntent = 'before' | 'inside' | 'after' | null

export type ResolveExplorerDropTargetOptions = {
  folderPath: string
  targetPath: string
  intent: ExplorerDropIntent
  draggedPaths: string[]
  nodeByPath: Record<string, TreeNode>
  parentByPath: Record<string, string>
  editingPath?: string
  hasActiveFilter: boolean
}

export type ExplorerDropResolution = {
  isValid: boolean
  intent: ExplorerDropIntent
  targetDir: string | null
  reason: 'disabled' | 'editing' | 'target_missing' | 'invalid_intent' | 'self' | 'descendant' | 'same_parent' | null
}

export function normalizeDraggedPaths(paths: string[], parentByPath: Record<string, string>): string[] {
  const unique = Array.from(new Set(paths))
  return unique.filter((path, index) => {
    for (let i = 0; i < index; i += 1) {
      if (isSameOrDescendantPath(path, unique[i], parentByPath)) {
        return false
      }
    }
    return true
  })
}

export function resolveDropIntent(node: TreeNode | null | undefined, placement: IPlacement | undefined): ExplorerDropIntent {
  if (!node || !placement) return null
  if (node.is_dir && placement.center) return 'inside'
  if (!node.is_dir && placement.center) return 'after'
  if (placement.top) return 'before'
  if (placement.bottom) return 'after'
  return null
}

export function resolveExplorerDropTarget(
  options: ResolveExplorerDropTargetOptions
): ExplorerDropResolution {
  const {
    folderPath,
    targetPath,
    intent,
    draggedPaths,
    nodeByPath,
    parentByPath,
    editingPath,
    hasActiveFilter
  } = options

  if (hasActiveFilter) {
    return invalidResolution(intent, 'disabled')
  }

  if (!intent) {
    return invalidResolution(intent, 'invalid_intent')
  }

  if (editingPath && editingPath === targetPath) {
    return invalidResolution(intent, 'editing')
  }

  const targetNode = nodeByPath[targetPath]
  if (!targetNode) {
    return invalidResolution(intent, 'target_missing')
  }

  const targetDir = intent === 'inside'
    ? (targetNode.is_dir ? targetNode.path : null)
    : (parentByPath[targetPath] ?? folderPath)

  if (!targetDir) {
    return invalidResolution(intent, 'invalid_intent')
  }

  for (const path of draggedPaths) {
    if (path === targetDir) {
      return invalidResolution(intent, 'self')
    }
    if (isSameOrDescendantPath(targetDir, path, parentByPath)) {
      return invalidResolution(intent, 'descendant')
    }
  }

  if (intent !== 'inside' && draggedPaths.length > 0) {
    const allFromSameTargetParent = draggedPaths.every((path) => (parentByPath[path] ?? folderPath) === targetDir)
    if (allFromSameTargetParent) {
      return invalidResolution(intent, 'same_parent')
    }
  }

  return {
    isValid: true,
    intent,
    targetDir,
    reason: null
  }
}

function invalidResolution(intent: ExplorerDropIntent, reason: ExplorerDropResolution['reason']): ExplorerDropResolution {
  return {
    isValid: false,
    intent,
    targetDir: null,
    reason
  }
}

function isSameOrDescendantPath(path: string, ancestorPath: string, parentByPath: Record<string, string>): boolean {
  if (path === ancestorPath) return true

  let current = parentByPath[path]
  while (current) {
    if (current === ancestorPath) {
      return true
    }
    current = parentByPath[current]
  }

  return path.startsWith(`${ancestorPath}/`)
}
