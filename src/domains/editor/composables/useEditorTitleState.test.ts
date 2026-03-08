import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useEditorTitleState } from './useEditorTitleState'

describe('useEditorTitleState', () => {
  it('tracks current and committed title by path', () => {
    const path = ref('a.md')
    const state = useEditorTitleState(path)

    state.syncLoadedTitle('a.md', 'Alpha')
    expect(state.currentTitle.value).toBe('Alpha')
    expect(state.isCurrentTitleDirty.value).toBe(false)

    state.setCurrentTitle('a.md', 'Alpha 2')
    expect(state.currentTitle.value).toBe('Alpha 2')
    expect(state.isCurrentTitleDirty.value).toBe(true)

    state.commitTitle('a.md')
    expect(state.currentTitle.value).toBe('Alpha 2')
    expect(state.isCurrentTitleDirty.value).toBe(false)
  })

  it('moves path state on rename', () => {
    const path = ref('a.md')
    const state = useEditorTitleState(path)
    state.syncLoadedTitle('a.md', 'Alpha')
    state.movePathState('a.md', 'b.md')

    expect(state.titleByPath.value['a.md']).toBeUndefined()
    expect(state.titleByPath.value['b.md']).toBe('Alpha')
  })
})
