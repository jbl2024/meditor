import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppSpellcheckPreference } from './useAppSpellcheckPreference'

describe('useAppSpellcheckPreference', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('defaults to disabled and persists the current state', () => {
    const api = useAppSpellcheckPreference()

    expect(api.spellcheckEnabled.value).toBe(false)

    api.persistSpellcheckPreference()
    expect(window.localStorage.getItem('tomosona.spellcheck.enabled')).toBe('0')
  })

  it('loads persisted values and toggles the preference', () => {
    window.localStorage.setItem('tomosona.spellcheck.enabled', '1')
    const api = useAppSpellcheckPreference()

    api.loadSpellcheckPreference()
    expect(api.spellcheckEnabled.value).toBe(true)

    expect(api.toggleSpellcheckEnabled()).toBe(false)
    expect(window.localStorage.getItem('tomosona.spellcheck.enabled')).toBe('0')

    api.setSpellcheckEnabled(true)
    expect(api.spellcheckEnabled.value).toBe(true)
    expect(window.localStorage.getItem('tomosona.spellcheck.enabled')).toBe('1')
  })
})
