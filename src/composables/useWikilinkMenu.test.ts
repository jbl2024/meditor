import { describe, expect, it, vi } from 'vitest'
import { useWikilinkMenu } from './useWikilinkMenu'

describe('useWikilinkMenu', () => {
  it('builds merged create + existing results and clamps index', async () => {
    const menu = useWikilinkMenu({
      loadTargets: async () => ['alpha', 'beta'],
      loadHeadings: async () => []
    })

    await menu.refreshTargets()
    menu.openMenu('alp')
    menu.index.value = 8

    expect(menu.results.value[0]?.isCreate).toBe(true)
    expect(menu.results.value.some((item) => item.target === 'alpha')).toBe(true)
    expect(menu.index.value).toBeLessThan(menu.results.value.length)
  })

  it('caches headings using ttl', async () => {
    const loadHeadings = vi.fn(async () => ['H1', 'H2'])
    const menu = useWikilinkMenu({
      ttlMs: 5_000,
      loadTargets: async () => [],
      loadHeadings
    })

    const first = await menu.headingsFor('a.md')
    const second = await menu.headingsFor('a.md')

    expect(first).toEqual(['H1', 'H2'])
    expect(second).toEqual(['H1', 'H2'])
    expect(loadHeadings).toHaveBeenCalledTimes(1)
  })
})
