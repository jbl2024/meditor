import { describe, expect, it } from 'vitest'
import { useConstitutedContext } from './useConstitutedContext'

describe('useConstitutedContext', () => {
  it('adds notes without duplicates and resolves titles', () => {
    const state = useConstitutedContext({
      resolveItem: (path) => ({ path, title: path.split('/').pop() ?? path })
    })

    state.add('/vault/a.md', '/vault/anchor.md')
    state.add('/vault/a.md', '/vault/anchor.md')
    state.add('/vault/b.md', '/vault/anchor.md')

    expect(state.anchorPath.value).toBe('/vault/anchor.md')
    expect(state.paths.value).toEqual(['/vault/a.md', '/vault/b.md'])
    expect(state.items.value.map((item) => item.title)).toEqual(['a.md', 'b.md'])
    expect(state.count.value).toBe(2)
    expect(state.contains('/vault/a.md')).toBe(true)
  })

  it('removes and toggles items', () => {
    const state = useConstitutedContext()

    state.toggle('/vault/a.md', '/vault/anchor.md')
    expect(state.paths.value).toEqual(['/vault/a.md'])

    state.toggle('/vault/a.md', '/vault/anchor.md')
    expect(state.paths.value).toEqual([])

    state.add('/vault/b.md', '/vault/anchor.md')
    state.remove('/vault/b.md')
    expect(state.isEmpty.value).toBe(true)
  })

  it('preserves context across anchor resets only after preserve', () => {
    const state = useConstitutedContext()

    state.add('/vault/a.md', '/vault/anchor-a.md')
    state.resetForAnchor('/vault/anchor-b.md')
    expect(state.mode.value).toBe('local')
    expect(state.anchorPath.value).toBe('/vault/anchor-b.md')
    expect(state.paths.value).toEqual([])

    state.add('/vault/b.md', '/vault/anchor-b.md')
    state.preserve()
    state.resetForAnchor('/vault/anchor-c.md')
    expect(state.mode.value).toBe('preserved')
    expect(state.anchorPath.value).toBe('/vault/anchor-c.md')
    expect(state.paths.value).toEqual(['/vault/b.md'])
  })

  it('replaces state with explicit mode and can clear it', () => {
    const state = useConstitutedContext()

    state.replace(
      ['/vault/a.md', '', '/vault/a.md', '/vault/c.md'],
      '/vault/anchor.md',
      'preserved',
      (path) => ({ path, title: `title:${path}` })
    )

    expect(state.mode.value).toBe('preserved')
    expect(state.anchorPath.value).toBe('/vault/anchor.md')
    expect(state.items.value).toEqual([
      { path: '/vault/a.md', title: 'title:/vault/a.md' },
      { path: '/vault/c.md', title: 'title:/vault/c.md' }
    ])

    state.clear()
    expect(state.items.value).toEqual([])
    expect(state.isEmpty.value).toBe(true)
  })
})
