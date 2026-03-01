import { describe, expect, it } from 'vitest'
import {
  assignConnectedComponentClusters,
  buildCosmosGraph,
  selectHubNodes
} from './graphIndex'
import type { WikilinkGraph } from './api'

function sampleGraph(): WikilinkGraph {
  return {
    nodes: [
      { id: 'a.md', path: 'a.md', label: 'a', degree: 3, tags: ['dev'], cluster: null },
      { id: 'b.md', path: 'b.md', label: 'b', degree: 2, tags: [], cluster: null },
      { id: 'c.md', path: 'c.md', label: 'c', degree: 1, tags: [], cluster: null },
      { id: 'd.md', path: 'd.md', label: 'd', degree: 0, tags: [], cluster: null }
    ],
    edges: [
      { source: 'a.md', target: 'b.md', type: 'wikilink' },
      { source: 'b.md', target: 'c.md', type: 'wikilink' }
    ],
    generated_at_ms: 1
  }
}

describe('graphIndex', () => {
  it('assigns stable connected-component clusters', () => {
    const clusters = assignConnectedComponentClusters(sampleGraph())

    expect(clusters.get('a.md')).toBe(0)
    expect(clusters.get('b.md')).toBe(0)
    expect(clusters.get('c.md')).toBe(0)
    expect(clusters.get('d.md')).toBe(1)
  })

  it('selects hubs from degree percentile with minimum threshold', () => {
    const hubs = selectHubNodes(sampleGraph(), { percentile: 0.9, minDegree: 2 })
    expect(hubs.has('a.md')).toBe(true)
    expect(hubs.has('b.md')).toBe(true)
    expect(hubs.has('c.md')).toBe(false)
  })

  it('builds cosmos graph with display hints', () => {
    const graph = buildCosmosGraph(sampleGraph())
    const a = graph.nodes.find((node) => node.id === 'a.md')
    const d = graph.nodes.find((node) => node.id === 'd.md')

    expect(graph.nodes).toHaveLength(4)
    expect(graph.edges).toHaveLength(2)
    expect(a?.cluster).toBe(0)
    expect(a?.showLabelByDefault).toBe(true)
    expect((d?.opacityHint ?? 0) > 0).toBe(true)
  })
})
