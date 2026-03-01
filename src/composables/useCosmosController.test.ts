import { effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useCosmosController } from './useCosmosController'
import type { WikilinkGraph } from '../lib/api'

const rawGraph: WikilinkGraph = {
  nodes: [
    { id: 'a', path: '/vault/a.md', label: 'a', degree: 2, tags: [], cluster: null },
    { id: 'b', path: '/vault/b.md', label: 'b', degree: 1, tags: [], cluster: null },
    { id: 'c', path: '/vault/c.md', label: 'c', degree: 0, tags: [], cluster: null }
  ],
  edges: [
    { source: 'a', target: 'b', type: 'wikilink' }
  ],
  generated_at_ms: 1
}

async function flush() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('useCosmosController', () => {
  it('keeps query untouched when selecting/focusing nodes', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const ctrl = useCosmosController({
        workingFolderPath: ref('/vault'),
        activeTabPath: ref('/vault/a.md'),
        getWikilinkGraph: vi.fn(async () => rawGraph),
        reindexMarkdownFile: vi.fn(async () => {}),
        readTextFile: vi.fn(async () => '# A')
      })

      await ctrl.refreshGraph()
      ctrl.query.value = 'abc'
      ctrl.selectNode('a')
      expect(ctrl.query.value).toBe('abc')

      ctrl.focusMatch('b')
      expect(ctrl.query.value).toBe('abc')
      expect(ctrl.selectedNodeId.value).toBe('b')
    })
    scope.stop()
  })

  it('searchEnter selects first match and returns node id', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const ctrl = useCosmosController({
        workingFolderPath: ref('/vault'),
        activeTabPath: ref('/vault/a.md'),
        getWikilinkGraph: vi.fn(async () => rawGraph),
        reindexMarkdownFile: vi.fn(async () => {}),
        readTextFile: vi.fn(async () => '# A')
      })

      await ctrl.refreshGraph()
      ctrl.query.value = 'b'
      const nodeId = ctrl.searchEnter()

      expect(nodeId).toBe('b')
      expect(ctrl.selectedNodeId.value).toBe('b')
    })
    scope.stop()
  })

  it('expandNeighborhood enables focus mode and increments depth', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const ctrl = useCosmosController({
        workingFolderPath: ref('/vault'),
        activeTabPath: ref('/vault/a.md'),
        getWikilinkGraph: vi.fn(async () => rawGraph),
        reindexMarkdownFile: vi.fn(async () => {}),
        readTextFile: vi.fn(async () => '# A')
      })

      await ctrl.refreshGraph()
      ctrl.selectNode('a')
      expect(ctrl.focusMode.value).toBe(false)
      expect(ctrl.focusDepth.value).toBe(1)

      ctrl.expandNeighborhood()
      expect(ctrl.focusMode.value).toBe(true)
      expect(ctrl.focusDepth.value).toBe(2)
    })
    scope.stop()
  })

  it('resets stale selection when refreshed graph no longer contains selected node', async () => {
    const getGraph = vi
      .fn<() => Promise<WikilinkGraph>>()
      .mockResolvedValueOnce(rawGraph)
      .mockResolvedValueOnce({ ...rawGraph, nodes: rawGraph.nodes.filter((n) => n.id !== 'a') })

    const scope = effectScope()
    await scope.run(async () => {
      const ctrl = useCosmosController({
        workingFolderPath: ref('/vault'),
        activeTabPath: ref('/vault/a.md'),
        getWikilinkGraph: getGraph,
        reindexMarkdownFile: vi.fn(async () => {}),
        readTextFile: vi.fn(async () => '# A')
      })

      await ctrl.refreshGraph()
      ctrl.selectNode('a')
      expect(ctrl.selectedNodeId.value).toBe('a')

      await ctrl.refreshGraph()
      expect(ctrl.selectedNodeId.value).toBe('')
      expect(ctrl.focusDepth.value).toBe(1)
    })
    scope.stop()
  })

  it('loads preview and surfaces read failures', async () => {
    const readTextFile = vi
      .fn<(path: string) => Promise<string>>()
      .mockResolvedValueOnce('# A\n\ncontent')
      .mockRejectedValueOnce(new Error('boom'))

    const scope = effectScope()
    await scope.run(async () => {
      const ctrl = useCosmosController({
        workingFolderPath: ref('/vault'),
        activeTabPath: ref('/vault/a.md'),
        getWikilinkGraph: vi.fn(async () => rawGraph),
        reindexMarkdownFile: vi.fn(async () => {}),
        readTextFile
      })

      await ctrl.refreshGraph()
      ctrl.selectNode('a')
      await flush()
      expect(ctrl.preview.value).toContain('content')
      expect(ctrl.previewError.value).toBe('')

      ctrl.selectNode('b')
      await flush()
      expect(ctrl.preview.value).toBe('')
      expect(ctrl.previewError.value).toBe('boom')
    })
    scope.stop()
  })
})
