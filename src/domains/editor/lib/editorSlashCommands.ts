/**
 * editorSlashCommands
 *
 * Central source of truth for slash command metadata displayed by the EditorView
 * command palette. Keeping this data isolated avoids UI orchestration code mixed
 * with static command definitions.
 */

/**
 * Slash command descriptor used by the editor popover.
 */
export type SlashCommand = {
  id: string
  label: string
  aliases?: string[]
  type: string
  data: Record<string, unknown>
}

type ListStyle = 'unordered' | 'ordered' | 'checklist'

/**
 * Builds a minimal EditorJS list payload compatible with each list style.
 */
function emptyListData(style: ListStyle, checked = false) {
  return {
    style,
    meta: {},
    items: [
      {
        content: '',
        meta: style === 'checklist' ? { checked } : {},
        items: []
      }
    ]
  }
}

/**
 * Default slash commands exposed in the editor command menu.
 */
export const EDITOR_SLASH_COMMANDS: SlashCommand[] = [
  { id: 'heading', label: 'Heading', type: 'header', data: { text: '', level: 2 } },
  { id: 'bullet', label: 'List', type: 'list', data: emptyListData('unordered') },
  { id: 'checklist', label: 'Checklist', type: 'list', data: emptyListData('checklist') },
  { id: 'toc', label: 'Table of Contents', aliases: ['sommaire'], type: 'toc', data: {} },
  {
    id: 'toc-top-level',
    label: 'Top-Level Table of Contents',
    aliases: ['toc h1', 'sommaire h1'],
    type: 'toc',
    data: { maxLevel: 1 }
  },
  { id: 'table', label: 'Table', type: 'table', data: { withHeadings: true, content: [['', ''], ['', '']] } },
  { id: 'callout', label: 'Callout', type: 'callout', data: { kind: 'NOTE', message: '' } },
  { id: 'mermaid', label: 'Mermaid', type: 'mermaid', data: { code: 'flowchart TD\n  A[Start] --> B[End]' } },
  { id: 'asset', label: 'Asset', aliases: ['image'], type: 'asset', data: { src: '', alt: '', title: '' } },
  { id: 'code', label: 'Code', type: 'code', data: { code: '' } },
  { id: 'html', label: 'HTML', type: 'html', data: { html: '<div>\n  \n</div>' } },
  { id: 'quote', label: 'Quote', type: 'quote', data: { text: '' } },
  { id: 'divider', label: 'Divider', type: 'delimiter', data: {} }
]
