<script setup lang="ts">
/**
 * Sidebar controls and context cards for Cosmos graph exploration.
 *
 * The component owns panel layout/scroll behavior while remaining stateless
 * regarding graph business logic.
 */
import type { CosmosGraphNode } from '../../lib/graphIndex'

type GraphSummary = {
  nodes: number
  edges: number
}

const props = defineProps<{
  summary: GraphSummary
  query: string
  matches: CosmosGraphNode[]
  focusMode: boolean
  focusDepth: number
  selectedNode: CosmosGraphNode | null
  selectedLinkCount: number
  preview: string
  previewLoading: boolean
  previewError: string
  outgoingNodes: CosmosGraphNode[]
  incomingNodes: CosmosGraphNode[]
  loading: boolean
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  'search-enter': []
  'select-match': [nodeId: string]
  'toggle-focus-mode': [value: boolean]
  'expand-neighborhood': []
  'jump-related': [nodeId: string]
  'open-selected': []
  'reset-view': []
}>()

/** Emits query updates without mutating parent-owned state directly. */
function onQueryInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  emit('update:query', target?.value ?? '')
}

/** Emits focus mode checkbox state for parent-side controller updates. */
function onFocusModeChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  emit('toggle-focus-mode', Boolean(target?.checked))
}
</script>

<template>
  <section class="cosmos-sidebar-panel">
    <div class="cosmos-panel-controls">
      <p class="cosmos-panel-title">Cosmos</p>
      <p class="cosmos-panel-meta">{{ summary.nodes }} nodes · {{ summary.edges }} edges</p>
      <p class="cosmos-panel-help">Click a node to select it. Double-click to focus. Press Esc to return.</p>
      <input
        :value="query"
        class="cosmos-search-input"
        type="text"
        placeholder="Search node path..."
        autocomplete="new-password"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        @input="onQueryInput"
        @keydown.enter.prevent="emit('search-enter')"
      >
      <div v-if="query.trim()" class="cosmos-match-list">
        <button
          v-for="match in matches"
          :key="match.id"
          type="button"
          class="cosmos-match-item"
          @click="emit('select-match', match.id)"
        >
          {{ match.label }}
        </button>
        <p v-if="!matches.length" class="cosmos-match-empty">No matches.</p>
      </div>
      <label class="cosmos-toggle">
        <input :checked="focusMode" type="checkbox" @change="onFocusModeChange">
        <span>Focus mode (selected + neighbors)</span>
      </label>
      <p v-if="focusMode" class="cosmos-focus-depth">Depth: {{ focusDepth }}</p>
      <button
        type="button"
        class="cosmos-reset-btn"
        :disabled="!selectedNode"
        @click="emit('expand-neighborhood')"
      >
        Expand neighborhood
      </button>
      <button
        type="button"
        class="cosmos-reset-btn"
        :disabled="loading || !summary.nodes"
        @click="emit('reset-view')"
      >
        Reset view
      </button>
    </div>

    <div class="cosmos-panel-content">
      <div v-if="selectedNode" class="cosmos-node-stats">
        <button type="button" class="cosmos-node-title-link" @click="emit('open-selected')">
          {{ selectedNode.displayLabel || selectedNode.label }}
        </button>
        <p class="cosmos-node-meta">Degree: {{ selectedNode.degree }} · Cluster: {{ selectedNode.cluster }}</p>
        <p class="cosmos-node-meta">Visible links: {{ selectedLinkCount }}</p>
        <p v-if="previewLoading" class="cosmos-node-preview">Loading preview...</p>
        <p v-else-if="previewError" class="cosmos-node-preview cosmos-node-preview-error">{{ previewError }}</p>
        <pre v-else class="cosmos-node-preview">{{ preview || 'No preview content.' }}</pre>
      </div>

      <div v-if="selectedNode" class="cosmos-links-card">
        <p class="cosmos-links-title">From this note ({{ outgoingNodes.length }})</p>
        <div v-if="!outgoingNodes.length" class="cosmos-links-empty">No outgoing links.</div>
        <div v-else class="cosmos-links-list">
          <button
            v-for="node in outgoingNodes"
            :key="`out-${node.id}`"
            type="button"
            class="cosmos-links-item"
            @click="emit('jump-related', node.id)"
          >
            {{ node.label }}
          </button>
        </div>

        <p class="cosmos-links-title">Backlinks ({{ incomingNodes.length }})</p>
        <div v-if="!incomingNodes.length" class="cosmos-links-empty">No backlinks.</div>
        <div v-else class="cosmos-links-list">
          <button
            v-for="node in incomingNodes"
            :key="`in-${node.id}`"
            type="button"
            class="cosmos-links-item"
            @click="emit('jump-related', node.id)"
          >
            {{ node.label }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cosmos-sidebar-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}

.cosmos-panel-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f2f4f8;
  padding: 8px 4px 4px;
}

.cosmos-panel-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 4px 8px;
}

.cosmos-panel-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.cosmos-panel-meta {
  margin: 0;
  color: #475569;
  font-size: 12px;
}

.cosmos-panel-help {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}

.cosmos-search-input {
  width: 100%;
  height: 30px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0 8px;
  font-size: 12px;
  background: #fff;
  color: #0f172a;
}

.cosmos-match-list {
  max-height: 132px;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cosmos-match-item {
  border: 0;
  background: #e2e8f0;
  color: #0f172a;
  border-radius: 6px;
  padding: 4px 6px;
  text-align: left;
  font-size: 11px;
}

.cosmos-match-empty {
  margin: 0;
  font-size: 11px;
  color: #64748b;
}

.cosmos-toggle {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: #334155;
}

.cosmos-focus-depth {
  margin: 0;
  font-size: 11px;
  color: #64748b;
}

.cosmos-reset-btn {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #1e293b;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
}

.cosmos-reset-btn:hover:not(:disabled) {
  background: #f8fafc;
}

.cosmos-reset-btn:disabled {
  opacity: 0.55;
}

.cosmos-node-stats {
  padding: 8px;
  border-radius: 8px;
  background: #e2e8f0;
  display: flex;
  flex-direction: column;
}

.cosmos-node-title {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
}

.cosmos-node-title-link {
  border: 0;
  background: transparent;
  margin: 0;
  padding: 0;
  font-size: 12px;
  font-weight: 700;
  color: #1d4ed8;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.cosmos-node-path,
.cosmos-node-meta {
  margin: 4px 0 0;
  font-size: 11px;
  color: #334155;
}

.cosmos-node-preview {
  margin: 8px 0 0;
  white-space: pre-wrap;
  font-size: 11px;
  line-height: 1.35;
  color: #0f172a;
  min-height: calc(10 * 1.35em + 20px);
  max-height: calc(10 * 1.35em + 20px);
  overflow: auto;
  flex: 0 0 auto;
  background: rgb(255 255 255 / 48%);
  border-radius: 6px;
  padding: 10px;
}

.cosmos-node-preview-error {
  color: #b91c1c;
}

.cosmos-links-card {
  padding: 8px;
  border-radius: 8px;
  background: #e2e8f0;
}

.cosmos-links-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  color: #0f172a;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cosmos-links-empty {
  margin: 0 0 8px;
  font-size: 11px;
  color: #475569;
}

.cosmos-links-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 140px;
  overflow: auto;
  margin-bottom: 8px;
}

.cosmos-links-item {
  border: 0;
  border-radius: 6px;
  text-align: left;
  font-size: 11px;
  color: #1e293b;
  background: #cbd5e1;
  padding: 4px 6px;
}

:global(.ide-root.dark) .cosmos-panel-controls {
  background: #21252b;
}

:global(.ide-root.dark) .cosmos-panel-title,
:global(.ide-root.dark) .cosmos-node-title,
:global(.ide-root.dark) .cosmos-node-title-link,
:global(.ide-root.dark) .cosmos-node-path,
:global(.ide-root.dark) .cosmos-node-meta,
:global(.ide-root.dark) .cosmos-links-title,
:global(.ide-root.dark) .cosmos-links-empty {
  color: #e2e8f0;
}

:global(.ide-root.dark) .cosmos-panel-meta,
:global(.ide-root.dark) .cosmos-panel-help,
:global(.ide-root.dark) .cosmos-focus-depth,
:global(.ide-root.dark) .cosmos-match-empty {
  color: #94a3b8;
}

:global(.ide-root.dark) .cosmos-search-input {
  border-color: #475569;
  background: #1e293b;
  color: #e2e8f0;
}

:global(.ide-root.dark) .cosmos-match-item {
  background: #334155;
  color: #e2e8f0;
}

:global(.ide-root.dark) .cosmos-toggle {
  color: #cbd5e1;
}

:global(.ide-root.dark) .cosmos-node-stats,
:global(.ide-root.dark) .cosmos-links-card {
  background: #334155;
}

:global(.ide-root.dark) .cosmos-node-preview {
  color: #e2e8f0;
  background: rgb(15 23 42 / 45%);
}

:global(.ide-root.dark) .cosmos-node-preview-error {
  color: #fecaca;
}

:global(.ide-root.dark) .cosmos-links-item {
  color: #e2e8f0;
  background: #475569;
}

:global(.ide-root.dark) .cosmos-reset-btn {
  border-color: #475569;
  background: #1e293b;
  color: #e2e8f0;
}

:global(.ide-root.dark) .cosmos-reset-btn:hover:not(:disabled) {
  background: #334155;
}
</style>
