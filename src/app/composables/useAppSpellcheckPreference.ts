import { ref } from 'vue'

/**
 * Module: useAppSpellcheckPreference
 *
 * Purpose:
 * - Own the app-wide spellcheck enablement preference and its localStorage sync.
 *
 * Boundary:
 * - The preference is global across workspaces.
 * - The caller decides how to surface the toggle in UI and how to react to changes.
 */

/** Shared storage key for the app-wide spellcheck preference. */
export const SPELLCHECK_ENABLED_STORAGE_KEY = 'tomosona.spellcheck.enabled'

/** Declares the storage key used to persist the global spellcheck preference. */
export type UseAppSpellcheckPreferenceOptions = {
  storageKey?: string
}

function normalizePersistedSpellcheckPreference(value: string | null): boolean {
  return value === '1'
}

/** Owns the global spellcheck enablement flag and its persistence contract. */
export function useAppSpellcheckPreference(options: UseAppSpellcheckPreferenceOptions = {}) {
  const storageKey = options.storageKey ?? SPELLCHECK_ENABLED_STORAGE_KEY
  const spellcheckEnabled = ref(false)

  /** Loads the persisted preference, defaulting to disabled when absent or invalid. */
  function loadSpellcheckPreference() {
    if (typeof window === 'undefined') return
    spellcheckEnabled.value = normalizePersistedSpellcheckPreference(window.localStorage.getItem(storageKey))
  }

  /** Persists the current spellcheck preference without altering the UI. */
  function persistSpellcheckPreference() {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, spellcheckEnabled.value ? '1' : '0')
  }

  /** Updates the global spellcheck preference and persists it immediately. */
  function setSpellcheckEnabled(next: boolean) {
    spellcheckEnabled.value = Boolean(next)
    persistSpellcheckPreference()
  }

  /** Flips the global spellcheck preference and returns the new state. */
  function toggleSpellcheckEnabled() {
    setSpellcheckEnabled(!spellcheckEnabled.value)
    return spellcheckEnabled.value
  }

  return {
    spellcheckEnabled,
    loadSpellcheckPreference,
    persistSpellcheckPreference,
    setSpellcheckEnabled,
    toggleSpellcheckEnabled
  }
}
