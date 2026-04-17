import type { TextEditorSession } from './useTextEditorSessions'

/**
 * Status bridge for raw-text editor sessions.
 */
export type UseTextEditorSessionStatusOptions = {
  getSession: (path: string) => TextEditorSession | null
  patchStatus: (path: string, patch: { dirty?: boolean; saving?: boolean; saveError?: string }) => void
  clearAutosaveTimer: () => void
  scheduleAutosave: () => void
}

export function useTextEditorSessionStatus(options: UseTextEditorSessionStatusOptions) {
  function setDirty(path: string, dirty: boolean) {
    const session = options.getSession(path)
    if (!session) return
    session.dirty = dirty
    options.patchStatus(path, { dirty })
  }

  function setSaving(path: string, saving: boolean) {
    const session = options.getSession(path)
    if (!session) return
    session.saving = saving
    options.patchStatus(path, { saving })
  }

  function setSaveError(path: string, message: string) {
    const session = options.getSession(path)
    if (!session) return
    session.saveError = message
    options.patchStatus(path, { saveError: message })
  }

  function clearAutosaveTimer() {
    options.clearAutosaveTimer()
  }

  function scheduleAutosave(path: string) {
    if (!options.getSession(path)) return
    options.scheduleAutosave()
  }

  return {
    setDirty,
    setSaving,
    setSaveError,
    clearAutosaveTimer,
    scheduleAutosave
  }
}
