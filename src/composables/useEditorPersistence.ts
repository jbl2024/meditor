import { ref } from 'vue'

/**
 * useEditorPersistence
 *
 * Purpose:
 * - Centralize editor persistence state per path (dirty/saving/error/content/scroll/caret).
 *
 * Responsibilities:
 * - Emit status updates consumed by the parent editor shell.
 * - Handle autosave scheduling semantics, including virtual-title retry behavior.
 * - Move path-scoped state during file renames.
 *
 * Boundaries:
 * - Does not read/write files directly; persistence side effects are injected callbacks.
 */
type AutosaveOptions = {
  autosaveIdleMs?: number
  autosaveTitleIdleMs?: number
  autosaveTitleRetryMs?: number
}

type UseEditorPersistenceOptions = {
  emitStatus: (payload: { path: string; dirty: boolean; saving: boolean; saveError: string }) => void
  isEditingVirtualTitle: () => boolean
  saveCurrentFile: (manual?: boolean) => Promise<void>
  autosave?: AutosaveOptions
}

/**
 * Moves a value between keys in a record, preserving immutability.
 */
function moveRecordKey<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
  if (!from || !to || from === to || !(from in record)) return record
  const next = { ...record }
  next[to] = next[from]
  delete next[from]
  return next
}

/**
 * Creates reactive persistence state and write helpers for per-path editor sessions.
 */
export function useEditorPersistence<TCaretSnapshot>(options: UseEditorPersistenceOptions) {
  const loadedTextByPath = ref<Record<string, string>>({})
  const dirtyByPath = ref<Record<string, boolean>>({})
  const scrollTopByPath = ref<Record<string, number>>({})
  const caretByPath = ref<Record<string, TCaretSnapshot>>({})
  const savingByPath = ref<Record<string, boolean>>({})
  const saveErrorByPath = ref<Record<string, string>>({})

  let autosaveTimer: ReturnType<typeof setTimeout> | null = null
  const autosaveIdleMs = options.autosave?.autosaveIdleMs ?? 1800
  const autosaveTitleIdleMs = options.autosave?.autosaveTitleIdleMs ?? 5000
  const autosaveTitleRetryMs = options.autosave?.autosaveTitleRetryMs ?? 1200

  /**
   * Emits the current status snapshot for a path to the parent shell.
   */
  function emitStatus(path: string) {
    options.emitStatus({
      path,
      dirty: Boolean(dirtyByPath.value[path]),
      saving: Boolean(savingByPath.value[path]),
      saveError: saveErrorByPath.value[path] ?? ''
    })
  }

  /**
   * Marks a path as dirty/clean and notifies listeners.
   */
  function setDirty(path: string, dirty: boolean) {
    dirtyByPath.value = {
      ...dirtyByPath.value,
      [path]: dirty
    }
    emitStatus(path)
  }

  /**
   * Marks a path as currently saving/not saving and notifies listeners.
   */
  function setSaving(path: string, saving: boolean) {
    savingByPath.value = {
      ...savingByPath.value,
      [path]: saving
    }
    emitStatus(path)
  }

  /**
   * Stores the latest save error message for a path and notifies listeners.
   */
  function setSaveError(path: string, message: string) {
    saveErrorByPath.value = {
      ...saveErrorByPath.value,
      [path]: message
    }
    emitStatus(path)
  }

  /**
   * Cancels any pending autosave timer.
   */
  function clearAutosaveTimer() {
    if (!autosaveTimer) return
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }

  /**
   * Schedules autosave with title-aware delay semantics.
   */
  function scheduleAutosave() {
    clearAutosaveTimer()
    const delay = options.isEditingVirtualTitle() ? autosaveTitleIdleMs : autosaveIdleMs
    autosaveTimer = setTimeout(() => {
      // Touchy: title edits can trigger path/title normalization during save.
      // Delay once more while the virtual title is actively being edited.
      if (options.isEditingVirtualTitle()) {
        autosaveTimer = setTimeout(() => {
          void options.saveCurrentFile(false)
        }, autosaveTitleRetryMs)
        return
      }
      void options.saveCurrentFile(false)
    }, delay)
  }

  /**
   * Moves all persistence state maps from one path to another (rename flow).
   */
  function movePathState(from: string, to: string) {
    if (!from || !to || from === to) return
    loadedTextByPath.value = moveRecordKey(loadedTextByPath.value, from, to)
    dirtyByPath.value = moveRecordKey(dirtyByPath.value, from, to)
    scrollTopByPath.value = moveRecordKey(scrollTopByPath.value, from, to)
    caretByPath.value = moveRecordKey(caretByPath.value, from, to)
    savingByPath.value = moveRecordKey(savingByPath.value, from, to)
    saveErrorByPath.value = moveRecordKey(saveErrorByPath.value, from, to)
  }

  return {
    loadedTextByPath,
    dirtyByPath,
    scrollTopByPath,
    caretByPath,
    savingByPath,
    saveErrorByPath,
    setDirty,
    setSaving,
    setSaveError,
    clearAutosaveTimer,
    scheduleAutosave,
    movePathState
  }
}
