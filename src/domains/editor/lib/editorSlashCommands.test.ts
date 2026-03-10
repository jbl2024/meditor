import { describe, expect, it } from 'vitest'
import { EDITOR_SLASH_COMMANDS } from './editorSlashCommands'

describe('EDITOR_SLASH_COMMANDS', () => {
  it('contains known command ids and stable ordering', () => {
    expect(EDITOR_SLASH_COMMANDS.map((command) => command.id)).toEqual([
      'heading',
      'bullet',
      'checklist',
      'toc',
      'table',
      'callout',
      'mermaid',
      'code',
      'html',
      'quote',
      'divider'
    ])
  })

  it('defines checklist command with unchecked item payload', () => {
    const checklist = EDITOR_SLASH_COMMANDS.find((command) => command.id === 'checklist')
    expect(checklist?.type).toBe('list')
    expect(checklist?.data).toMatchObject({
      style: 'checklist',
      items: [{ meta: { checked: false } }]
    })
  })

  it('defines a toc command with slash-friendly aliases', () => {
    const toc = EDITOR_SLASH_COMMANDS.find((command) => command.id === 'toc')
    expect(toc).toMatchObject({
      label: 'Table of Contents',
      aliases: ['sommaire'],
      type: 'toc',
      data: {}
    })
  })
})
