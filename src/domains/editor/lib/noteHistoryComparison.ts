/**
 * Simple note history comparison helpers.
 *
 * The goal is not a full diff engine. We keep the compare logic local and
 * predictable by highlighting the middle region that differs after removing
 * the common prefix and suffix.
 */
export type NoteHistoryComparisonLine = {
  text: string
  changed: boolean
}

export type NoteHistoryComparison = {
  currentLines: NoteHistoryComparisonLine[]
  snapshotLines: NoteHistoryComparisonLine[]
  currentLineCount: number
  snapshotLineCount: number
  sharedPrefixLines: number
  sharedSuffixLines: number
}

function splitLines(value: string): string[] {
  if (value.length === 0) return []
  return value.replace(/\r\n/g, '\n').split('\n')
}

function sharedPrefixLength(left: string[], right: string[]): number {
  const limit = Math.min(left.length, right.length)
  let count = 0
  while (count < limit && left[count] === right[count]) {
    count += 1
  }
  return count
}

function sharedSuffixLength(left: string[], right: string[], prefixLength: number): number {
  const maxLeft = left.length - prefixLength
  const maxRight = right.length - prefixLength
  const limit = Math.min(maxLeft, maxRight)
  let count = 0
  while (count < limit && left[left.length - 1 - count] === right[right.length - 1 - count]) {
    count += 1
  }
  return count
}

function markChangedLines(lines: string[], prefixLength: number, suffixLength: number): NoteHistoryComparisonLine[] {
  return lines.map((text, index) => ({
    text,
    changed: index >= prefixLength && index < lines.length - suffixLength
  }))
}

/** Builds a stable, simple compare view that highlights the changed middle block. */
export function buildNoteHistoryComparison(currentText: string, snapshotText: string): NoteHistoryComparison {
  const currentLines = splitLines(currentText)
  const snapshotLines = splitLines(snapshotText)
  const sharedPrefixLines = sharedPrefixLength(currentLines, snapshotLines)
  const sharedSuffixLines = sharedSuffixLength(currentLines, snapshotLines, sharedPrefixLines)
  return {
    currentLines: markChangedLines(currentLines, sharedPrefixLines, sharedSuffixLines),
    snapshotLines: markChangedLines(snapshotLines, sharedPrefixLines, sharedSuffixLines),
    currentLineCount: currentLines.length,
    snapshotLineCount: snapshotLines.length,
    sharedPrefixLines,
    sharedSuffixLines
  }
}
