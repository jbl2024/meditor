import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { AboutMetadata } from './apiTypes'

/**
 * Frontend IPC wrappers for application-level metadata and shell actions that
 * are not tied to a workspace path.
 */

/** Reads support metadata displayed in the About modal. */
export async function readAboutMetadata(): Promise<AboutMetadata> {
  return await invoke('read_about_metadata')
}

/** Opens the application support directory in the host file manager. */
export async function openAppSupportDir(): Promise<void> {
  await invoke('open_app_support_dir')
}

/** Opens an external URL using the host operating system browser. */
export async function openExternalWebUrl(url: string): Promise<void> {
  await openUrl(url)
}
