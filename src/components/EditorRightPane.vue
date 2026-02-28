<script setup lang="ts">
/**
 * EditorRightPane
 *
 * Purpose:
 * - Render the right-side outline/backlinks/metadata/properties panel.
 *
 * Boundaries:
 * - Stateless rendering component.
 * - Emits user intents (`outline-click`, `backlink-open`) and relies on parent
 *   for navigation and data loading.
 */

type HeadingNode = { level: 1 | 2 | 3; text: string }
type PropertyPreviewRow = { key: string; value: string }
type MetadataRow = { label: string; value: string }

const props = defineProps<{
  width: number
  outline: HeadingNode[]
  backlinks: string[]
  backlinksLoading: boolean
  metadataRows: MetadataRow[]
  propertiesPreview: PropertyPreviewRow[]
  propertyParseErrorCount: number
  toRelativePath: (path: string) => string
}>()

const emit = defineEmits<{
  'outline-click': [payload: { index: number; heading: HeadingNode }]
  'backlink-open': [path: string]
}>()
</script>

<template>
  <aside class="right-pane" :style="{ width: `${props.width}px` }">
    <div class="pane-section">
      <h3>Outline</h3>
      <div v-if="!props.outline.length" class="placeholder">No headings</div>
      <button
        v-for="(heading, idx) in props.outline"
        :key="`${heading.text}-${idx}`"
        type="button"
        class="outline-row"
        :style="{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }"
        @click="emit('outline-click', { index: idx, heading })"
      >
        {{ heading.text }}
      </button>
    </div>

    <div class="pane-section">
      <h3>Backlinks</h3>
      <div v-if="props.backlinksLoading" class="placeholder">Loading...</div>
      <div v-else-if="!props.backlinks.length" class="placeholder">No backlinks</div>
      <button
        v-for="path in props.backlinks"
        :key="path"
        type="button"
        class="outline-row"
        @click="emit('backlink-open', path)"
      >
        {{ props.toRelativePath(path) }}
      </button>
    </div>

    <div class="pane-section">
      <h3>Metadata</h3>
      <div class="metadata-grid">
        <div v-for="row in props.metadataRows" :key="row.label" class="meta-row">
          <span>{{ row.label }}</span>
          <span :title="row.value">{{ row.value }}</span>
        </div>
      </div>
    </div>

    <div class="pane-section">
      <h3>Properties</h3>
      <div v-if="props.propertyParseErrorCount > 0" class="placeholder">
        {{ props.propertyParseErrorCount }} parse error{{ props.propertyParseErrorCount > 1 ? 's' : '' }}
      </div>
      <div v-else-if="!props.propertiesPreview.length" class="placeholder">No properties</div>
      <div v-else class="metadata-grid">
        <div v-for="row in props.propertiesPreview" :key="row.key" class="meta-row">
          <span>{{ row.key }}</span>
          <span :title="row.value">{{ row.value }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.right-pane {
  min-width: 0;
  min-height: 0;
  background: #f9f9fb;
  border-left: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.ide-root.dark .right-pane {
  background: #21252b;
  border-color: #3e4451;
}

.pane-section {
  border-bottom: 1px solid #e5e7eb;
  padding: 12px 10px;
}

.ide-root.dark .pane-section {
  border-bottom-color: #3e4451;
}

.pane-section h3 {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #737a87;
}

.outline-row {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 4px 8px;
  border-radius: 8px;
  margin: 1px 0;
  font-size: 11px;
  line-height: 1.5;
  color: #737a87;
  transition: background-color 120ms ease, color 120ms ease;
}

.outline-row:hover {
  background: #eff1f5;
  color: #2d313a;
}

.ide-root.dark .outline-row {
  color: #5c6370;
}

.ide-root.dark .outline-row:hover {
  background: #2c313a;
  color: #abb2bf;
}

.metadata-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #737a87;
}

.meta-row span:last-child {
  color: #2d313a;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ide-root.dark .meta-row span:last-child {
  color: #abb2bf;
}

.placeholder {
  color: #737a87;
  font-size: 11px;
  padding: 8px;
}
</style>
