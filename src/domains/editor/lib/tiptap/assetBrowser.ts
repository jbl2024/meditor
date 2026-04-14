import { fileName } from '../../../../app/lib/appShellPaths'
import {
  decodeWorkspacePathSegments,
  normalizeWorkspacePath,
  toWorkspacePathKey,
  toWorkspaceRelativePath
} from '../../../explorer/lib/workspacePaths'
import type { FilterableDropdownItem } from '../../../../shared/components/ui/UiFilterableDropdown.vue'

/**
 * Module: assetBrowser
 *
 * Purpose:
 * - Build the flat media catalog shown by the asset editor browser.
 * - Keep filtering, labeling, and de-duplication pure so the UI can stay thin.
 *
 * Boundary:
 * - This module does not inspect the filesystem.
 * - Callers must provide already-loaded workspace paths.
 */

export type AssetBrowserDropdownItem = FilterableDropdownItem & {
  path: string
  meta: string
}

const MEDIA_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])

function mediaExtension(path: string): string {
  const normalized = normalizeWorkspacePath(path)
  const lastSegment = normalized.split('/').pop() ?? ''
  const dotIndex = lastSegment.lastIndexOf('.')
  if (dotIndex < 0) return ''
  return lastSegment.slice(dotIndex + 1).toLowerCase()
}

function isMediaPath(path: string): boolean {
  return MEDIA_EXTENSIONS.has(mediaExtension(path))
}

/**
 * Builds the workspace media browser catalog from loaded workspace file paths.
 *
 * Ordering rules:
 * - items are deduplicated by canonical path key
 * - filenames are used as the primary label
 * - the relative path is preserved as secondary context for disambiguation
 */
export function buildAssetBrowserItems(options: {
  workspaceRoot: string
  allWorkspaceFiles: readonly string[]
}): AssetBrowserDropdownItem[] {
  const workspaceRoot = normalizeWorkspacePath(options.workspaceRoot).replace(/\/+$/, '')
  if (!workspaceRoot) return []

  const seen = new Set<string>()
  const items: AssetBrowserDropdownItem[] = []

  for (const candidatePath of options.allWorkspaceFiles) {
    const path = decodeWorkspacePathSegments(candidatePath)
    if (!path || !isMediaPath(path)) continue

    const normalized = normalizeWorkspacePath(path)
    const key = toWorkspacePathKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)

    const relativePath = toWorkspaceRelativePath(workspaceRoot, normalized)
    items.push({
      id: `asset-media:${key}`,
      label: fileName(normalized),
      meta: relativePath,
      path: normalized
    })
  }

  items.sort((left, right) => {
    const labelComparison = left.label.localeCompare(right.label)
    if (labelComparison !== 0) return labelComparison
    const metaComparison = left.meta.localeCompare(right.meta)
    if (metaComparison !== 0) return metaComparison
    return left.path.localeCompare(right.path)
  })

  return items
}
