import { describe, expect, it, vi } from 'vitest'
import { classifyLinkClick, useEditorTiptapSetup } from './useEditorTiptapSetup'

describe('useEditorTiptapSetup', () => {
  it('wires update/selection/doc-changed callbacks', () => {
    const onUpdate = vi.fn()
    const onSelectionUpdate = vi.fn()
    const onDocChanged = vi.fn()

    const options = useEditorTiptapSetup({
      extensions: [{ name: 'ext-a' } as never],
      onUpdate,
      onSelectionUpdate,
      onDocChanged
    })

    ;(options.onUpdate as ((payload: unknown) => void) | undefined)?.({})
    ;(options.onSelectionUpdate as ((payload: unknown) => void) | undefined)?.({})
    ;(options.onTransaction as ((payload: unknown) => void) | undefined)?.({ transaction: { docChanged: true } })
    ;(options.onTransaction as ((payload: unknown) => void) | undefined)?.({ transaction: { docChanged: false } })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onSelectionUpdate).toHaveBeenCalledTimes(1)
    expect(onDocChanged).toHaveBeenCalledTimes(1)
    expect(options.extensions).toHaveLength(1)
  })

  it('classifies link click behavior', () => {
    expect(classifyLinkClick({ hasWikilinkTarget: true, hasExternalHref: false, withModifier: false })).toBe('open-wikilink')
    expect(classifyLinkClick({ hasWikilinkTarget: true, hasExternalHref: false, withModifier: true })).toBe('edit-link')
    expect(classifyLinkClick({ hasWikilinkTarget: false, hasExternalHref: true, withModifier: false })).toBe('open-external')
    expect(classifyLinkClick({ hasWikilinkTarget: false, hasExternalHref: false, withModifier: false })).toBe('ignore')
  })
})
