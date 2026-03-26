import { computed, ref, watch, type Ref } from 'vue'
import {
  addWorkspaceSpellcheckIgnoredWord,
  clearWorkspaceSpellcheckIgnoredWords,
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

type WorkspaceSpellcheckStore = {
  ignoredWords: Ref<string[]>
  revision: Ref<number>
}

const workspaceSpellcheckStores = new Map<string, WorkspaceSpellcheckStore>()

function getWorkspaceSpellcheckStore(workspacePath: string): WorkspaceSpellcheckStore {
  const storageKey = workspaceSpellcheckIgnoreStorageKey(workspacePath)
  const existing = workspaceSpellcheckStores.get(storageKey)
  if (existing) return existing
  const store: WorkspaceSpellcheckStore = {
    ignoredWords: ref(readWorkspaceSpellcheckIgnoredWords(workspacePath)),
    revision: ref(0)
  }
  workspaceSpellcheckStores.set(storageKey, store)
  return store
}

export function useWorkspaceSpellcheckDictionary(options: UseWorkspaceSpellcheckDictionaryOptions) {
  const currentStore = computed(() => getWorkspaceSpellcheckStore(options.workspacePath.value))
  const storageKey = computed(() => workspaceSpellcheckIgnoreStorageKey(options.workspacePath.value))
  const ignoredWords = computed(() => currentStore.value.ignoredWords.value)
  const revision = computed(() => currentStore.value.revision.value)

  function syncIgnoredWords() {
    const store = currentStore.value
    store.ignoredWords.value = readWorkspaceSpellcheckIgnoredWords(options.workspacePath.value)
    store.revision.value += 1
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
    currentStore.value.ignoredWords.value = next
    currentStore.value.revision.value += 1
    return next
  }

  function removeIgnoredWord(word: string): string[] {
    const next = removeWorkspaceSpellcheckIgnoredWord(options.workspacePath.value, word)
    currentStore.value.ignoredWords.value = next
    currentStore.value.revision.value += 1
    return next
  }

  function clearIgnoredWords(): string[] {
    const next = clearWorkspaceSpellcheckIgnoredWords(options.workspacePath.value)
    currentStore.value.ignoredWords.value = next
    currentStore.value.revision.value += 1
    return next
  }

  return {
    storageKey,
    ignoredWords,
    revision,
    isIgnoredWord,
    addIgnoredWord,
    removeIgnoredWord,
    clearIgnoredWords,
    syncIgnoredWords
  }
}
