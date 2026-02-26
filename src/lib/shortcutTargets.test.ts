import { describe, expect, it } from 'vitest'

import { shouldBlockGlobalShortcutsFromTarget } from './shortcutTargets'

describe('shouldBlockGlobalShortcutsFromTarget', () => {
  it('does not block when target is null', () => {
    expect(shouldBlockGlobalShortcutsFromTarget(null)).toBe(false)
  })

  it('blocks for regular form controls', () => {
    expect(shouldBlockGlobalShortcutsFromTarget(document.createElement('input'))).toBe(true)
    expect(shouldBlockGlobalShortcutsFromTarget(document.createElement('textarea'))).toBe(true)
    expect(shouldBlockGlobalShortcutsFromTarget(document.createElement('select'))).toBe(true)
  })

  it('allows shortcuts in search panel input', () => {
    const input = document.createElement('input')
    input.setAttribute('data-search-input', 'true')
    expect(shouldBlockGlobalShortcutsFromTarget(input)).toBe(false)
  })

  it('blocks contenteditable outside editor shell', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    expect(shouldBlockGlobalShortcutsFromTarget(div)).toBe(true)
  })

  it('allows contenteditable inside editor shell', () => {
    const shell = document.createElement('div')
    shell.className = 'editor-shell'
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    shell.appendChild(editable)
    document.body.appendChild(shell)

    expect(shouldBlockGlobalShortcutsFromTarget(editable)).toBe(false)

    shell.remove()
  })
})
