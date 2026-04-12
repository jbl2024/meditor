import { describe, expect, it } from 'vitest'
import { buildNewNoteTemplateItems, NEW_NOTE_TEMPLATE_BLANK_SECTION, NEW_NOTE_TEMPLATE_ROOT_SECTION } from './newNoteTemplates'

describe('buildNewNoteTemplateItems', () => {
  it('groups root and nested templates while keeping blank note first', () => {
    const items = buildNewNoteTemplateItems({
      workspaceRoot: '/vault',
      allWorkspaceFiles: [
        '/vault/_templates/meetings/regular.md',
        '/vault/_templates/root.md',
        '/vault/notes/ignored.md',
        '/vault/_templates/archive/old.markdown',
        '/vault/_templates/meetings/sub/weekly.md',
        '/vault/_templates/meetings/not-markdown.txt'
      ]
    })

    expect(items.map((item) => item.label)).toEqual([
      'Blank note',
      'root.md',
      'old.markdown',
      'regular.md',
      'weekly.md'
    ])
    expect(items[0]).toMatchObject({ group: NEW_NOTE_TEMPLATE_BLANK_SECTION, path: '', kind: 'blank' })
    expect(items[1]).toMatchObject({ group: NEW_NOTE_TEMPLATE_ROOT_SECTION, path: '/vault/_templates/root.md' })
    expect(items[2]).toMatchObject({ group: 'archive', path: '/vault/_templates/archive/old.markdown' })
    expect(items[3]).toMatchObject({ group: 'meetings', path: '/vault/_templates/meetings/regular.md' })
    expect(items[4]).toMatchObject({ group: 'meetings/sub', path: '/vault/_templates/meetings/sub/weekly.md' })
  })

  it('ignores paths outside the templates directory boundary', () => {
    const items = buildNewNoteTemplateItems({
      workspaceRoot: '/vault',
      allWorkspaceFiles: [
        '/vault/_templates-real/escape.md',
        '/vault/_templates',
        '/vault/_templates/visible.md',
        '/vault/_templates/.hidden.md',
        '/vault/_templates/visible.txt'
      ]
    })

    expect(items.map((item) => item.path)).toEqual([
      '',
      '/vault/_templates/.hidden.md',
      '/vault/_templates/visible.md'
    ])
  })
})
