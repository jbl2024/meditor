import { invoke } from '@tauri-apps/api/core'

export type TreeNode = {
  name: string
  path: string
  is_dir: boolean
  is_markdown: boolean
  has_children: boolean
}

export type ConflictStrategy = 'fail' | 'rename' | 'overwrite'
export type EntryKind = 'file' | 'folder'

export async function selectWorkingFolder(): Promise<string | null> {
  return await invoke('select_working_folder')
}

export async function listChildren(folderPath: string, dirPath: string): Promise<TreeNode[]> {
  return await invoke('list_children', { folderPath, dirPath })
}

export async function pathExists(folderPath: string, path: string): Promise<boolean> {
  return await invoke('path_exists', { folderPath, path })
}

export async function readTextFile(folderPath: string, path: string): Promise<string> {
  return await invoke('read_text_file', { folderPath, path })
}

export async function writeTextFile(folderPath: string, path: string, content: string): Promise<void> {
  await invoke('write_text_file', { folderPath, path, content })
}

export async function reindexMarkdownFile(folderPath: string, path: string): Promise<void> {
  await invoke('reindex_markdown_file', { folderPath, path })
}

export async function createEntry(
  folderPath: string,
  parentPath: string,
  name: string,
  kind: EntryKind,
  conflictStrategy: ConflictStrategy
): Promise<string> {
  return await invoke('create_entry', { folderPath, parentPath, name, kind, conflictStrategy })
}

export async function renameEntry(
  folderPath: string,
  path: string,
  newName: string,
  conflictStrategy: ConflictStrategy
): Promise<string> {
  return await invoke('rename_entry', { folderPath, path, newName, conflictStrategy })
}

export async function duplicateEntry(
  folderPath: string,
  path: string,
  conflictStrategy: ConflictStrategy
): Promise<string> {
  return await invoke('duplicate_entry', { folderPath, path, conflictStrategy })
}

export async function copyEntry(
  folderPath: string,
  sourcePath: string,
  targetDirPath: string,
  conflictStrategy: ConflictStrategy
): Promise<string> {
  return await invoke('copy_entry', { folderPath, sourcePath, targetDirPath, conflictStrategy })
}

export async function moveEntry(
  folderPath: string,
  sourcePath: string,
  targetDirPath: string,
  conflictStrategy: ConflictStrategy
): Promise<string> {
  return await invoke('move_entry', { folderPath, sourcePath, targetDirPath, conflictStrategy })
}

export async function trashEntry(folderPath: string, path: string): Promise<string> {
  return await invoke('trash_entry', { folderPath, path })
}

export async function openPathExternal(path: string): Promise<void> {
  await invoke('open_path_external', { path })
}

export async function revealInFileManager(path: string): Promise<void> {
  await invoke('reveal_in_file_manager', { path })
}

export async function initDb(folderPath: string): Promise<void> {
  await invoke('init_db', { folderPath })
}

export async function ftsSearch(folderPath: string, query: string): Promise<Array<{ path: string; snippet: string; score: number }>> {
  return await invoke('fts_search', { folderPath, query })
}
