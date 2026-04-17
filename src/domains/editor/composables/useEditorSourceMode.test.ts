import { ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { useEditorSourceMode } from './useEditorSourceMode'

describe('useEditorSourceMode', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('defaults markdown files to rich mode and text files to source mode', () => {
    const currentPath = ref('notes/a.md')
    const mode = useEditorSourceMode(currentPath)

    expect(mode.isSourceMode('notes/a.md')).toBe(false)
    expect(mode.isSourceMode('notes/config.toml')).toBe(true)
    expect(mode.isSourceMode('notes/readme.txt')).toBe(true)
  })

  it('persists markdown source mode overrides and moves them across renames', () => {
    const currentPath = ref('notes/a.md')
    const mode = useEditorSourceMode(currentPath)

    mode.setMarkdownSourceMode('notes/a.md', true)
    expect(mode.isSourceMode('notes/a.md')).toBe(true)

    mode.movePath('notes/a.md', 'notes/b.md')
    expect(mode.isSourceMode('notes/a.md')).toBe(false)
    expect(mode.isSourceMode('notes/b.md')).toBe(true)

    mode.setMarkdownSourceMode('notes/b.md', false)
    expect(mode.isSourceMode('notes/b.md')).toBe(false)
  })
})
