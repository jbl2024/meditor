/**
 * Module: useAppSettingsWorkflow
 *
 * Purpose:
 * - Own the shell-level settings hydration and save-result reactions.
 *
 * Boundary:
 * - The settings modal still owns form editing and IPC writes.
 * - This composable only keeps the shell's derived alters state and the
 *   follow-up notifications that App.vue previously handled inline.
 */
import { type Ref } from 'vue'
import type { AppSettingsAlters, WriteAppSettingsResult } from '../../shared/api/apiTypes'
import { readAppSettings } from '../../shared/api/settingsApi'

const DEFAULT_ALTERS_SETTINGS: AppSettingsAlters = {
  default_mode: 'neutral',
  show_badge_in_chat: true,
  default_influence_intensity: 'balanced'
}

export type UseAppSettingsWorkflowOptions = {
  altersSettings: Ref<AppSettingsAlters>
  markIndexOutOfSync: () => void
  notifySuccess: (message: string) => void
  notifyInfo: (message: string) => void
  closeSettingsModal: () => void
}

/**
 * Owns the shell's settings hydration and save-result side effects.
 *
 * The modal and IPC transport stay elsewhere; this composable keeps the root
 * shell's responses explicit and easy to test.
 */
export function useAppSettingsWorkflow(options: UseAppSettingsWorkflowOptions) {
  /**
   * Refreshes the shell's alters settings from disk, falling back to the
   * default model when the settings file cannot be read.
   */
  async function syncAlterSettingsFromDisk() {
    try {
      const settings = await readAppSettings()
      options.altersSettings.value = settings.alters
    } catch {
      options.altersSettings.value = DEFAULT_ALTERS_SETTINGS
    }
  }

  /**
   * Applies the result of a successful settings save to shell state.
   *
   * This keeps the side effects in one place so App.vue does not have to
   * inline the indexing and notification rules.
   */
  function onSettingsSaved(result: WriteAppSettingsResult) {
    options.notifySuccess(`Settings saved at ${result.path}.`)
    options.altersSettings.value = result.alters
    if (result.embeddings_changed) {
      options.markIndexOutOfSync()
      options.notifyInfo('Embedding settings changed. Rebuild index to resync semantic search.')
    }
    options.closeSettingsModal()
  }

  return {
    onSettingsSaved,
    syncAlterSettingsFromDisk
  }
}
