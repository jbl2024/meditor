import { describe, expect, it } from 'vitest'
import { toEchoesPack } from './echoes'
import type { EchoesPackDto } from './echoes'

describe('toEchoesPack', () => {
  it('maps snake_case DTO fields to camelCase', () => {
    const dto: EchoesPackDto = {
      anchor_path: '/vault/note.md',
      generated_at_ms: 1700000000000,
      items: [
        {
          path: '/vault/other.md',
          title: 'Other',
          reason_label: 'Direct link',
          reason_labels: ['Direct link'],
          score: 0.95,
          signal_sources: ['direct']
        }
      ]
    }

    const result = toEchoesPack(dto)

    expect(result.anchorPath).toBe('/vault/note.md')
    expect(result.generatedAtMs).toBe(1700000000000)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual({
      path: '/vault/other.md',
      title: 'Other',
      reasonLabel: 'Direct link',
      reasonLabels: ['Direct link'],
      score: 0.95,
      signalSources: ['direct']
    })
  })

  it('handles an empty items array', () => {
    const dto: EchoesPackDto = {
      anchor_path: '/vault/note.md',
      generated_at_ms: 0,
      items: []
    }

    const result = toEchoesPack(dto)

    expect(result.anchorPath).toBe('/vault/note.md')
    expect(result.items).toEqual([])
  })

  it('maps multiple signal sources per item', () => {
    const dto: EchoesPackDto = {
      anchor_path: '/a.md',
      generated_at_ms: 1,
      items: [
        {
          path: '/b.md',
          title: 'B',
          reason_label: 'Backlink',
          reason_labels: ['Backlink', 'Semantic'],
          score: 0.8,
          signal_sources: ['backlink', 'semantic']
        }
      ]
    }

    const result = toEchoesPack(dto)

    expect(result.items[0].signalSources).toEqual(['backlink', 'semantic'])
    expect(result.items[0].reasonLabels).toEqual(['Backlink', 'Semantic'])
  })

  it('preserves score value exactly', () => {
    const dto: EchoesPackDto = {
      anchor_path: '/a.md',
      generated_at_ms: 1,
      items: [
        {
          path: '/b.md',
          title: 'B',
          reason_label: 'Recent',
          reason_labels: ['Recent'],
          score: 0.123456789,
          signal_sources: ['recent']
        }
      ]
    }

    expect(toEchoesPack(dto).items[0].score).toBe(0.123456789)
  })

  it('does not mutate the source DTO', () => {
    const dto: EchoesPackDto = {
      anchor_path: '/a.md',
      generated_at_ms: 1,
      items: [
        {
          path: '/b.md',
          title: 'B',
          reason_label: 'Direct link',
          reason_labels: ['Direct link'],
          score: 1,
          signal_sources: ['direct']
        }
      ]
    }
    const originalItems = dto.items

    toEchoesPack(dto)

    expect(dto.items).toBe(originalItems)
  })
})
