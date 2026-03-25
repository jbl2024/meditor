/**
 * Shared editor interaction helpers used by keyboard/paste handlers.
 */
import type { EditorView } from '@tiptap/pm/view'
import { clipboardHtmlToMarkdown } from './markdownBlocks'

type ListStyle = 'unordered' | 'ordered' | 'checklist'

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
 * Converts typed markdown block markers into EditorJS block replacements.
 */
export function applyMarkdownShortcut(marker: string): { type: string; data: Record<string, unknown> } | null {
  // Detects ATX heading content, e.g. "## Roadmap".
  const headingWithTextMatch = marker.match(/^(#{1,6})\s+(.+)$/)
  if (headingWithTextMatch) {
    return {
      type: 'header',
      data: { text: headingWithTextMatch[2].trim(), level: headingWithTextMatch[1].length }
    }
  }

  // Detects checklist markers, e.g. "[ ]", "[x]", "- [x]".
  const checklistMatch = marker.match(/^(-\s*)?\[([ xX]?)\]$/)
  if (checklistMatch) {
    return {
      type: 'list',
      data: emptyListData('checklist', checklistMatch[2].toLowerCase() === 'x')
    }
  }

  switch (marker) {
    case '-':
    case '*':
    case '+':
      return { type: 'list', data: emptyListData('unordered') }
    case '1.':
      return { type: 'list', data: emptyListData('ordered') }
    case '>':
      return { type: 'quote', data: { text: '' } }
    case '```':
      return { type: 'code', data: { code: '' } }
    default:
      break
  }

  // Detects ATX heading markers, e.g. "#", "##", "######".
  if (/^#{1,6}$/.test(marker)) {
    return {
      type: 'header',
      data: { text: '', level: marker.length }
    }
  }

  return null
}

export function isEditorZoomModifier(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey'>): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey
}

export function isZoomInShortcut(event: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
  return (
    event.key === '=' ||
    event.key === '+' ||
    event.code === 'Equal' ||
    event.code === 'NumpadAdd'
  )
}

export function isZoomOutShortcut(event: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
  return (
    event.key === '-' ||
    event.key === '_' ||
    event.code === 'Minus' ||
    event.code === 'NumpadSubtract'
  )
}

export function isZoomResetShortcut(event: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
  return event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0'
}

/**
 * Adjusts a heading level when Tab is pressed at the start of the block.
 *
 * This keeps heading tab navigation local to the editor and prevents the browser
 * from moving focus into adjacent chrome, which is especially important on Linux
 * where contenteditable focus traversal is more aggressive.
 */
export function adjustHeadingLevelFromTab(
  view: EditorView,
  event: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'preventDefault' | 'stopPropagation'>
): boolean {
  if (event.key !== 'Tab' && event.key !== 'ISO_Left_Tab' && event.code !== 'Tab') return false

  const { selection } = view.state
  if (!selection.empty) return false

  const { $from } = selection
  const parent = $from.parent
  if (parent.type.name !== 'heading') return false
  if ($from.parentOffset !== 0) return false

  const currentLevel = Number(parent.attrs?.level ?? 1)
  const nextLevel = Math.max(1, Math.min(6, currentLevel + (event.shiftKey ? -1 : 1)))

  event.preventDefault()
  event.stopPropagation()

  if (nextLevel === currentLevel) return true

  const headingPos = $from.before($from.depth)
  view.dispatch(
    view.state.tr.setNodeMarkup(headingPos, undefined, {
      ...parent.attrs,
      level: nextLevel
    })
  )
  return true
}

export function looksLikeMarkdown(text: string): boolean {
  // Detects common markdown starters, e.g. "# h1", "- item", "1. item", "> quote", "```", "[a](b)", "[[note|alias]]".
  return /(^#{1,6}\s)|(^\s*[-*+]\s)|(^\s*[-*+]\s+\[[ xX]?\])|(^\s*\d+\.\s)|(^>\s)|(```)|(\[[^\]]+\]\([^)]+\))|(\[\[[^\]]+\]\])/m.test(text)
}

export function isLikelyMarkdownPaste(plain: string, html: string): boolean {
  if (!plain.trim()) return false
  if (!looksLikeMarkdown(plain)) return false
  if (!html) return true
  return true
}

type SmartPasteSource = 'html' | 'plain'

export function selectSmartPasteMarkdown(
  plain: string,
  html: string
): { markdown: string; source: SmartPasteSource } | null {
  const htmlMarkdown = clipboardHtmlToMarkdown(html)
  if (htmlMarkdown) {
    const normalized = htmlMarkdown.trim()
    const hasBlockSignals =
      /(^#{1,6}\s)|(^\s*[-*+]\s)|(^\s*\d+\.\s)|(^>\s)|(^```)|(^\|.*\|)/m.test(normalized) ||
      /\[\[[^\]]+\]\]/.test(normalized) ||
      normalized.includes('\n')
    if (hasBlockSignals) {
      return { markdown: htmlMarkdown, source: 'html' }
    }
  }

  const plainText = String(plain ?? '')
  if (plainText.trim() && looksLikeMarkdown(plainText)) {
    return { markdown: plainText, source: 'plain' }
  }

  return null
}
