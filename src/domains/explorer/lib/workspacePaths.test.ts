import { describe, expect, it } from 'vitest'
import {
  dedupeWorkspacePaths,
  isAbsoluteWorkspacePath,
  isWorkspacePathOrDescendant,
  normalizeWorkspacePath,
  toWorkspaceAbsolutePath,
  toWorkspacePathKey,
  toWorkspaceRelativePath
} from './workspacePaths'

describe('workspacePaths', () => {
  it('normalizes slashes, trims whitespace, removes duplicate separators, and drops leading dot slash', () => {
    expect(normalizeWorkspacePath('  ./notes\\\\today.md  ')).toBe('notes/today.md')
    expect(normalizeWorkspacePath('notes//nested///entry.md')).toBe('notes/nested/entry.md')
  })

  it('strips Windows extended-length prefixes from normalized paths', () => {
    expect(normalizeWorkspacePath('\\\\?\\D:\\vault\\notes\\today.md')).toBe('D:/vault/notes/today.md')
    expect(isAbsoluteWorkspacePath('\\\\?\\D:\\vault\\notes\\today.md')).toBe(true)
  })

  it('normalizes Unicode-equivalent paths to NFC', () => {
    expect(normalizeWorkspacePath('Exe\u0301cution/note.md')).toBe('Exécution/note.md')
    expect(toWorkspacePathKey('Syste\u0300me/Plan.md')).toBe('système/plan.md')
  })

  it('detects unix and windows absolute paths', () => {
    expect(isAbsoluteWorkspacePath('/vault/notes/a.md')).toBe(true)
    expect(isAbsoluteWorkspacePath('C:\\vault\\notes\\a.md')).toBe(true)
    expect(isAbsoluteWorkspacePath('./notes/a.md')).toBe(false)
    expect(isAbsoluteWorkspacePath('')).toBe(false)
  })

  it('resolves relative paths under a workspace and preserves absolute paths', () => {
    expect(toWorkspaceAbsolutePath('/vault', 'notes/a.md')).toBe('/vault/notes/a.md')
    expect(toWorkspaceAbsolutePath('/vault/', './notes/a.md')).toBe('/vault/notes/a.md')
    expect(toWorkspaceAbsolutePath('/vault', '/vault/notes/a.md')).toBe('/vault/notes/a.md')
    expect(toWorkspaceAbsolutePath('/vault', 'C:\\vault\\notes\\a.md')).toBe('C:/vault/notes/a.md')
    expect(toWorkspaceAbsolutePath('D:/vault', '\\\\?\\D:\\vault\\notes\\a.md')).toBe('D:/vault/notes/a.md')
  })

  it('returns relative workspace paths and keeps outside paths normalized', () => {
    expect(toWorkspaceRelativePath('/vault', '/vault/notes/a.md')).toBe('notes/a.md')
    expect(toWorkspaceRelativePath('/vault/', '/vault')).toBe('.')
    expect(toWorkspaceRelativePath('/vault', 'C:\\other\\note.md')).toBe('C:/other/note.md')
  })

  it('detects workspace descendants with a path-segment boundary', () => {
    expect(isWorkspacePathOrDescendant('/vault', '/vault')).toBe(true)
    expect(isWorkspacePathOrDescendant('/vault', '/vault/notes/a.md')).toBe(true)
    expect(isWorkspacePathOrDescendant('/vault', '/vault2/notes/a.md')).toBe(false)
    expect(isWorkspacePathOrDescendant('D:/Vault', 'd:/vault/notes/a.md')).toBe(true)
  })

  it('matches workspace-relative paths case-insensitively for windows paths', () => {
    expect(toWorkspaceRelativePath('d:/vault', 'D:/vault/notes/a.md')).toBe('notes/a.md')
    expect(toWorkspaceRelativePath('D:/vault', 'd:/vault/notes/a.md')).toBe('notes/a.md')
  })

  it('builds canonical path keys case-insensitively', () => {
    expect(toWorkspacePathKey(' Notes\\TODAY.md ')).toBe('notes/today.md')
  })

  it('deduplicates normalized paths while preserving the first normalized occurrence', () => {
    expect(dedupeWorkspacePaths([
      ' ./Notes/A.md ',
      '/vault/b.md',
      'notes/a.md',
      '',
      'C:\\Vault\\c.md',
      'c:/vault/c.md'
    ])).toEqual([
      'Notes/A.md',
      '/vault/b.md',
      'C:/Vault/c.md'
    ])
  })
})
