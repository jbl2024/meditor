<script setup lang="ts">
import { FolderIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import SearchSidebarPanel from './SearchSidebarPanel.vue'
import ExplorerTree from '../explorer/ExplorerTree.vue'
import type { SearchMode } from '../../lib/searchMode'

/**
 * Module: SidebarSurface
 *
 * Purpose:
 * - Render the app-shell activity bar and left sidebar container.
 * - Keep sidebar markup out of `App.vue` while preserving shell-owned state.
 */

type SearchHit = { path: string; snippet: string; score: number }
type SearchResultGroup = { path: string; items: SearchHit[] }

/** Props required to render the app shell sidebar and its two panel modes. */
const props = defineProps<{
  sidebarVisible: boolean
  sidebarMode: 'explorer' | 'search'
  workingFolderPath: string
  hasWorkspace: boolean
  leftPaneWidth: number
  activeFilePath: string
  searchQuery: string
  globalSearchMode: SearchMode
  searchModeOptions: Array<{ mode: SearchMode; label: string }>
  showSearchScore: boolean
  hasSearched: boolean
  searchLoading: boolean
  groupedSearchResults: SearchResultGroup[]
  toRelativePath: (path: string) => string
  formatSearchScore: (value: number) => string
  parseSearchSnippet: (snippet: string) => Array<{ text: string; highlighted: boolean }>
}>()

/** Events emitted by sidebar controls so the parent shell remains the only state owner. */
const emit = defineEmits<{
  setSidebarMode: [mode: 'explorer' | 'search']
  explorerOpen: [path: string]
  explorerPathRenamed: [payload: { from: string; to: string }]
  explorerRequestCreate: [payload: { parentPath: string; entryKind: 'file' | 'folder' }]
  explorerSelection: [paths: string[]]
  explorerError: [message: string]
  selectWorkingFolder: []
  updateSearchQuery: [value: string]
  runGlobalSearch: []
  selectGlobalSearchMode: [mode: SearchMode]
  openSearchResult: [hit: SearchHit]
}>()

const explorerTreeRef = ref<InstanceType<typeof ExplorerTree> | null>(null)
const sidebarTitle = computed(() => props.sidebarMode)

/** Forwards explorer tree path reveal to the parent shell without leaking internals. */
async function revealPathInView(
  path: string,
  options?: { focusTree?: boolean; behavior?: ScrollBehavior }
): Promise<void> {
  await explorerTreeRef.value?.revealPathInView(path, options)
}

defineExpose({
  revealPathInView
})
</script>

<template>
  <aside class="activity-bar">
    <button
      class="activity-btn"
      :class="{ active: sidebarMode === 'explorer' && sidebarVisible }"
      type="button"
      title="Explorer"
      aria-label="Explorer"
      @click="emit('setSidebarMode', 'explorer')"
    >
      <FolderIcon class="activity-btn-icon" />
    </button>
    <button
      class="activity-btn"
      :class="{ active: sidebarMode === 'search' && sidebarVisible }"
      type="button"
      title="Search"
      aria-label="Search"
      @click="emit('setSidebarMode', 'search')"
    >
      <MagnifyingGlassIcon class="activity-btn-icon" />
    </button>
  </aside>

  <aside
    v-if="sidebarVisible"
    class="left-sidebar"
    :style="{ width: `${leftPaneWidth}px` }"
  >
    <div class="panel-header">
      <h2 class="panel-title">{{ sidebarTitle }}</h2>
    </div>

    <div class="panel-body" :class="{ 'panel-body-explorer': sidebarMode === 'explorer' }">
      <div v-if="sidebarMode === 'explorer'" class="panel-fill">
        <ExplorerTree
          v-if="hasWorkspace"
          ref="explorerTreeRef"
          :folder-path="workingFolderPath"
          :active-path="activeFilePath"
          @open="emit('explorerOpen', $event)"
          @path-renamed="emit('explorerPathRenamed', $event)"
          @request-create="emit('explorerRequestCreate', $event)"
          @select="emit('explorerSelection', $event)"
          @error="emit('explorerError', $event)"
        />
        <div v-else class="placeholder empty-explorer">
          <span>No workspace selected.</span>
          <button type="button" class="inline-link-btn" @click="emit('selectWorkingFolder')">Open folder</button>
        </div>
      </div>

      <SearchSidebarPanel
        v-else-if="sidebarMode === 'search'"
        :disabled="!hasWorkspace"
        :query="searchQuery"
        :mode="globalSearchMode"
        :mode-options="searchModeOptions"
        :show-search-score="showSearchScore"
        :has-searched="hasSearched"
        :search-loading="searchLoading"
        :grouped-results="groupedSearchResults"
        :to-relative-path="toRelativePath"
        :format-search-score="formatSearchScore"
        :snippet-parts="parseSearchSnippet"
        @update:query="emit('updateSearchQuery', $event)"
        @enter="emit('runGlobalSearch')"
        @select-mode="emit('selectGlobalSearchMode', $event)"
        @open-result="emit('openSearchResult', $event)"
      />

      <div v-else class="placeholder">No panel selected</div>
    </div>
  </aside>
</template>
