import { describe, expect, it } from 'vitest'
import { buildEditorAtMacroEntries, listEditorAtMacroIds, resolveEditorAtMacro } from './editorAtMacros'

describe('editorAtMacros', () => {
  it('builds deterministic entries from document metadata and local time', () => {
    const entries = buildEditorAtMacroEntries({
      title: 'Planning note',
      path: 'notes/planning.md',
      now: new Date(2026, 3, 12, 14, 32, 0)
    })

    expect(entries).toEqual([
      {
        id: 'today',
        label: 'Today',
        group: 'Time',
        description: 'Insert the current local date',
        replacement: '2026-04-12',
        aliases: ['today', 'date']
      },
      {
        id: 'now',
        label: 'Now',
        group: 'Time',
        description: 'Insert the current local date and time',
        replacement: '2026-04-12 14:32',
        aliases: ['now', 'datetime', 'date time']
      },
      {
        id: 'title',
        label: 'Title',
        group: 'Document',
        description: 'Insert the current note title',
        replacement: 'Planning note',
        aliases: ['title', 'note title', 'document title']
      },
      {
        id: 'path',
        label: 'Path',
        group: 'Document',
        description: 'Insert the current note path',
        replacement: 'notes/planning.md',
        aliases: ['path', 'file path', 'note path']
      }
    ])
  })

  it('falls back to the file name when the note title is empty', () => {
    const entries = buildEditorAtMacroEntries({
      title: '',
      path: '/vault/notes/planning.md',
      now: new Date(2026, 3, 12, 8, 5, 0)
    })

    expect(entries.find((entry) => entry.id === 'title')?.replacement).toBe('planning')
  })

  it('resolves exact macro ids only', () => {
    const context = {
      title: 'Planning note',
      path: 'notes/planning.md',
      now: new Date(2026, 3, 12, 14, 32, 0)
    }

    expect(resolveEditorAtMacro('today', context)).toBe('2026-04-12')
    expect(resolveEditorAtMacro('title', context)).toBe('Planning note')
    expect(resolveEditorAtMacro('unknown', context)).toBeNull()
  })

  it('exposes the stable v1 macro ids', () => {
    expect(listEditorAtMacroIds()).toEqual(['today', 'now', 'title', 'path'])
  })
})
