import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { applyDeferredPathMovesLocally, applyImmediatePathMovesLocally } from './appShellPathMoveEffects'

describe('appShellPathMoveEffects', () => {
  it('applies immediate local path patches and rewrites backlinks', () => {
    const port = {
      multiPane: { replacePath: vi.fn() },
      documentHistory: { replacePath: vi.fn() },
      editorState: { movePath: vi.fn() },
      renameLaunchpadRecentNote: vi.fn(),
      virtualDocs: ref<Record<string, { content: string; titleLine: string }>>({
        '/vault/a.md': { content: 'a', titleLine: '# A' }
      }),
      backlinks: ref(['/vault/a.md', '/vault/other.md'])
    }

    applyImmediatePathMovesLocally(
      port,
      [{ from: '/vault/a.md', to: '/vault/b.md' }],
      [{ from: '/vault/a.md', to: '/vault/b.md' }]
    )

    expect(port.multiPane.replacePath).toHaveBeenCalledWith('/vault/a.md', '/vault/b.md')
    expect(port.documentHistory.replacePath).toHaveBeenCalledWith('/vault/a.md', '/vault/b.md')
    expect(port.editorState.movePath).toHaveBeenCalledWith('/vault/a.md', '/vault/b.md')
    expect(port.renameLaunchpadRecentNote).toHaveBeenCalledWith('/vault/a.md', '/vault/b.md')
    expect(port.virtualDocs.value['/vault/b.md']).toEqual({ content: 'a', titleLine: '# A' })
    expect(port.virtualDocs.value['/vault/a.md']).toBeUndefined()
    expect(port.backlinks.value).toEqual(['/vault/b.md', '/vault/other.md'])
  })

  it('applies deferred local path patches through workspace replacements', () => {
    const port = {
      multiPane: { replacePath: vi.fn() },
      documentHistory: { replacePath: vi.fn() },
      editorState: { movePath: vi.fn() },
      renameLaunchpadRecentNote: vi.fn(),
      virtualDocs: ref<Record<string, { content: string; titleLine: string }>>({
        '/vault/a.md': { content: 'a', titleLine: '# A' }
      }),
      backlinks: ref<string[]>([]),
      replaceWorkspaceFilePath: vi.fn()
    }

    applyDeferredPathMovesLocally(
      port,
      [{ from: '/vault/a.md', to: '/vault/b.md' }],
      [{ from: '/vault/a.md', to: '/vault/b.md' }]
    )

    expect(port.replaceWorkspaceFilePath).toHaveBeenCalledWith('/vault/a.md', '/vault/b.md')
    expect(port.multiPane.replacePath).toHaveBeenCalledWith('/vault/a.md', '/vault/b.md')
    expect(port.documentHistory.replacePath).toHaveBeenCalledWith('/vault/a.md', '/vault/b.md')
    expect(port.editorState.movePath).toHaveBeenCalledWith('/vault/a.md', '/vault/b.md')
    expect(port.renameLaunchpadRecentNote).toHaveBeenCalledWith('/vault/a.md', '/vault/b.md')
    expect(port.virtualDocs.value['/vault/b.md']).toEqual({ content: 'a', titleLine: '# A' })
  })
})
