import { describe, expect, it } from 'vitest'
import appSource from './app/App.vue?raw'

describe('App shell contract', () => {
  it('keeps derived shell view models out of App.vue', () => {
    expect(appSource).not.toContain('const shortcutSections = computed(()')
    expect(appSource).not.toContain('const metadataRows = computed(()')
    expect(appSource).not.toContain('const cosmosPaneViewModel = computed<')
    expect(appSource).not.toContain('const backHistoryItems = computed(()')
    expect(appSource).toContain('useAppShellViewModels')
  })
})
