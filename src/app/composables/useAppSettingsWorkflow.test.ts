import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettingsAlters } from '../../shared/api/apiTypes'
import { useAppSettingsWorkflow } from './useAppSettingsWorkflow'

const settingsApi = vi.hoisted(() => ({
  readAppSettings: vi.fn()
}))

vi.mock('../../shared/api/settingsApi', () => settingsApi)

describe('useAppSettingsWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsApi.readAppSettings.mockResolvedValue({
      exists: true,
      path: '/vault/.tomosona/conf.json',
      llm: null,
      embeddings: {
        mode: 'internal',
        external: null
      },
      alters: {
        default_mode: 'last_used',
        show_badge_in_chat: false,
        default_influence_intensity: 'strong'
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function createWorkflow() {
    const altersSettings = ref<AppSettingsAlters>({
      default_mode: 'neutral',
      show_badge_in_chat: true,
      default_influence_intensity: 'balanced'
    })
    const markIndexOutOfSync = vi.fn()
    const notifySuccess = vi.fn()
    const notifyInfo = vi.fn()
    const closeSettingsModal = vi.fn()

    const workflow = useAppSettingsWorkflow({
      altersSettings,
      markIndexOutOfSync,
      notifySuccess,
      notifyInfo,
      closeSettingsModal
    })

    return {
      altersSettings,
      markIndexOutOfSync,
      notifySuccess,
      notifyInfo,
      closeSettingsModal,
      workflow
    }
  }

  it('hydrates alters settings from disk', async () => {
    const mounted = createWorkflow()

    await mounted.workflow.syncAlterSettingsFromDisk()

    expect(settingsApi.readAppSettings).toHaveBeenCalledTimes(1)
    expect(mounted.altersSettings.value).toEqual({
      default_mode: 'last_used',
      show_badge_in_chat: false,
      default_influence_intensity: 'strong'
    })
  })

  it('falls back to the default alters settings when disk read fails', async () => {
    settingsApi.readAppSettings.mockRejectedValueOnce(new Error('missing settings'))
    const mounted = createWorkflow()

    await mounted.workflow.syncAlterSettingsFromDisk()

    expect(mounted.altersSettings.value).toEqual({
      default_mode: 'neutral',
      show_badge_in_chat: true,
      default_influence_intensity: 'balanced'
    })
  })

  it('applies save results and marks indexing out of sync when embeddings change', () => {
    const mounted = createWorkflow()

    mounted.workflow.onSettingsSaved({
      path: '/vault/.tomosona/conf.json',
      embeddings_changed: true,
      alters: {
        default_mode: 'last_used',
        show_badge_in_chat: false,
        default_influence_intensity: 'strong'
      }
    })

    expect(mounted.notifySuccess).toHaveBeenCalledWith('Settings saved at /vault/.tomosona/conf.json.')
    expect(mounted.altersSettings.value.default_mode).toBe('last_used')
    expect(mounted.markIndexOutOfSync).toHaveBeenCalledTimes(1)
    expect(mounted.notifyInfo).toHaveBeenCalledWith('Embedding settings changed. Rebuild index to resync semantic search.')
    expect(mounted.closeSettingsModal).toHaveBeenCalledTimes(1)
  })
})
