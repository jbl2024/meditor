import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CosmosView from './CosmosView.vue'
import type { CosmosGraph } from '../../lib/graphIndex'

type RenderNode = {
  id: string
  path: string
  label: string
  displayLabel?: string
  folderKey?: string
  x?: number
  y?: number
  z?: number
}

type MockState = {
  onNodeClick: ((node: RenderNode) => void) | null
  onNodeHover: ((node: RenderNode | null) => void) | null
  arrowLengthCalls: Array<number | ((edge: unknown) => number)>
  arrowRelPosCalls: Array<number | ((edge: unknown) => number)>
  arrowColorCalls: Array<string | ((edge: unknown) => string)>
  data: { nodes: RenderNode[]; links: Array<{ source: string; target: string; type: 'wikilink' | 'semantic'; score?: number | null }> }
}

const mockState: MockState = {
  onNodeClick: null,
  onNodeHover: null,
  arrowLengthCalls: [],
  arrowRelPosCalls: [],
  arrowColorCalls: [],
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
  nodeVal: () => mockGraph,
  nodeOpacity: () => mockGraph,
  nodeColor: () => mockGraph,
  linkVisibility: () => mockGraph,
  linkColor: () => mockGraph,
  linkWidth: () => mockGraph,
  linkOpacity: () => mockGraph,
  linkDirectionalArrowLength(value: number | ((edge: unknown) => number)) {
    mockState.arrowLengthCalls.push(value)
    return mockGraph
  },
  linkDirectionalArrowColor(value: string | ((edge: unknown) => string)) {
    mockState.arrowColorCalls.push(value)
    return mockGraph
  },
  linkDirectionalArrowRelPos(value: number | ((edge: unknown) => number)) {
    mockState.arrowRelPosCalls.push(value)
    return mockGraph
  },
  showNavInfo: () => mockGraph,
  enableNavigationControls: () => mockGraph,
  enableNodeDrag: () => mockGraph,
  cooldownTicks: () => mockGraph,
  d3VelocityDecay: () => mockGraph,
  cooldownTime: () => mockGraph,
  onNodeHover(handler: (node: RenderNode | null) => void) {
    mockState.onNodeHover = handler
    return mockGraph
  },
  onNodeClick(handler: (node: RenderNode) => void) {
    mockState.onNodeClick = handler
    handler({ id: 'a.md', path: '/vault/a.md', label: 'a', x: 1, y: 1, z: 1 })
    return mockGraph
  },
  onNodeDrag: () => mockGraph,
  onNodeDragEnd: () => mockGraph,
  onEngineStop: () => mockGraph,
  cameraPosition: () => mockGraph,
  width: () => mockGraph,
  height: () => mockGraph,
  zoomToFit: () => mockGraph,
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
    mockState.arrowLengthCalls = []
    mockState.arrowRelPosCalls = []
    mockState.arrowColorCalls = []
    mockState.data = { nodes: [], links: [] }
  })

  it('emits select-node when clicking a node', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const selected = ref('')
    const graph: CosmosGraph = {
      nodes: [
        {
          id: 'a.md',
          path: '/vault/a.md',
          label: 'a',
          displayLabel: 'a',
          folderKey: 'vault',
          fullLabel: 'a',
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
            selectedNodeId: '',
            onSelectNode: (nodeId: string) => {
              selected.value = nodeId
            }
          })
      }
    })

    const app = createApp(Harness)
    app.mount(root)
    await flushUi()
    await new Promise<void>((resolve) => setTimeout(resolve, 20))
    expect(mockState.onNodeClick).toBeTypeOf('function')
    mockState.onNodeClick?.({ id: 'a.md', path: '/vault/a.md', label: 'a', x: 1, y: 1, z: 1 })
    await flushUi()

    expect(selected.value).toBe('a.md')
    expect(mockState.arrowLengthCalls.length).toBeGreaterThan(0)
    expect(mockState.arrowRelPosCalls.length).toBeGreaterThan(0)
    expect(mockState.arrowColorCalls.length).toBeGreaterThan(0)
    const arrowLengthResolver = mockState.arrowLengthCalls[mockState.arrowLengthCalls.length - 1]
    if (typeof arrowLengthResolver === 'function') {
      expect(arrowLengthResolver({ source: 'a.md', target: 'b.md', type: 'semantic', score: 0.9 })).toBe(0)
    }
    expect(mockState.data.nodes[0]?.displayLabel).toBe('a')

    app.unmount()
  })
})
