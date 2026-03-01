<script setup lang="ts">
/**
 * 3D Cosmos graph renderer for wikilink exploration.
 *
 * Responsibilities:
 * - render the graph with `3d-force-graph`,
 * - apply hover/focus highlighting,
 * - surface node opening via emits.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CosmosGraph, CosmosGraphNode } from '../../lib/graphIndex'

type RenderNode = CosmosGraphNode & { x?: number; y?: number; z?: number }
type RenderEdge = {
  source: string | RenderNode
  target: string | RenderNode
  type: 'wikilink'
}

type ForceGraphInstance = {
  graphData: {
    (): { nodes: RenderNode[]; links: RenderEdge[] }
    (data: { nodes: RenderNode[]; links: RenderEdge[] }): ForceGraphInstance
  }
  backgroundColor: (value: string) => ForceGraphInstance
  nodeLabel: (value: (node: RenderNode) => string) => ForceGraphInstance
  nodeRelSize: (value: number) => ForceGraphInstance
  nodeColor: (value: (node: RenderNode) => string) => ForceGraphInstance
  linkColor: (value: (edge: RenderEdge) => string) => ForceGraphInstance
  linkWidth: (value: (edge: RenderEdge) => number) => ForceGraphInstance
  linkOpacity: (value: (edge: RenderEdge) => number) => ForceGraphInstance
  cooldownTicks: (value: number) => ForceGraphInstance
  d3VelocityDecay: (value: number) => ForceGraphInstance
  onNodeHover: (handler: (node: RenderNode | null) => void) => ForceGraphInstance
  onNodeClick: (handler: (node: RenderNode, event?: MouseEvent) => void) => ForceGraphInstance
  onEngineStop: (handler: () => void) => ForceGraphInstance
  cameraPosition: (
    position: { x?: number; y?: number; z?: number },
    lookAt?: { x?: number; y?: number; z?: number },
    ms?: number
  ) => ForceGraphInstance
  width: (value: number) => ForceGraphInstance
  height: (value: number) => ForceGraphInstance
  graph2ScreenCoords: (x: number, y: number, z: number) => { x: number; y: number }
  controls: () => { enableDamping?: boolean; dampingFactor?: number }
  refresh?: () => ForceGraphInstance
  _destructor?: () => void
}

const CLUSTER_COLORS = ['#4cc9f0', '#90be6d', '#f9c74f', '#f9844a', '#577590', '#43aa8b', '#4895ef']
const HOVER_THROTTLE_MS = 24
const DOUBLE_CLICK_MS = 260

const props = defineProps<{
  graph: CosmosGraph
  loading: boolean
  error?: string
}>()

const emit = defineEmits<{
  'open-node': [path: string]
}>()

const rootEl = ref<HTMLDivElement | null>(null)
const graphEl = ref<HTMLDivElement | null>(null)
const graphInstance = ref<ForceGraphInstance | null>(null)
const hoverNodeId = ref('')
const neighborIds = ref<Set<string>>(new Set())
const highlightedEdgeKeys = ref<Set<string>>(new Set())
const labels = ref<Array<{ id: string; text: string; x: number; y: number }>>([])

let hoverThrottleTimer: ReturnType<typeof setTimeout> | null = null
let labelRaf = 0
let lastClickAt = 0
let lastClickNodeId = ''
let pendingOpenTimer: ReturnType<typeof setTimeout> | null = null

const hasRenderableGraph = computed(() => props.graph.nodes.length > 0)

function clusterColor(cluster: number): string {
  return CLUSTER_COLORS[Math.abs(cluster) % CLUSTER_COLORS.length]
}

function edgeKey(sourceId: string, targetId: string): string {
  return `${sourceId}=>${targetId}`
}

function shouldDimNode(nodeId: string): boolean {
  if (!hoverNodeId.value) return false
  if (nodeId === hoverNodeId.value) return false
  return !neighborIds.value.has(nodeId)
}

function isEdgeHighlighted(link: RenderEdge): boolean {
  const sourceId = typeof link.source === 'string' ? link.source : link.source.id
  const targetId = typeof link.target === 'string' ? link.target : link.target.id
  return highlightedEdgeKeys.value.has(edgeKey(sourceId, targetId))
}

/**
 * Recomputes hover neighborhood and highlighted links.
 */
function updateHoverState(node: RenderNode | null) {
  hoverNodeId.value = node?.id ?? ''
  const nextNeighbors = new Set<string>()
  const nextEdges = new Set<string>()

  if (node) {
    for (const link of props.graph.edges) {
      const sourceId = link.source
      const targetId = link.target
      if (sourceId === node.id) {
        nextNeighbors.add(targetId)
        nextEdges.add(edgeKey(sourceId, targetId))
      }
      if (targetId === node.id) {
        nextNeighbors.add(sourceId)
        nextEdges.add(edgeKey(sourceId, targetId))
      }
    }
  }

  neighborIds.value = nextNeighbors
  highlightedEdgeKeys.value = nextEdges
  graphInstance.value?.refresh?.()
}

/**
 * Centers the camera on a node for focused exploration.
 */
function focusNode(node: RenderNode) {
  const graph = graphInstance.value
  if (!graph) return
  const x = node.x ?? 0
  const y = node.y ?? 0
  const z = node.z ?? 0
  const distance = 120
  const length = Math.hypot(x, y, z) || 1
  const ratio = 1 + distance / length
  graph.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, { x, y, z }, 700)
}

/**
 * Handles node click with single-click open and double-click focus behavior.
 */
function onNodeClick(node: RenderNode) {
  const now = Date.now()
  if (pendingOpenTimer) {
    clearTimeout(pendingOpenTimer)
    pendingOpenTimer = null
  }

  if (lastClickNodeId === node.id && now - lastClickAt <= DOUBLE_CLICK_MS) {
    focusNode(node)
    lastClickAt = 0
    lastClickNodeId = ''
    return
  }

  lastClickAt = now
  lastClickNodeId = node.id
  pendingOpenTimer = setTimeout(() => {
    emit('open-node', node.path)
    pendingOpenTimer = null
  }, DOUBLE_CLICK_MS)
}

function shouldShowLabel(node: CosmosGraphNode): boolean {
  if (node.showLabelByDefault) return true
  if (!hoverNodeId.value) return false
  return node.id === hoverNodeId.value || neighborIds.value.has(node.id)
}

/**
 * Rebuilds screen-space label positions from current 3D node coordinates.
 */
function updateLabelPositions() {
  const graph = graphInstance.value
  const host = rootEl.value
  if (!graph || !host) {
    labels.value = []
    return
  }

  const { width, height } = host.getBoundingClientRect()
  if (width <= 0 || height <= 0) {
    labels.value = []
    return
  }

  const nextLabels: Array<{ id: string; text: string; x: number; y: number }> = []
  const renderData = graph.graphData() as unknown as { nodes: RenderNode[] }

  for (const node of renderData.nodes ?? []) {
    if (!shouldShowLabel(node)) continue
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.z)) continue
    const point = graph.graph2ScreenCoords(node.x ?? 0, node.y ?? 0, node.z ?? 0)
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) continue

    nextLabels.push({ id: node.id, text: node.label, x: point.x, y: point.y })
  }

  labels.value = nextLabels
}

function scheduleLabelLoop() {
  const tick = () => {
    updateLabelPositions()
    labelRaf = window.requestAnimationFrame(tick)
  }
  labelRaf = window.requestAnimationFrame(tick)
}

/**
 * Initializes and styles the 3D force-graph instance.
 */
async function initializeGraph() {
  const host = graphEl.value
  if (!host) return

  const module = await import('3d-force-graph')
  const createGraph = module.default as unknown as (el: HTMLElement) => ForceGraphInstance
  const graph = createGraph(host)

  const controls = graph.controls()
  if (controls) {
    controls.enableDamping = true
    controls.dampingFactor = 0.09
  }

  graph
    .backgroundColor('#020617')
    .nodeLabel((node) => node.label)
    .nodeRelSize(3.3)
    .nodeColor((node) => {
      if (hoverNodeId.value && node.id === hoverNodeId.value) return '#fef08a'
      if (hoverNodeId.value && neighborIds.value.has(node.id)) return '#e2e8f0'
      const base = clusterColor(node.cluster)
      return shouldDimNode(node.id) ? `${base}44` : base
    })
    .linkColor((link) => {
      if (isEdgeHighlighted(link)) return '#f8fafc'
      if (!hoverNodeId.value) return '#64748b'
      return '#334155'
    })
    .linkWidth((link) => (isEdgeHighlighted(link) ? 1.7 : 0.35))
    .linkOpacity((link) => (isEdgeHighlighted(link) ? 0.96 : hoverNodeId.value ? 0.08 : 0.22))
    .cooldownTicks(140)
    .d3VelocityDecay(0.35)
    .onNodeHover((node) => {
      if (hoverThrottleTimer) return
      hoverThrottleTimer = setTimeout(() => {
        hoverThrottleTimer = null
        updateHoverState(node)
      }, HOVER_THROTTLE_MS)
    })
    .onNodeClick(onNodeClick)
    .onEngineStop(() => {
      updateLabelPositions()
    })

  graphInstance.value = graph
  applyGraphData()
  resizeGraphToHost()
}

/**
 * Applies graph data to the renderer.
 */
function applyGraphData() {
  const graph = graphInstance.value
  if (!graph) return
  graph.graphData({
    nodes: props.graph.nodes.map((node) => ({ ...node })),
    links: props.graph.edges.map((edge) => ({ ...edge }))
  })
  updateHoverState(null)
}

function resizeGraphToHost() {
  const graph = graphInstance.value
  const host = rootEl.value
  if (!graph || !host) return
  const rect = host.getBoundingClientRect()
  graph.width(Math.max(1, Math.floor(rect.width)))
  graph.height(Math.max(1, Math.floor(rect.height)))
}

function teardownGraph() {
  if (hoverThrottleTimer) {
    clearTimeout(hoverThrottleTimer)
    hoverThrottleTimer = null
  }
  if (pendingOpenTimer) {
    clearTimeout(pendingOpenTimer)
    pendingOpenTimer = null
  }
  if (labelRaf) {
    window.cancelAnimationFrame(labelRaf)
    labelRaf = 0
  }
  graphInstance.value?._destructor?.()
  graphInstance.value = null
}

watch(
  () => props.graph,
  () => {
    applyGraphData()
  },
  { deep: true }
)

onMounted(() => {
  void initializeGraph().then(() => {
    scheduleLabelLoop()
  })
  window.addEventListener('resize', resizeGraphToHost)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeGraphToHost)
  teardownGraph()
})
</script>

<template>
  <div ref="rootEl" class="cosmos-root">
    <div ref="graphEl" class="cosmos-canvas" :aria-busy="loading ? 'true' : 'false'"></div>

    <div v-if="loading" class="cosmos-state">Loading graph...</div>
    <div v-else-if="error" class="cosmos-state cosmos-state-error">{{ error }}</div>
    <div v-else-if="!hasRenderableGraph" class="cosmos-state">No wikilink graph yet.</div>

    <div class="cosmos-labels" aria-hidden="true">
      <div
        v-for="item in labels"
        :key="item.id"
        class="cosmos-label"
        :style="{ transform: `translate(${item.x}px, ${item.y}px)` }"
      >
        {{ item.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.cosmos-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
  overflow: hidden;
  border-radius: 10px;
  background: radial-gradient(circle at 30% 20%, #0f172a 0%, #020617 48%, #01020a 100%);
}

.cosmos-canvas {
  position: absolute;
  inset: 0;
}

.cosmos-state {
  position: absolute;
  left: 16px;
  top: 14px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgb(15 23 42 / 72%);
  color: #cbd5e1;
  font-size: 12px;
  letter-spacing: 0.02em;
}

.cosmos-state-error {
  background: rgb(127 29 29 / 72%);
  color: #fecaca;
}

.cosmos-labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.cosmos-label {
  position: absolute;
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 500;
  text-shadow: 0 0 8px rgb(15 23 42 / 96%);
  transform: translate(-50%, -130%);
  white-space: nowrap;
  opacity: 0.96;
}
</style>
