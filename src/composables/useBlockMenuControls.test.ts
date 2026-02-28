import { describe, expect, it } from 'vitest'
import { useBlockMenuControls } from './useBlockMenuControls'

describe('useBlockMenuControls', () => {
  it('builds base and convert action lists from active target', () => {
    const controls = useBlockMenuControls({
      getEditor: () => null,
      turnIntoTypes: ['paragraph', 'heading1'],
      turnIntoLabels: {
        paragraph: 'Paragraph',
        heading1: 'Heading 1'
      } as never
    })

    controls.blockMenuTarget.value = {
      pos: 5,
      nodeSize: 2,
      nodeType: 'paragraph',
      text: 'Hello',
      isVirtualTitle: false,
      canDelete: true,
      canConvert: true
    }

    expect(controls.actions.value.some((item) => item.id === 'delete' && item.disabled === false)).toBe(true)
    expect(controls.actions.value.some((item) => item.id === 'move_up' && item.disabled === true)).toBe(true)
    expect(controls.convertActions.value).toHaveLength(2)
  })
})
