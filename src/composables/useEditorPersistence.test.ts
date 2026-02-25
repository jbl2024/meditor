import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useEditorPersistence } from './useEditorPersistence'

type CaretSnapshot = { kind: 'text-input'; blockIndex: number; offset: number }

describe('useEditorPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits status updates when dirty/saving/error changes', () => {
    const emitStatus = vi.fn()
    const saveCurrentFile = vi.fn(async () => {})
    const persistence = useEditorPersistence<CaretSnapshot>({
      emitStatus,
      isEditingVirtualTitle: () => false,
      saveCurrentFile
    })

    persistence.setDirty('notes/a.md', true)
    persistence.setSaving('notes/a.md', true)
    persistence.setSaveError('notes/a.md', 'boom')

    expect(emitStatus).toHaveBeenCalledTimes(3)
    expect(emitStatus).toHaveBeenLastCalledWith({
      path: 'notes/a.md',
      dirty: true,
      saving: true,
      saveError: 'boom'
    })
  })

  it('schedules autosave after idle delay', async () => {
    const saveCurrentFile = vi.fn(async () => {})
    const persistence = useEditorPersistence<CaretSnapshot>({
      emitStatus: vi.fn(),
      isEditingVirtualTitle: () => false,
      saveCurrentFile
    })

    persistence.scheduleAutosave()
    await vi.advanceTimersByTimeAsync(1799)
    expect(saveCurrentFile).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(saveCurrentFile).toHaveBeenCalledWith(false)
  })

  it('defers autosave once more while title is still being edited', async () => {
    const saveCurrentFile = vi.fn(async () => {})
    let titleEditing = true
    const persistence = useEditorPersistence<CaretSnapshot>({
      emitStatus: vi.fn(),
      isEditingVirtualTitle: () => titleEditing,
      saveCurrentFile
    })

    persistence.scheduleAutosave()
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveCurrentFile).not.toHaveBeenCalled()

    titleEditing = false
    await vi.advanceTimersByTimeAsync(1200)
    expect(saveCurrentFile).toHaveBeenCalledWith(false)
  })

  it('moves state maps when a file path changes', () => {
    const persistence = useEditorPersistence<CaretSnapshot>({
      emitStatus: vi.fn(),
      isEditingVirtualTitle: () => false,
      saveCurrentFile: async () => {}
    })

    persistence.loadedTextByPath.value['old.md'] = 'hello'
    persistence.dirtyByPath.value['old.md'] = true
    persistence.scrollTopByPath.value['old.md'] = 12
    persistence.caretByPath.value['old.md'] = { kind: 'text-input', blockIndex: 1, offset: 5 }
    persistence.savingByPath.value['old.md'] = false
    persistence.saveErrorByPath.value['old.md'] = ''

    persistence.movePathState('old.md', 'new.md')

    expect(persistence.loadedTextByPath.value['new.md']).toBe('hello')
    expect(persistence.dirtyByPath.value['new.md']).toBe(true)
    expect(persistence.scrollTopByPath.value['new.md']).toBe(12)
    expect(persistence.caretByPath.value['new.md']).toEqual({ kind: 'text-input', blockIndex: 1, offset: 5 })
    expect(persistence.loadedTextByPath.value['old.md']).toBeUndefined()
  })
})
