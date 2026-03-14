/**
 * Module: explorerFilter
 *
 * Purpose:
 * - Keep explorer tree filtering pure and testable.
 * - Preserve tree context by keeping ancestor directories for matching rows.
 *
 * Boundaries:
 * - This module never performs I/O or mutates explorer state.
 * - It only derives visible rows from already loaded tree snapshots.
 */

import type { TreeNode } from '../../../shared/api/apiTypes'
import type { ExplorerVisibleRow } from '../composables/useExplorerTreeState'

type FilterTreeOptions = {
  rootPath: string
  childrenByDir: Record<string, TreeNode[]>
}

/**
 * Returns the explorer rows visible for the given filter query.
 *
 * Behavior:
 * - empty queries keep the current expanded/collapsed visible rows unchanged
 * - non-empty queries walk the loaded tree, keep fuzzy matches, and retain
 *   ancestor directories so result rows still read like a tree
 */
export function filterExplorerRows(
  query: string,
  visibleRows: ExplorerVisibleRow[],
  options: FilterTreeOptions
): ExplorerVisibleRow[] {
  const normalizedQuery = normalizeForSearch(query)
  if (!normalizedQuery) {
    return visibleRows
  }

  return collectMatches(options.rootPath, 0, options.childrenByDir, normalizedQuery)
}

function collectMatches(
  dirPath: string,
  depth: number,
  childrenByDir: Record<string, TreeNode[]>,
  normalizedQuery: string
): ExplorerVisibleRow[] {
  const rows: ExplorerVisibleRow[] = []
  const children = childrenByDir[dirPath] ?? []

  for (const child of children) {
    const descendantRows = child.is_dir
      ? collectMatches(child.path, depth + 1, childrenByDir, normalizedQuery)
      : []
    const matchesSelf = matchesExplorerQuery(child, normalizedQuery)

    if (!matchesSelf && !descendantRows.length) {
      continue
    }

    rows.push({ path: child.path, depth })
    rows.push(...descendantRows)
  }

  return rows
}

function matchesExplorerQuery(node: TreeNode, normalizedQuery: string): boolean {
  const name = normalizeForSearch(node.name)
  const path = normalizeForSearch(node.path)
  return fuzzyIncludes(name, normalizedQuery) || fuzzyIncludes(path, normalizedQuery)
}

function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function fuzzyIncludes(candidate: string, query: string): boolean {
  if (!query) return true
  if (candidate.includes(query)) return true

  let queryIndex = 0
  for (const char of candidate) {
    if (char === query[queryIndex]) {
      queryIndex += 1
      if (queryIndex === query.length) {
        return true
      }
    }
  }

  return false
}
