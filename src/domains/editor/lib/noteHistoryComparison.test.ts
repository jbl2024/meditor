import { describe, expect, it } from 'vitest'
import { buildNoteHistoryComparison } from './noteHistoryComparison'

describe('buildNoteHistoryComparison', () => {
  it('marks the changed middle block after stripping shared prefix and suffix', () => {
    const comparison = buildNoteHistoryComparison(
      ['alpha', 'beta', 'gamma', 'omega'].join('\n'),
      ['alpha', 'beta', 'delta', 'omega'].join('\n')
    )

    expect(comparison.sharedPrefixLines).toBe(2)
    expect(comparison.sharedSuffixLines).toBe(1)
    expect(comparison.currentLines.map((line) => line.changed)).toEqual([false, false, true, false])
    expect(comparison.snapshotLines.map((line) => line.changed)).toEqual([false, false, true, false])
  })

  it('marks all lines as changed when the texts are unrelated', () => {
    const comparison = buildNoteHistoryComparison('one\ntwo', 'alpha\nbeta')

    expect(comparison.sharedPrefixLines).toBe(0)
    expect(comparison.sharedSuffixLines).toBe(0)
    expect(comparison.currentLines.every((line) => line.changed)).toBe(true)
    expect(comparison.snapshotLines.every((line) => line.changed)).toBe(true)
  })
})
