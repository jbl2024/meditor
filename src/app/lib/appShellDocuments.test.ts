import { describe, expect, it } from 'vitest'
import {
  editorSurfaceModeForPath,
  extractHeadingsFromMarkdown,
  hasForbiddenEntryNameChars,
  isReservedEntryName,
  isSourceTextPath,
  markdownExtensionFromPath,
  noteTitleFromPath,
  parentPrefixForModal,
  sourceEditorLanguageLabelForPath,
  resolveExistingWikilinkPath,
  sanitizeTitleForFileName
} from './appShellDocuments'

describe('appShellDocuments', () => {
  it('derives note titles and markdown extensions from paths', () => {
    expect(noteTitleFromPath('/vault/notes/Hello.md')).toBe('Hello')
    expect(markdownExtensionFromPath('/vault/notes/Hello.markdown')).toBe('.markdown')
  })

  it('classifies source text files and editor surfaces by extension', () => {
    expect(isSourceTextPath('/vault/note.txt')).toBe(true)
    expect(isSourceTextPath('/vault/note.md')).toBe(false)
    expect(editorSurfaceModeForPath('/vault/note.md')).toBe('rich')
    expect(editorSurfaceModeForPath('/vault/note.txt')).toBe('source')
    expect(sourceEditorLanguageLabelForPath('/vault/config.toml')).toBe('toml')
    expect(sourceEditorLanguageLabelForPath('/vault/note.md')).toBe('markdown')
  })

  it('sanitizes titles and validates entry names', () => {
    expect(sanitizeTitleForFileName('  con<>:"  ')).toBe('con-note')
    expect(hasForbiddenEntryNameChars('bad:name')).toBe(true)
    expect(isReservedEntryName('nul')).toBe(true)
  })

  it('extracts unique headings from markdown', () => {
    expect(
      extractHeadingsFromMarkdown('# Hello\n## [[Target|Alias]]\n## Alias\n### `Code`')
    ).toEqual(['Hello', 'Alias', 'Code'])
  })

  it('resolves existing wikilink targets by exact, index, and basename match', () => {
    const files = [
      'notes/a.md',
      'journal/2026/03/2026-03-06.md',
      'deep/nested/topic.md',
      'notes/tools/index.md',
      'notes/tools.md'
    ]
    expect(resolveExistingWikilinkPath('notes/a', files)).toBe('notes/a.md')
    expect(resolveExistingWikilinkPath('topic', files)).toBe('deep/nested/topic.md')
    expect(resolveExistingWikilinkPath('notes/tools', files)).toBe('notes/tools.md')
  })

  it('prefers a directory index when the exact markdown file is missing', () => {
    const files = ['notes/tools/index.md']
    expect(resolveExistingWikilinkPath('notes/tools', files)).toBe('notes/tools/index.md')
  })

  it('returns null when neither the file nor its index exists', () => {
    expect(resolveExistingWikilinkPath('notes/tools', [])).toBeNull()
  })

  it('derives a modal prefix from a workspace parent path', () => {
    expect(parentPrefixForModal('/vault/notes/projects', '/vault')).toBe('notes/projects/')
    expect(parentPrefixForModal('/vault', '/vault')).toBe('')
  })

  it('normalizes Windows device-prefixed parent paths before deriving modal prefixes', () => {
    expect(parentPrefixForModal('\\\\?\\D:\\vault\\notes\\projects', 'D:/vault')).toBe('notes/projects/')
  })

  it('derives modal prefixes case-insensitively for matching workspace paths', () => {
    expect(parentPrefixForModal('d:/vault/notes/projects', 'D:/Vault')).toBe('notes/projects/')
  })
})
