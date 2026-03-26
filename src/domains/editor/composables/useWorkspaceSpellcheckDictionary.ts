import { computed, ref, watch, type Ref } from 'vue'
import {
  addWorkspaceSpellcheckIgnoredWord,
  normalizeWorkspaceSpellcheckWord,
  readWorkspaceSpellcheckIgnoredWords,
  removeWorkspaceSpellcheckIgnoredWord,
  workspaceSpellcheckIgnoreStorageKey
} from '../lib/spellcheckWorkspace'

/**
 * Module: useWorkspaceSpellcheckDictionary
 *
 * Purpose:
 * - Own a workspace-scoped personal dictionary/ignore list for editor spellcheck.
 *
 * Boundary:
 * - Persistence stays in localStorage because the list is workspace-specific and
 *   intentionally lightweight. The caller decides when to refresh spellcheck UI.
 */
export type UseWorkspaceSpellcheckDictionaryOptions = {
  workspacePath: Ref<string>
}

export function useWorkspaceSpellcheckDictionary(options: UseWorkspaceSpellcheckDictionaryOptions) {
  const ignoredWords = ref<string[]>([])
  const revision = ref(0)

  const storageKey = computed(() => workspaceSpellcheckIgnoreStorageKey(options.workspacePath.value))

  function syncIgnoredWords() {
    ignoredWords.value = readWorkspaceSpellcheckIgnoredWords(options.workspacePath.value)
    revision.value += 1
  }

  watch(
    () => options.workspacePath.value,
    () => {
      syncIgnoredWords()
    },
    { immediate: true }
  )

  function isIgnoredWord(word: string): boolean {
    const normalized = normalizeWorkspaceSpellcheckWord(word)
    if (!normalized) return false
    return ignoredWords.value.includes(normalized)
  }

  function addIgnoredWord(word: string): string[] {
    const next = addWorkspaceSpellcheckIgnoredWord(options.workspacePath.value, word)
    ignoredWords.value = next
    revision.value += 1
    return next
  }

  function removeIgnoredWord(word: string): string[] {
    const next = removeWorkspaceSpellcheckIgnoredWord(options.workspacePath.value, word)
    ignoredWords.value = next
    revision.value += 1
    return next
  }

  return {
    storageKey,
    ignoredWords,
    revision,
    isIgnoredWord,
    addIgnoredWord,
    removeIgnoredWord,
    syncIgnoredWords
  }
}
