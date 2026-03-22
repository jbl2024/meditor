/**
 * Module: appShellPane
 *
 * Purpose:
 * - Host small pure helpers for pane-local tab bookkeeping used by the shell.
 *
 * Boundaries:
 * - No Vue lifecycle or app state ownership.
 * - Callers inject the concrete pane layout and status-clearing callback.
 */

type PaneTab = {
  id: string
  type: string
  path?: string
}

type PaneState = {
  openTabs: PaneTab[]
}

/** Returns the document paths currently open in a pane. */
export function documentPathsForPane(
  panesById: Record<string, PaneState>,
  paneId: string
): string[] {
  const pane = panesById[paneId]
  if (!pane) return []
  return pane.openTabs
    .filter((tab): tab is PaneTab & { type: 'document'; path: string } => tab.type === 'document' && typeof tab.path === 'string')
    .map((tab) => tab.path)
}

/** Clears editor status entries for each path in the provided batch. */
export function clearEditorStatusForPaths(paths: string[], clearStatus: (path: string) => void) {
  for (const path of paths) {
    clearStatus(path)
  }
}
