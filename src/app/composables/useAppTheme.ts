import { computed, ref } from 'vue'
import {
  APP_THEMES,
  SYSTEM_DARK_THEME_ID,
  SYSTEM_LIGHT_THEME_ID,
  getAppThemeById,
  isThemeId,
  type ThemeColorScheme,
  type ThemeId
} from '../../shared/lib/themeRegistry'

/**
 * Module: useAppTheme
 *
 * Purpose:
 * - Own app theme preference persistence and DOM class/data-attribute synchronization.
 */

/** Stores the explicit user choice or the sentinel value that follows the OS. */
export type ThemePreference = ThemeId | 'system'

/** Configures storage and environment hooks for the app theme controller. */
export type UseAppThemeOptions = {
  storageKey?: string
  root?: HTMLElement
  matchMedia?: () => boolean
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || isThemeId(value)
}

function normalizePersistedThemePreference(value: string | null): ThemePreference | null {
  if (value === 'light') return SYSTEM_LIGHT_THEME_ID
  if (value === 'dark') return SYSTEM_DARK_THEME_ID
  if (isThemePreference(value)) return value
  return null
}

/** Owns theme preference state and synchronizes theme metadata on the provided root. */
export function useAppTheme(options: UseAppThemeOptions = {}) {
  const storageKey = options.storageKey ?? 'tomosona.theme.preference'
  const themePreference = ref<ThemePreference>('system')
  const isSystemDark = options.matchMedia ?? (() =>
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia) &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  const activeThemeId = computed<ThemeId>(() => {
    if (themePreference.value === 'system') {
      return isSystemDark() ? SYSTEM_DARK_THEME_ID : SYSTEM_LIGHT_THEME_ID
    }
    return themePreference.value
  })

  const activeTheme = computed(() => getAppThemeById(activeThemeId.value))
  const activeColorScheme = computed<ThemeColorScheme>(() => activeTheme.value.colorScheme)

  function resolveThemePreference(preference: ThemePreference): ThemeId {
    if (preference === 'system') {
      return isSystemDark() ? SYSTEM_DARK_THEME_ID : SYSTEM_LIGHT_THEME_ID
    }
    return preference
  }

  function applyResolvedThemeId(themeId: ThemeId) {
    const root = options.root ?? document.documentElement
    const theme = getAppThemeById(themeId)
    root.classList.toggle('dark', theme.colorScheme === 'dark')
    root.dataset.theme = theme.id
    root.dataset.colorScheme = theme.colorScheme
  }

  /** Applies the resolved theme to the configured root element. */
  function applyTheme() {
    applyResolvedThemeId(activeThemeId.value)
  }

  /** Applies a transient preview without mutating or persisting the user preference. */
  function applyThemePreview(preference: ThemePreference) {
    applyResolvedThemeId(resolveThemePreference(preference))
  }

  /** Loads the persisted preference, defaulting back to `system` when absent or invalid. */
  function loadThemePreference() {
    const saved = normalizePersistedThemePreference(window.localStorage.getItem(storageKey))
    if (saved) {
      themePreference.value = saved
      return
    }
    themePreference.value = 'system'
  }

  /** Persists the current preference without altering the DOM. */
  function persistThemePreference() {
    window.localStorage.setItem(storageKey, themePreference.value)
  }

  /** Updates preference, persists it, and synchronizes the DOM in one step. */
  function setThemePreference(next: ThemePreference) {
    themePreference.value = next
    persistThemePreference()
    applyTheme()
  }

  /** Reapplies the theme only when the user follows the system color scheme. */
  function onSystemThemeChanged() {
    if (themePreference.value === 'system') {
      applyTheme()
    }
  }

  return {
    availableThemes: APP_THEMES,
    themePreference,
    activeThemeId,
    activeTheme,
    activeColorScheme,
    applyTheme,
    applyThemePreview,
    loadThemePreference,
    persistThemePreference,
    setThemePreference,
    onSystemThemeChanged
  }
}
