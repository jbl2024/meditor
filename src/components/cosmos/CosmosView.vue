<script setup lang="ts">
/**
 * 3D Cosmos graph renderer for wikilink exploration.
 *
 * Responsibilities:
 * - render the graph with `3d-force-graph`,
 * - apply hover/focus highlighting,
 * - surface node selection via emits.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CosmosGraph, CosmosGraphNode } from '../../lib/graphIndex'

type RenderNode = CosmosGraphNode & { x?: number; y?: number; z?: number; fx?: number; fy?: number; fz?: number }
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
  nodeVal: (value: number | string | ((node: RenderNode) => number)) => ForceGraphInstance
  nodeColor: (value: (node: RenderNode) => string) => ForceGraphInstance
  nodeOpacity: (value: number) => ForceGraphInstance
  linkColor: (value: (edge: RenderEdge) => string) => ForceGraphInstance
  linkVisibility: (value: boolean | ((edge: RenderEdge) => boolean)) => ForceGraphInstance
  linkWidth: (value: (edge: RenderEdge) => number) => ForceGraphInstance
  linkOpacity: (value: (edge: RenderEdge) => number) => ForceGraphInstance
  linkDirectionalArrowLength: (value: number | ((edge: RenderEdge) => number)) => ForceGraphInstance
  linkDirectionalArrowColor: (value: string | ((edge: RenderEdge) => string)) => ForceGraphInstance
  linkDirectionalArrowRelPos: (value: number | ((edge: RenderEdge) => number)) => ForceGraphInstance
  showNavInfo: (value: boolean) => ForceGraphInstance
  enableNavigationControls: (value: boolean) => ForceGraphInstance
  enableNodeDrag: (value: boolean) => ForceGraphInstance
  cooldownTicks: (value: number) => ForceGraphInstance
  cooldownTime: (value: number) => ForceGraphInstance
  d3VelocityDecay: (value: number) => ForceGraphInstance
  onNodeHover: (handler: (node: RenderNode | null) => void) => ForceGraphInstance
  onNodeClick: (handler: (node: RenderNode, event?: MouseEvent) => void) => ForceGraphInstance
  onNodeDrag: (handler: (node: RenderNode) => void) => ForceGraphInstance
  onNodeDragEnd: (handler: (node: RenderNode) => void) => ForceGraphInstance
  onEngineStop: (handler: () => void) => ForceGraphInstance
  cameraPosition: (
    position: { x?: number; y?: number; z?: number },
    lookAt?: { x?: number; y?: number; z?: number },
    ms?: number
  ) => ForceGraphInstance
  width: (value: number) => ForceGraphInstance
  height: (value: number) => ForceGraphInstance
  zoomToFit: (ms?: number, px?: number, filter?: (node: RenderNode) => boolean) => ForceGraphInstance
  graph2ScreenCoords: (x: number, y: number, z: number) => { x: number; y: number }
  controls: () => { enableDamping?: boolean; dampingFactor?: number }
  refresh?: () => ForceGraphInstance
  _destructor?: () => void
}

const FOLDER_COLORS = ['#4cc9f0', '#90be6d', '#f9c74f', '#f9844a', '#43aa8b', '#4895ef', '#84cc16', '#22d3ee', '#f97316', '#a3e635']
const CLUSTER_FALLBACK_COLORS = ['#4cc9f0', '#90be6d', '#f9c74f', '#f9844a', '#577590', '#43aa8b', '#4895ef']
const HOVER_THROTTLE_MS = 24
const DOUBLE_CLICK_MS = 260
const AUTO_SHOW_LABEL_THRESHOLD = 24

const props = defineProps<{
  graph: CosmosGraph
  loading: boolean
  error?: string
  selectedNodeId?: string
}>()

const emit = defineEmits<{
  'select-node': [nodeId: string]
}>()

const rootEl = ref<HTMLDivElement | null>(null)
const graphEl = ref<HTMLDivElement | null>(null)
const graphInstance = ref<ForceGraphInstance | null>(null)
const labels = ref<Array<{ id: string; text: string; x: number; y: number; color: string; emphasized: boolean }>>([])

let hoverThrottleTimer: ReturnType<typeof setTimeout> | null = null
let labelRaf = 0
let lastClickAt = 0
let lastClickNodeId = ''
let lastDragAt = 0
let lastDraggedNodeId = ''
const CLICK_AFTER_DRAG_GUARD_MS = 320
let hoveredNodeId = ''
let selectedNodeId = ''
let hoveredNeighborIds = new Set<string>()
let highlightedEdgeKeys = new Set<string>()
let cachedEdges: Array<{ source: string; target: string }> = []
let didInitialAutoFit = false

const hasRenderableGraph = computed(() => props.graph.nodes.length > 0)

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function clusterFallbackColor(cluster: number): string {
  return CLUSTER_FALLBACK_COLORS[Math.abs(cluster) % CLUSTER_FALLBACK_COLORS.length]
}

/**
 * Folder-first color mapping.
 * Priority: folderKey palette > cluster fallback.
 */
function nodeBaseColor(node: RenderNode): string {
  if (node.folderKey) {
    const slot = hashString(node.folderKey) % FOLDER_COLORS.length
    return FOLDER_COLORS[slot]
  }
  return clusterFallbackColor(node.cluster)
}

function edgeKey(sourceId: string, targetId: string): string {
  return `${sourceId}=>${targetId}`
}

function shouldDimNode(nodeId: string): boolean {
  if (!hoveredNodeId) return false
  if (nodeId === hoveredNodeId) return false
  return !hoveredNeighborIds.has(nodeId)
}

function isEdgeHighlighted(link: RenderEdge): boolean {
  const sourceId = typeof link.source === 'string' ? link.source : link.source.id
  const targetId = typeof link.target === 'string' ? link.target : link.target.id
  return highlightedEdgeKeys.has(edgeKey(sourceId, targetId))
}

function linkArrowColor(link: RenderEdge): string {
  if (isEdgeHighlighted(link)) return '#f8fafc'
  return hoveredNodeId ? '#94a3b8' : '#475569'
}

function labelColor(nodeId: string): string {
  if (selectedNodeId && nodeId === selectedNodeId) return '#111827'
  if (hoveredNodeId && (nodeId === hoveredNodeId || hoveredNeighborIds.has(nodeId))) return '#111827'
  return '#e2e8f0'
}

function isLabelEmphasized(nodeId: string): boolean {
  if (selectedNodeId && nodeId === selectedNodeId) return true
  if (hoveredNodeId && (nodeId === hoveredNodeId || hoveredNeighborIds.has(nodeId))) return true
  return false
}

/**
 * Recomputes hover neighborhood and highlighted links.
 */
function updateHoverState(node: RenderNode | null) {
  hoveredNodeId = node?.id ?? ''
  const nextNeighbors = new Set<string>()
  const nextEdges = new Set<string>()

  if (node) {
    for (const link of cachedEdges) {
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

  hoveredNeighborIds = nextNeighbors
  highlightedEdgeKeys = nextEdges
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
 * Handles node click with single-click select and double-click focus behavior.
 */
function onNodeClick(node: RenderNode) {
  if (lastDraggedNodeId === node.id && Date.now() - lastDragAt < CLICK_AFTER_DRAG_GUARD_MS) {
    return
  }

  emit('select-node', node.id)

  const now = Date.now()
  if (lastClickNodeId === node.id && now - lastClickAt <= DOUBLE_CLICK_MS) {
    focusNode(node)
    lastClickAt = 0
    lastClickNodeId = ''
    return
  }

  lastClickAt = now
  lastClickNodeId = node.id
}

function shouldShowLabel(node: CosmosGraphNode): boolean {
  if (props.graph.nodes.length <= AUTO_SHOW_LABEL_THRESHOLD) return true
  if (node.showLabelByDefault) return true
  if (!hoveredNodeId) return false
  return node.id === hoveredNodeId || hoveredNeighborIds.has(node.id)
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

  const nextLabels: Array<{ id: string; text: string; x: number; y: number; color: string; emphasized: boolean }> = []
  const renderData = graph.graphData() as unknown as { nodes: RenderNode[] }

  for (const node of renderData.nodes ?? []) {
    if (!shouldShowLabel(node)) continue
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.z)) continue
    const point = graph.graph2ScreenCoords(node.x ?? 0, node.y ?? 0, node.z ?? 0)
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) continue

    nextLabels.push({
      id: node.id,
      text: node.displayLabel,
      x: point.x,
      y: point.y,
      color: labelColor(node.id),
      emphasized: isLabelEmphasized(node.id)
    })
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
 * Locks current node coordinates to keep a stable layout after the simulation cools down.
 */
function lockNodePositions() {
  const graph = graphInstance.value
  if (!graph) return
  const renderData = graph.graphData()
  for (const node of renderData.nodes ?? []) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.z)) continue
    ;(node as RenderNode & { fx?: number; fy?: number; fz?: number }).fx = node.x
    ;(node as RenderNode & { fx?: number; fy?: number; fz?: number }).fy = node.y
    ;(node as RenderNode & { fx?: number; fy?: number; fz?: number }).fz = node.z
  }
}

/**
 * Initializes and styles the 3D force-graph instance.
 */
async function initializeGraph() {
  const host = graphEl.value
  if (!host) return

  const module = await import('3d-force-graph')
  const ForceGraph3D = module.default as unknown as
    | ((el?: HTMLElement, options?: Record<string, unknown>) => ForceGraphInstance | ((el: HTMLElement) => ForceGraphInstance))
    | (new (el: HTMLElement, options?: Record<string, unknown>) => ForceGraphInstance)

  let graph: ForceGraphInstance
  try {
    graph = new (ForceGraph3D as new (el: HTMLElement, options?: Record<string, unknown>) => ForceGraphInstance)(
      host,
      { controlType: 'orbit' }
    )
  } catch {
    const maybeFactory = (ForceGraph3D as (el?: HTMLElement, options?: Record<string, unknown>) => ForceGraphInstance | ((el: HTMLElement) => ForceGraphInstance))
    const maybeInstance = maybeFactory(host, { controlType: 'orbit' })
    graph = typeof maybeInstance === 'function' ? maybeInstance(host) : maybeInstance
  }

  const controls = graph.controls()
  if (controls) {
    controls.enableDamping = true
    controls.dampingFactor = 0.09
  }

  graph
    .backgroundColor('#020617')
    .showNavInfo(true)
    .enableNavigationControls(true)
    .enableNodeDrag(false)
    .nodeLabel(() => '')
    .nodeRelSize(3.3)
    .nodeVal((node) => Math.max(1, node.degree + 0.2))
    .nodeOpacity(0.92)
    .nodeColor((node) => {
      if (selectedNodeId && node.id === selectedNodeId) return '#facc15'
      if (hoveredNodeId && node.id === hoveredNodeId) return '#fef08a'
      if (hoveredNodeId && hoveredNeighborIds.has(node.id)) return '#e2e8f0'
      const base = nodeBaseColor(node)
      return shouldDimNode(node.id) ? `${base}44` : base
    })
    .linkVisibility(() => true)
    .linkColor((link) => {
      if (isEdgeHighlighted(link)) return '#f8fafc'
      if (!hoveredNodeId) return '#64748b'
      return '#334155'
    })
    .linkWidth((link) => (isEdgeHighlighted(link) ? 1.4 : 0.45))
    .linkOpacity((link) => (isEdgeHighlighted(link) ? 0.96 : hoveredNodeId ? 0.08 : 0.22))
    .linkDirectionalArrowLength((link) => (isEdgeHighlighted(link) ? 3.4 : 2.6))
    .linkDirectionalArrowRelPos(0.9)
    .linkDirectionalArrowColor((link) => linkArrowColor(link))
    .cooldownTicks(140)
    .cooldownTime(5500)
    .d3VelocityDecay(0.35)
    .onNodeHover((node) => {
      if (hoverThrottleTimer) return
      hoverThrottleTimer = setTimeout(() => {
        hoverThrottleTimer = null
        updateHoverState(node)
      }, HOVER_THROTTLE_MS)
    })
    .onNodeDrag((node) => {
      lastDragAt = Date.now()
      lastDraggedNodeId = node.id
    })
    .onNodeDragEnd((node) => {
      lastDragAt = Date.now()
      lastDraggedNodeId = node.id
    })
    .onNodeClick(onNodeClick)
    .onEngineStop(() => {
      lockNodePositions()
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
  cachedEdges = props.graph.edges.map((edge) => ({ source: edge.source, target: edge.target }))
  graph.graphData({
    nodes: props.graph.nodes.map((node) => ({ ...node })),
    links: cachedEdges.map((edge) => ({ ...edge, type: 'wikilink' as const }))
  })
  updateHoverState(null)
  if (!didInitialAutoFit && props.graph.nodes.length > 0) {
    didInitialAutoFit = true
    window.requestAnimationFrame(() => {
      graph.zoomToFit(350, 35)
    })
  }
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
  if (labelRaf) {
    window.cancelAnimationFrame(labelRaf)
    labelRaf = 0
  }
  hoveredNodeId = ''
  hoveredNeighborIds = new Set<string>()
  highlightedEdgeKeys = new Set<string>()
  cachedEdges = []
  didInitialAutoFit = false
  graphInstance.value?._destructor?.()
  graphInstance.value = null
}

/**
 * Resets camera framing to include the current visible graph.
 */
function resetView() {
  graphInstance.value?.zoomToFit(450, 40)
}

/**
 * Focuses camera on a node by id when available in current graph data.
 */
function focusNodeById(nodeId: string): boolean {
  const graph = graphInstance.value
  if (!graph || !nodeId) return false
  const renderData = graph.graphData()
  const node = (renderData.nodes ?? []).find((candidate) => candidate.id === nodeId)
  if (!node) return false
  focusNode(node)
  emit('select-node', node.id)
  return true
}

watch(
  () => props.graph,
  () => {
    applyGraphData()
  },
  { deep: true }
)

watch(
  () => props.selectedNodeId,
  (value) => {
    selectedNodeId = value ?? ''
    graphInstance.value?.refresh?.()
  },
  { immediate: true }
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

defineExpose({
  resetView,
  focusNodeById
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
        :class="{ 'cosmos-label-emphasized': item.emphasized }"
        :style="{ transform: `translate(${item.x}px, ${item.y}px)`, color: item.color }"
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

.cosmos-label-emphasized {
  background: rgb(255 255 255 / 78%);
  border-radius: 6px;
  padding: 1px 4px;
  text-shadow: none;
}
</style>
