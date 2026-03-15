import { invoke } from '@tauri-apps/api/core'
import type { FileVersion, ReadNoteSnapshotResult, SaveNoteResult } from './apiTypes'

export type SaveNoteBufferRequest = {
  path: string
  content: string
  expectedBaseVersion: FileVersion | null
  requestId: string
  force?: boolean
}

/** Reads note content with its current lightweight file version. */
export async function readNoteSnapshot(path: string): Promise<ReadNoteSnapshotResult> {
  return await invoke('read_note_snapshot', { path })
}

/** Saves note content conditionally against the last synchronized disk version. */
export async function saveNoteBuffer(payload: SaveNoteBufferRequest): Promise<SaveNoteResult> {
  return await invoke('save_note_buffer', { request: payload })
}
