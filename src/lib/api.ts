import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type TreeNode = {
  name: string
  path: string
  is_dir: boolean
  is_markdown: boolean
  has_children: boolean
}

export type ConflictStrategy = 'fail' | 'rename' | 'overwrite'
export type EntryKind = 'file' | 'folder'
export type WorkspaceFsChangeKind = 'created' | 'removed' | 'renamed' | 'modified'

export type WorkspaceFsChange = {
  kind: WorkspaceFsChangeKind
  path?: string
  old_path?: string
  new_path?: string
  parent?: string
  old_parent?: string
  new_parent?: string
  is_dir?: boolean
}

export type WorkspaceFsChangedPayload = {
  session_id: number
  root: string
  changes: WorkspaceFsChange[]
  ts_ms: number
}

export type FileMetadata = {
  created_at_ms: number | null
  updated_at_ms: number | null
}

export async function selectWorkingFolder(): Promise<string | null> {
  return await invoke('select_working_folder')
}

export async function clearWorkingFolder(): Promise<void> {
  await invoke('clear_working_folder')
}

export async function setWorkingFolder(path: string): Promise<string> {
  return await invoke('set_working_folder', { path })
}

export async function listChildren(dirPath: string): Promise<TreeNode[]> {
  return await invoke('list_children', { dirPath })
}

export async function listMarkdownFiles(): Promise<string[]> {
  return await invoke('list_markdown_files')
}

export async function pathExists(path: string): Promise<boolean> {
  return await invoke('path_exists', { path })
}

export async function readTextFile(path: string): Promise<string> {
  return await invoke('read_text_file', { path })
}

export async function readFileMetadata(path: string): Promise<FileMetadata> {
  return await invoke('read_file_metadata', { path })
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke('write_text_file', { path, content })
}

export async function reindexMarkdownFile(path: string): Promise<void> {
  await invoke('reindex_markdown_file', { path })
}

export async function createEntry(
  parentPath: string,
  name: string,
  kind: EntryKind,
  conflictStrategy: ConflictStrategy
): Promise<string> {
  return await invoke('create_entry', { parentPath, name, kind, conflictStrategy })
}

export async function renameEntry(
  path: string,
  newName: string,
  conflictStrategy: ConflictStrategy
): Promise<string> {
  return await invoke('rename_entry', { path, newName, conflictStrategy })
}

export async function duplicateEntry(
  path: string,
  conflictStrategy: ConflictStrategy
): Promise<string> {
  return await invoke('duplicate_entry', { path, conflictStrategy })
}

export async function copyEntry(
  sourcePath: string,
  targetDirPath: string,
  conflictStrategy: ConflictStrategy
): Promise<string> {
  return await invoke('copy_entry', { sourcePath, targetDirPath, conflictStrategy })
}

export async function moveEntry(
  sourcePath: string,
  targetDirPath: string,
  conflictStrategy: ConflictStrategy
): Promise<string> {
  return await invoke('move_entry', { sourcePath, targetDirPath, conflictStrategy })
}

export async function trashEntry(path: string): Promise<string> {
  return await invoke('trash_entry', { path })
}

export async function openPathExternal(path: string): Promise<void> {
  await invoke('open_path_external', { path })
}

export async function openExternalUrl(url: string): Promise<void> {
  await invoke('open_external_url', { url })
}

export async function revealInFileManager(path: string): Promise<void> {
  await invoke('reveal_in_file_manager', { path })
}

export async function initDb(): Promise<void> {
  await invoke('init_db')
}

export async function ftsSearch(query: string): Promise<Array<{ path: string; snippet: string; score: number }>> {
  return await invoke('fts_search', { query })
}

export async function backlinksForPath(path: string): Promise<Array<{ path: string }>> {
  return await invoke('backlinks_for_path', { path })
}

export async function updateWikilinksForRename(
  oldPath: string,
  newPath: string
): Promise<{ updated_files: number }> {
  return await invoke('update_wikilinks_for_rename', { oldPath, newPath })
}

export async function rebuildWorkspaceIndex(): Promise<{ indexed_files: number }> {
  return await invoke('rebuild_workspace_index')
}

export async function readPropertyTypeSchema(): Promise<Record<string, string>> {
  return await invoke('read_property_type_schema')
}

export async function writePropertyTypeSchema(schema: Record<string, string>): Promise<void> {
  await invoke('write_property_type_schema', { schema })
}

export async function listenWorkspaceFsChanged(
  handler: (payload: WorkspaceFsChangedPayload) => void
): Promise<UnlistenFn> {
  return await listen<WorkspaceFsChangedPayload>('workspace://fs-changed', (event) => {
    handler(event.payload)
  })
}
