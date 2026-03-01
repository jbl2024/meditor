import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CosmosView from './CosmosView.vue'
import type { CosmosGraph } from '../../lib/graphIndex'

type RenderNode = { id: string; path: string; label: string; x?: number; y?: number; z?: number }

type MockState = {
  onNodeClick: ((node: RenderNode) => void) | null
  onNodeHover: ((node: RenderNode | null) => void) | null
  data: { nodes: RenderNode[]; links: Array<{ source: string; target: string; type: 'wikilink' }> }
}

const mockState: MockState = {
  onNodeClick: null,
  onNodeHover: null,
  data: { nodes: [], links: [] }
}

const mockGraph = {
  graphData(data?: MockState['data']) {
    if (data) {
      mockState.data = data
      return mockGraph
    }
    return mockState.data
  },
  backgroundColor: () => mockGraph,
  nodeLabel: () => mockGraph,
  nodeRelSize: () => mockGraph,
  nodeColor: () => mockGraph,
  linkColor: () => mockGraph,
  linkWidth: () => mockGraph,
  linkOpacity: () => mockGraph,
  cooldownTicks: () => mockGraph,
  d3VelocityDecay: () => mockGraph,
  onNodeHover(handler: (node: RenderNode | null) => void) {
    mockState.onNodeHover = handler
    return mockGraph
  },
  onNodeClick(handler: (node: RenderNode) => void) {
    mockState.onNodeClick = handler
    handler({ id: 'a.md', path: '/vault/a.md', label: 'a', x: 1, y: 1, z: 1 })
    return mockGraph
  },
  onEngineStop: () => mockGraph,
  cameraPosition: () => mockGraph,
  width: () => mockGraph,
  height: () => mockGraph,
  graph2ScreenCoords: () => ({ x: 10, y: 10 }),
  controls: () => ({}),
  refresh: () => mockGraph,
  _destructor: () => {}
}

vi.mock('3d-force-graph', () => ({
  default: () => mockGraph
}))

async function flushUi() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('CosmosView', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    mockState.onNodeClick = null
    mockState.onNodeHover = null
    mockState.data = { nodes: [], links: [] }
  })

  it('emits open-node when clicking a node', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const opened = ref('')
    const graph: CosmosGraph = {
      nodes: [
        {
          id: 'a.md',
          path: '/vault/a.md',
          label: 'a',
          degree: 1,
          tags: [],
          cluster: 0,
          importance: 1,
          opacityHint: 1,
          showLabelByDefault: true
        }
      ],
      edges: [],
      generated_at_ms: 1
    }

    const Harness = defineComponent({
      setup() {
        return () =>
          h(CosmosView, {
            graph,
            loading: false,
            error: '',
            onOpenNode: (path: string) => {
              opened.value = path
            }
          })
      }
    })

    const app = createApp(Harness)
    app.mount(root)
    await flushUi()

    await new Promise<void>((resolve) => setTimeout(resolve, 320))

    expect(opened.value).toBe('/vault/a.md')

    app.unmount()
  })
})
