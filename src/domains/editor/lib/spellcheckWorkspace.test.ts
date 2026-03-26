import { beforeEach, describe, expect, it } from 'vitest'
import {
  addWorkspaceSpellcheckIgnoredWord,
  normalizeWorkspaceSpellcheckWord,
  readWorkspaceSpellcheckIgnoredWords,
  removeWorkspaceSpellcheckIgnoredWord,
  workspaceSpellcheckIgnoreStorageKey
} from './spellcheckWorkspace'

describe('workspace spellcheck ignore list', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('builds a workspace-scoped storage key', () => {
    expect(workspaceSpellcheckIgnoreStorageKey('/Vault')).toContain('spellcheck-ignore')
  })

  it('normalizes ignored words for case-insensitive matching', () => {
    expect(normalizeWorkspaceSpellcheckWord("  C'est  ")).toBe("c'est")
  })

  it('adds, reads, and removes ignored words', () => {
    const workspacePath = '/vault'

    expect(addWorkspaceSpellcheckIgnoredWord(workspacePath, 'Wrld')).toEqual(['wrld'])
    expect(readWorkspaceSpellcheckIgnoredWords(workspacePath)).toEqual(['wrld'])
    expect(addWorkspaceSpellcheckIgnoredWord(workspacePath, 'WRLD')).toEqual(['wrld'])
    expect(removeWorkspaceSpellcheckIgnoredWord(workspacePath, 'wrld')).toEqual([])
    expect(readWorkspaceSpellcheckIgnoredWords(workspacePath)).toEqual([])
  })
})
