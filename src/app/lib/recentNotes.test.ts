import { beforeEach, describe, expect, it } from 'vitest'
import {
  readRecentNotes,
  removeRecentNote,
  renameRecentNote,
  upsertRecentNote
} from './recentNotes'

describe('recentNotes', () => {
  const storageKey = 'tomosona:test:recent-notes'

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns an empty list for missing or invalid payloads', () => {
    expect(readRecentNotes(storageKey)).toEqual([])
    window.localStorage.setItem(storageKey, '{bad json')
    expect(readRecentNotes(storageKey)).toEqual([])
  })

  it('sanitizes invalid entries and keeps valid ones ordered by recency', () => {
    window.localStorage.setItem(storageKey, JSON.stringify([
      { path: '/vault/c.md', title: 'C', lastViewedAtMs: 3 },
      { path: '', title: 'missing path', lastViewedAtMs: 4 },
      { path: '/vault/b.md', title: 'B', lastViewedAtMs: 2 },
      { path: '/vault/a.md', title: 'A', lastViewedAtMs: 1 },
      { path: '/vault/d.md', title: 'D', lastViewedAtMs: Number.NaN }
    ]))

    expect(readRecentNotes(storageKey)).toEqual([
      { path: '/vault/c.md', title: 'C', lastViewedAtMs: 3 },
      { path: '/vault/b.md', title: 'B', lastViewedAtMs: 2 },
      { path: '/vault/a.md', title: 'A', lastViewedAtMs: 1 }
    ])
  })

  it('upserts and deduplicates by normalized path', () => {
    upsertRecentNote(storageKey, {
      path: 'C:\\vault\\daily.md',
      title: 'daily',
      lastViewedAtMs: 10
    })
    upsertRecentNote(storageKey, {
      path: 'c:/vault/daily.md',
      title: 'daily renamed',
      lastViewedAtMs: 20
    })

    expect(readRecentNotes(storageKey)).toEqual([
      { path: 'c:/vault/daily.md', title: 'daily renamed', lastViewedAtMs: 20 }
    ])
  })

  it('caps the list at seven entries', () => {
    for (let index = 0; index < 9; index += 1) {
      upsertRecentNote(storageKey, {
        path: `/vault/${index}.md`,
        title: String(index),
        lastViewedAtMs: index
      })
    }

    expect(readRecentNotes(storageKey)).toHaveLength(7)
    expect(readRecentNotes(storageKey)[0]?.path).toBe('/vault/8.md')
  })

  it('removes a persisted note entry', () => {
    upsertRecentNote(storageKey, {
      path: '/vault/a.md',
      title: 'A',
      lastViewedAtMs: 1
    })

    removeRecentNote(storageKey, '/vault/a.md')

    expect(readRecentNotes(storageKey)).toEqual([])
  })

  it('renames a persisted note entry and keeps recency', () => {
    upsertRecentNote(storageKey, {
      path: '/vault/a.md',
      title: 'A',
      lastViewedAtMs: 10
    })

    renameRecentNote(storageKey, '/vault/a.md', '/vault/b.md', 'B')

    expect(readRecentNotes(storageKey)).toEqual([
      { path: '/vault/b.md', title: 'B', lastViewedAtMs: 10 }
    ])
  })

  it('renames with collision by replacing the target entry', () => {
    upsertRecentNote(storageKey, {
      path: '/vault/a.md',
      title: 'A',
      lastViewedAtMs: 10
    })
    upsertRecentNote(storageKey, {
      path: '/vault/b.md',
      title: 'B',
      lastViewedAtMs: 20
    })

    renameRecentNote(storageKey, '/vault/a.md', '/vault/b.md', 'Merged')

    expect(readRecentNotes(storageKey)).toEqual([
      { path: '/vault/b.md', title: 'Merged', lastViewedAtMs: 10 }
    ])
  })
})
