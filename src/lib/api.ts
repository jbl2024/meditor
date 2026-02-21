import { invoke } from '@tauri-apps/api/core'

export async function listDir(path: string): Promise<string[]> {
  return await invoke('list_dir', { path })
}

export async function readTextFile(path: string): Promise<string> {
  return await invoke('read_text_file', { path })
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke('write_text_file', { path, content })
}

export async function initDb(): Promise<void> {
  await invoke('init_db', {})
}

export async function ftsSearch(query: string): Promise<Array<{ path: string; snippet: string; score: number }>> {
  return await invoke('fts_search', { query })
}
