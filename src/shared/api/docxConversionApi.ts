import { invoke } from '@tauri-apps/api/core'

/**
 * Frontend IPC wrapper for the native Markdown to Word conversion workflow.
 *
 * This transport-only module keeps shell orchestration free from direct
 * `invoke` usage.
 */

/** Converts a Markdown file into DOCX and returns the generated path. */
export async function convertMarkdownToDocx(path: string): Promise<string> {
  return await invoke('convert_markdown_to_docx', { path })
}
