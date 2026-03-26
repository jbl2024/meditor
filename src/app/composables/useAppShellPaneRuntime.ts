import { nextTick, type Ref } from 'vue'
import type { SearchMode } from '../../shared/lib/searchMode'
import type { SidebarMode } from './useWorkspaceState'
import { clearEditorStatusForPaths, documentPathsForPane } from '../lib/appShellPane'

/**
 * Module: useAppShellPaneRuntime
 *
 * Purpose:
 * - Own the shell event handlers for pane tabs, editor status updates, and
 *   Cosmos pane interactions.
 *
 * Boundary:
 * - Keeps pane/editor/cosmos glue out of `App.vue`.
 * - Does not own domain state; it only coordinates the existing shell ports.
 */
type PaneTab =
  | { id: string; type: 'document'; path: string }
  | { id: string; type: 'home' | 'cosmos' | 'second-brain-chat' | 'alter-exploration' | 'alters'; pinned?: boolean }

type PaneState = {
  activeTabId: string
  openTabs: PaneTab[]
}

type MultiPanePort = {
  layout: Ref<{ activePaneId: string; panesById: Record<string, PaneState> }>
  setActivePane: (paneId: string) => void
  setActiveTabInPane: (paneId: string, tabId: string) => void
  closeTabInPane: (paneId: string, tabId: string) => void
  closeOtherTabsInPane: (paneId: string, tabId: string) => void
  closeAllTabsInPane: (paneId: string) => void
  getActiveTab: () => { type: string; path?: string } | null
  getActiveDocumentPath: (paneId?: string) => string | null
}

type EditorStatePort = {
  updateStatus: (path: string, status: { dirty: boolean; saving: boolean; saveError: string }) => void
  clearStatus: (path: string) => void
  setActiveOutline: (payload: Array<{ level: 1 | 2 | 3; text: string }>) => void
}

type EditorRefPort = Ref<{
  saveNow: () => Promise<void>
  resetCosmosView: () => void
  focusCosmosNodeById: (nodeId: string) => void
  revealAnchor: (payload: { heading: string }) => Promise<boolean | void> | boolean | void
  revealOutlineHeading: (index: number) => Promise<void> | void
} | null>

type CosmosPort = {
  selectedNodeId: Ref<string>
  focusMode: Ref<boolean>
  showSemanticEdges: Ref<boolean>
  query: Ref<string>
  selectedNode: Ref<{ id: string } | null>
  searchEnter: () => string | null
  focusMatch: (nodeId: string) => void
  expandNeighborhood: () => void
  jumpToRelated: (nodeId: string) => void
  openSelected: () => { path: string } | null
  selectNode: (nodeId: string) => void
  refreshGraph: () => Promise<void>
  error: Ref<string>
}

type WorkspacePort = {
  sidebarMode: Ref<SidebarMode>
  previousNonCosmosMode: Ref<SidebarMode>
  setSidebarMode: (mode: SidebarMode) => void
  toggleSidebar: () => void
}

type SearchPort = {
  selectGlobalSearchMode: (mode: SearchMode) => { caret: number }
}

type Options = {
  activeFilePath: Ref<string>
  multiPane: MultiPanePort
  editorState: EditorStatePort
  editorRef: EditorRefPort
  cosmos: CosmosPort
  workspace: WorkspacePort
  search: SearchPort
  setActiveTabWithAutosave: (path: string) => Promise<boolean>
  scheduleCosmosHistorySnapshot: () => void
  recordCosmosHistorySnapshot: () => void
  onCosmosOpenNode: (path: string) => Promise<void>
  propertiesPreview: Ref<Array<{ key: string; value: string }>>
  propertyParseErrorCount: Ref<number>
}

export function useAppShellPaneRuntime(options: Options) {
  async function onPaneTabClick(payload: { paneId: string; tabId: string }) {
    options.multiPane.setActivePane(payload.paneId)
    const pane = options.multiPane.layout.value.panesById[payload.paneId]
    const tab = pane?.openTabs.find((item) => item.id === payload.tabId)
    if (!tab) return
    if (tab.type === 'document') {
      const opened = await options.setActiveTabWithAutosave(tab.path)
      if (!opened) return
      return
    }
    options.multiPane.setActiveTabInPane(payload.paneId, payload.tabId)
  }

  function onPaneTabClose(payload: { paneId: string; tabId: string }) {
    const pane = options.multiPane.layout.value.panesById[payload.paneId]
    const tab = pane?.openTabs.find((item) => item.id === payload.tabId)
    options.multiPane.closeTabInPane(payload.paneId, payload.tabId)
    if (tab?.type === 'document') {
      options.editorState.clearStatus(tab.path)
    }
  }

  function onPaneTabCloseOthers(payload: { paneId: string; tabId: string }) {
    options.multiPane.closeOtherTabsInPane(payload.paneId, payload.tabId)
  }

  function onPaneTabCloseAll(payload: { paneId: string }) {
    const paths = documentPathsForPane(options.multiPane.layout.value.panesById, payload.paneId)
    options.multiPane.closeAllTabsInPane(payload.paneId)
    clearEditorStatusForPaths(paths, (path) => options.editorState.clearStatus(path))
  }

  function closeActiveTab() {
    const paneId = options.multiPane.layout.value.activePaneId
    const pane = options.multiPane.layout.value.panesById[paneId]
    const tab = pane?.openTabs.find((item) => item.id === pane.activeTabId)
    if (!tab) return
    options.multiPane.closeTabInPane(paneId, tab.id)
    if (tab.type === 'document') {
      options.editorState.clearStatus(tab.path)
    }
  }

  function onEditorStatus(payload: { path: string; dirty: boolean; saving: boolean; saveError: string }) {
    options.editorState.updateStatus(payload.path, {
      dirty: payload.dirty,
      saving: payload.saving,
      saveError: payload.saveError
    })
  }

  function onEditorOutline(payload: Array<{ level: 1 | 2 | 3; text: string }>) {
    options.editorState.setActiveOutline(payload)
  }

  function onEditorProperties(payload: { path: string; items: Array<{ key: string; value: string }>; parseErrorCount: number }) {
    if (!options.activeFilePath.value || payload.path !== options.activeFilePath.value) {
      if (!payload.path) {
        options.propertiesPreview.value = []
        options.propertyParseErrorCount.value = 0
      }
      return
    }
    options.propertiesPreview.value = payload.items
    options.propertyParseErrorCount.value = payload.parseErrorCount
  }

  function setSidebarMode(mode: SidebarMode) {
    const target = mode === 'search' ? 'search' : mode === 'favorites' ? 'favorites' : 'explorer'
    if (options.workspace.sidebarMode.value === target) {
      options.workspace.toggleSidebar()
      return
    }
    options.workspace.previousNonCosmosMode.value = target
    options.workspace.setSidebarMode(target)
  }

  function onCosmosResetView() {
    options.cosmos.selectedNodeId.value = ''
    options.cosmos.focusMode.value = false
    options.editorRef.value?.resetCosmosView()
    options.recordCosmosHistorySnapshot()
  }

  function onCosmosQueryUpdate(value: string) {
    options.cosmos.query.value = value
    options.scheduleCosmosHistorySnapshot()
  }

  function onCosmosToggleFocusMode(value: boolean) {
    options.cosmos.focusMode.value = value
    options.recordCosmosHistorySnapshot()
  }

  function onCosmosToggleSemanticEdges(value: boolean) {
    options.cosmos.showSemanticEdges.value = value
    options.recordCosmosHistorySnapshot()
  }

  function onCosmosSelectNode(nodeId: string) {
    options.cosmos.selectNode(nodeId)
    options.recordCosmosHistorySnapshot()
  }

  function onCosmosSearchEnter() {
    const nodeId = options.cosmos.searchEnter()
    if (!nodeId) return
    options.editorRef.value?.focusCosmosNodeById(nodeId)
    options.recordCosmosHistorySnapshot()
  }

  function onCosmosMatchClick(nodeId: string) {
    options.cosmos.focusMatch(nodeId)
    options.editorRef.value?.focusCosmosNodeById(nodeId)
    options.recordCosmosHistorySnapshot()
  }

  function onCosmosExpandNeighborhood() {
    options.cosmos.expandNeighborhood()
    options.recordCosmosHistorySnapshot()
  }

  function onCosmosJumpToRelatedNode(nodeId: string) {
    options.cosmos.jumpToRelated(nodeId)
    options.editorRef.value?.focusCosmosNodeById(nodeId)
    options.recordCosmosHistorySnapshot()
  }

  function onCosmosLocateSelectedNode() {
    const selected = options.cosmos.selectedNode.value
    if (!selected) return
    options.editorRef.value?.focusCosmosNodeById(selected.id)
  }

  async function onCosmosOpenSelectedNode() {
    const selected = options.cosmos.openSelected()
    if (!selected) return
    await options.onCosmosOpenNode(selected.path)
  }

  function onGlobalSearchModeSelect(mode: SearchMode) {
    const next = options.search.selectGlobalSearchMode(mode)
    void nextTick(() => {
      const input = document.querySelector<HTMLInputElement>('[data-search-input="true"]')
      if (!input) return
      input.focus()
      input.setSelectionRange(next.caret, next.caret)
    })
  }

  async function saveActiveTab() {
    await options.editorRef.value?.saveNow()
  }

  return {
    onPaneTabClick,
    onPaneTabClose,
    onPaneTabCloseOthers,
    onPaneTabCloseAll,
    closeActiveTab,
    onEditorStatus,
    onEditorOutline,
    onEditorProperties,
    setSidebarMode,
    onCosmosResetView,
    onCosmosQueryUpdate,
    onCosmosToggleFocusMode,
    onCosmosToggleSemanticEdges,
    onCosmosSelectNode,
    onCosmosSearchEnter,
    onCosmosMatchClick,
    onCosmosExpandNeighborhood,
    onCosmosJumpToRelatedNode,
    onCosmosLocateSelectedNode,
    onCosmosOpenSelectedNode,
    onGlobalSearchModeSelect,
    saveActiveTab
  }
}
