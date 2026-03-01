import { computed, ref, watch, type Ref } from 'vue'
import type { WikilinkGraph } from '../lib/api'
import { type CosmosGraph, type CosmosGraphNode, buildCosmosGraph as defaultBuildCosmosGraph } from '../lib/graphIndex'

type GraphSummary = {
  nodes: number
  edges: number
}

type CosmosDeps = {
  workingFolderPath: Readonly<Ref<string>>
  activeTabPath: Readonly<Ref<string>>
  getWikilinkGraph: () => Promise<WikilinkGraph>
  reindexMarkdownFile: (path: string) => Promise<void>
  readTextFile: (path: string) => Promise<string>
  buildCosmosGraph?: (raw: WikilinkGraph) => CosmosGraph
}

type OpenSelectedResult = {
  path: string
} | null

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path)
}

/**
 * Produces a compact, readable preview used in the Cosmos context card.
 */
function buildPreview(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 48)
    .join('\n')
    .slice(0, 6400)
}

/**
 * Creates the Cosmos graph controller used by the sidebar panel and 3D canvas.
 *
 * Responsibilities:
 * - fetch and shape graph data from the indexed backend payload,
 * - derive panel-friendly computed state (selection, links, matches),
 * - keep preview loading isolated from the rendering component.
 */
export function useCosmosController(deps: CosmosDeps) {
  const graph = ref<CosmosGraph>({ nodes: [], edges: [], generated_at_ms: 0 })
  const loading = ref(false)
  const error = ref('')
  const query = ref('')
  const selectedNodeId = ref('')
  const focusMode = ref(false)
  const focusDepth = ref(1)
  const preview = ref('')
  const previewLoading = ref(false)
  const previewError = ref('')

  let previewRequestToken = 0

  const summary = computed<GraphSummary>(() => ({
    nodes: graph.value.nodes.length,
    edges: graph.value.edges.length
  }))

  const nodeById = computed(() => new Map(graph.value.nodes.map((node) => [node.id, node])))
  const selectedNode = computed(() => nodeById.value.get(selectedNodeId.value) ?? null)

  const selectedLinkCount = computed(() => {
    const selected = selectedNodeId.value
    if (!selected) return 0
    return graph.value.edges.filter((edge) => edge.source === selected || edge.target === selected).length
  })

  const outgoingNodes = computed(() => {
    const selected = selectedNodeId.value
    if (!selected) return []
    const outgoingIds = graph.value.edges.filter((edge) => edge.source === selected).map((edge) => edge.target)
    return Array.from(new Set(outgoingIds))
      .map((id) => nodeById.value.get(id))
      .filter((node): node is CosmosGraphNode => Boolean(node))
      .sort((a, b) => a.label.localeCompare(b.label))
  })

  const incomingNodes = computed(() => {
    const selected = selectedNodeId.value
    if (!selected) return []
    const incomingIds = graph.value.edges.filter((edge) => edge.target === selected).map((edge) => edge.source)
    return Array.from(new Set(incomingIds))
      .map((id) => nodeById.value.get(id))
      .filter((node): node is CosmosGraphNode => Boolean(node))
      .sort((a, b) => a.label.localeCompare(b.label))
  })

  const queryMatches = computed(() => {
    const value = query.value.trim().toLowerCase()
    if (!value) return []
    return graph.value.nodes
      .filter((node) => node.label.toLowerCase().includes(value) || node.path.toLowerCase().includes(value))
      .slice(0, 12)
  })

  const visibleGraph = computed<CosmosGraph>(() => {
    if (!focusMode.value || !selectedNodeId.value) {
      return graph.value
    }

    const adjacency = new Map<string, Set<string>>()
    for (const node of graph.value.nodes) {
      adjacency.set(node.id, new Set<string>())
    }
    for (const edge of graph.value.edges) {
      adjacency.get(edge.source)?.add(edge.target)
      adjacency.get(edge.target)?.add(edge.source)
    }

    const visible = new Set<string>([selectedNodeId.value])
    let frontier = new Set<string>([selectedNodeId.value])
    for (let depth = 0; depth < Math.max(1, focusDepth.value); depth += 1) {
      const next = new Set<string>()
      for (const nodeId of frontier) {
        for (const neighbor of adjacency.get(nodeId) ?? []) {
          if (!visible.has(neighbor)) {
            visible.add(neighbor)
            next.add(neighbor)
          }
        }
      }
      if (!next.size) break
      frontier = next
    }

    return {
      generated_at_ms: graph.value.generated_at_ms,
      nodes: graph.value.nodes.filter((node) => visible.has(node.id)),
      edges: graph.value.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target))
    }
  })

  async function loadSelectedPreview() {
    const node = selectedNode.value
    const requestToken = ++previewRequestToken
    if (!node?.path) {
      preview.value = ''
      previewError.value = ''
      previewLoading.value = false
      return
    }

    previewLoading.value = true
    previewError.value = ''
    try {
      const markdown = await deps.readTextFile(node.path)
      if (requestToken !== previewRequestToken) return
      preview.value = buildPreview(markdown)
    } catch (err) {
      if (requestToken !== previewRequestToken) return
      preview.value = ''
      previewError.value = err instanceof Error ? err.message : 'Could not load preview.'
    } finally {
      if (requestToken === previewRequestToken) {
        previewLoading.value = false
      }
    }
  }

  /**
   * Loads and reshapes the indexed wikilink graph for Cosmos rendering.
   */
  async function refreshGraph() {
    if (!deps.workingFolderPath.value) {
      graph.value = { nodes: [], edges: [], generated_at_ms: 0 }
      error.value = ''
      return
    }

    loading.value = true
    error.value = ''
    try {
      const active = deps.activeTabPath.value
      if (active && isMarkdownPath(active)) {
        await deps.reindexMarkdownFile(active)
      }
      const raw = await deps.getWikilinkGraph()
      const shape = deps.buildCosmosGraph ?? defaultBuildCosmosGraph
      graph.value = shape(raw)

      if (!graph.value.nodes.some((node) => node.id === selectedNodeId.value)) {
        selectedNodeId.value = ''
        focusDepth.value = 1
      }
    } catch (err) {
      graph.value = { nodes: [], edges: [], generated_at_ms: 0 }
      error.value = err instanceof Error ? err.message : 'Could not load graph.'
    } finally {
      loading.value = false
    }
  }

  function selectNode(nodeId: string) {
    const searchSnapshot = query.value
    selectedNodeId.value = nodeId
    if (query.value !== searchSnapshot) {
      query.value = searchSnapshot
    }
  }

  function focusMatch(nodeId: string): string {
    const searchSnapshot = query.value
    selectedNodeId.value = nodeId
    if (query.value !== searchSnapshot) {
      query.value = searchSnapshot
    }
    return nodeId
  }

  function searchEnter(): string | null {
    const first = queryMatches.value[0]
    if (!first) return null
    focusMatch(first.id)
    return first.id
  }

  function expandNeighborhood() {
    if (!selectedNodeId.value) return
    focusMode.value = true
    focusDepth.value = Math.min(8, focusDepth.value + 1)
  }

  function jumpToRelated(nodeId: string): string {
    return focusMatch(nodeId)
  }

  function openSelected(): OpenSelectedResult {
    const node = selectedNode.value
    if (!node) return null
    return { path: node.path }
  }

  function resetSelection() {
    selectedNodeId.value = ''
    focusMode.value = false
    focusDepth.value = 1
    preview.value = ''
    previewLoading.value = false
    previewError.value = ''
  }

  function clearState() {
    graph.value = { nodes: [], edges: [], generated_at_ms: 0 }
    error.value = ''
    loading.value = false
    query.value = ''
    resetSelection()
  }

  watch(
    () => selectedNodeId.value,
    () => {
      void loadSelectedPreview()
    }
  )

  return {
    graph,
    visibleGraph,
    loading,
    error,
    query,
    selectedNodeId,
    focusMode,
    focusDepth,
    preview,
    previewLoading,
    previewError,
    summary,
    queryMatches,
    selectedNode,
    selectedLinkCount,
    outgoingNodes,
    incomingNodes,
    refreshGraph,
    selectNode,
    focusMatch,
    searchEnter,
    expandNeighborhood,
    jumpToRelated,
    openSelected,
    resetSelection,
    clearState
  }
}
