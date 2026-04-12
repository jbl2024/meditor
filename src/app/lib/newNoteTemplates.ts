import { fileName, isMarkdownPath } from './appShellPaths'
import { isWorkspacePathOrDescendant, normalizeWorkspacePath, toWorkspaceRelativePath } from '../../domains/explorer/lib/workspacePaths'
import type { FilterableDropdownItem } from '../../shared/components/ui/UiFilterableDropdown.vue'

/**
 * Module: newNoteTemplates
 *
 * Purpose:
 * - Derive the shared "new note from template" dropdown catalog from workspace
 *   file paths without touching the filesystem.
 *
 * Boundary:
 * - This module only classifies and labels already-loaded paths.
 * - Template discovery, file reading, and note creation stay in shell workflow
 *   code.
 */

export const NEW_NOTE_TEMPLATE_BLANK_SECTION = 'Start empty'
export const NEW_NOTE_TEMPLATE_ROOT_SECTION = 'Workspace root'
const NEW_NOTE_TEMPLATE_DIR_NAME = '_templates'

/** Dropdown row for the new-note template picker. */
export type NewNoteTemplateDropdownItem = FilterableDropdownItem & {
  path: string
  kind: 'blank' | 'template'
}

type TemplateCandidate = {
  path: string
  relativePath: string
  group: string
}

function templateGroupFromRelativePath(relativePath: string): string {
  const normalized = normalizeWorkspacePath(relativePath)
  if (!normalized || normalized === '.' || !normalized.includes('/')) {
    return NEW_NOTE_TEMPLATE_ROOT_SECTION
  }
  return normalized.slice(0, normalized.lastIndexOf('/')) || NEW_NOTE_TEMPLATE_ROOT_SECTION
}

function groupSortRank(group: string): number {
  if (group === NEW_NOTE_TEMPLATE_ROOT_SECTION) return 0
  return 1
}

function isTemplatePath(workspaceRoot: string, path: string): boolean {
  if (!workspaceRoot) return false
  const templatesRoot = `${normalizeWorkspacePath(workspaceRoot).replace(/\/+$/, '')}/${NEW_NOTE_TEMPLATE_DIR_NAME}`
  return isWorkspacePathOrDescendant(templatesRoot, path)
}

/**
 * Builds the new-note template picker catalog from loaded workspace file paths.
 *
 * Ordering rules:
 * - the blank note entry always appears first
 * - root-level templates are grouped under `Workspace root`
 * - nested templates are grouped by their relative subdirectory
 * - items remain sorted deterministically within each group
 */
export function buildNewNoteTemplateItems(options: {
  workspaceRoot: string
  allWorkspaceFiles: readonly string[]
}): NewNoteTemplateDropdownItem[] {
  const items: NewNoteTemplateDropdownItem[] = [
    {
      id: 'blank-note',
      label: 'Blank note',
      path: '',
      kind: 'blank',
      group: NEW_NOTE_TEMPLATE_BLANK_SECTION
    }
  ]

  const workspaceRoot = normalizeWorkspacePath(options.workspaceRoot).replace(/\/+$/, '')
  if (!workspaceRoot) return items

  const templateRoot = `${workspaceRoot}/${NEW_NOTE_TEMPLATE_DIR_NAME}`
  const candidates: TemplateCandidate[] = options.allWorkspaceFiles
    .map((path) => normalizeWorkspacePath(path))
    .filter((path) => isMarkdownPath(path) && isTemplatePath(workspaceRoot, path))
    .map((path) => {
      const relativePath = toWorkspaceRelativePath(templateRoot, path)
      return {
        path,
        relativePath,
        group: templateGroupFromRelativePath(relativePath)
      }
    })
    .sort((left, right) => {
      const groupRank = groupSortRank(left.group) - groupSortRank(right.group)
      if (groupRank !== 0) return groupRank
      const groupComparison = left.group.localeCompare(right.group)
      if (groupComparison !== 0) return groupComparison
      return left.path.localeCompare(right.path)
    })

  for (const candidate of candidates) {
    items.push({
      id: `template:${candidate.relativePath}`,
      label: fileName(candidate.path),
      path: candidate.path,
      kind: 'template',
      group: candidate.group
    })
  }

  return items
}
