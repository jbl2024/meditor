import { invoke } from '@tauri-apps/api/core'

export type TreeNode = {
  name: string
  path: string
  is_dir: boolean
  children: TreeNode[]
}

export async function selectWorkingFolder(): Promise<string | null> {
  return await invoke('select_working_folder')
}

export async function listTree(path: string): Promise<TreeNode[]> {
  return await invoke('list_tree', { path })
}

export async function readTextFile(path: string): Promise<string> {
  return await invoke('read_text_file', { path })
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke('write_text_file', { path, content })
}

export async function initDb(folderPath: string): Promise<void> {
  await invoke('init_db', { folderPath })
}

export async function ftsSearch(folderPath: string, query: string): Promise<Array<{ path: string; snippet: string; score: number }>> {
  return await invoke('fts_search', { folderPath, query })
}
