/**
 * Editor `@` macro definitions and resolution helpers.
 *
 * This module stays pure so menu rendering, trigger handling, and tests can
 * share one source of truth without depending on Vue or Tiptap state.
 */

export type EditorAtMacroContext = {
  title: string
  path: string
  now: Date
}

export type EditorAtMacroEntry = {
  id: 'today' | 'now' | 'title' | 'path'
  label: string
  group: 'Time' | 'Document'
  description: string
  replacement: string
  aliases: string[]
}

const MACRO_IDS = ['today', 'now', 'title', 'path'] as const

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatLocalDate(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function formatLocalDateTime(now: Date): string {
  return `${formatLocalDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

function fallbackTitleFromPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  const filename = trimmed.split(/[\\/]/).pop() ?? trimmed
  return filename.replace(/\.(md|markdown)$/i, '')
}

function normalizeDocumentTitle(title: string, path: string): string {
  const trimmedTitle = title.trim()
  if (trimmedTitle) return trimmedTitle
  return fallbackTitleFromPath(path)
}

/**
 * Builds the current set of editor `@` macros.
 */
export function buildEditorAtMacroEntries(context: EditorAtMacroContext): EditorAtMacroEntry[] {
  const title = normalizeDocumentTitle(context.title, context.path)
  const path = context.path.trim()
  const now = context.now

  return [
    {
      id: 'today',
      label: 'Today',
      group: 'Time',
      description: 'Insert the current local date',
      replacement: formatLocalDate(now),
      aliases: ['today', 'date']
    },
    {
      id: 'now',
      label: 'Now',
      group: 'Time',
      description: 'Insert the current local date and time',
      replacement: formatLocalDateTime(now),
      aliases: ['now', 'datetime', 'date time']
    },
    {
      id: 'title',
      label: 'Title',
      group: 'Document',
      description: 'Insert the current note title',
      replacement: title,
      aliases: ['title', 'note title', 'document title']
    },
    {
      id: 'path',
      label: 'Path',
      group: 'Document',
      description: 'Insert the current note path',
      replacement: path,
      aliases: ['path', 'file path', 'note path']
    }
  ]
}

/**
 * Resolves a known macro token to its replacement text.
 */
export function resolveEditorAtMacro(token: string, context: EditorAtMacroContext): string | null {
  const normalized = token.trim().toLowerCase()
  if (!normalized) return null
  const entry = buildEditorAtMacroEntries(context).find((macro) => macro.id === normalized)
  return entry?.replacement ?? null
}

/**
 * Returns the stable macro ids supported by the editor.
 */
export function listEditorAtMacroIds(): Array<(typeof MACRO_IDS)[number]> {
  return [...MACRO_IDS]
}
