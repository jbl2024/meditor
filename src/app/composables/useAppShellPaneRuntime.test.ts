import { nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppShellPaneRuntime } from './useAppShellPaneRuntime'

describe('useAppShellPaneRuntime', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('handles pane tabs, editor state, Cosmos actions, and global search mode', async () => {
    const clearStatus = vi.fn()
    const updateStatus = vi.fn()
    const setActiveOutline = vi.fn()
    const saveNow = vi.fn(async () => {})
    const resetCosmosView = vi.fn()
    const focusCosmosNodeById = vi.fn()
    const setActivePane = vi.fn()
    const setActiveTabInPane = vi.fn()
    const closeTabInPane = vi.fn()
    const closeOtherTabsInPane = vi.fn()
    const closeAllTabsInPane = vi.fn()
    const setSidebarMode = vi.fn()
    const toggleSidebar = vi.fn()
    const selectGlobalSearchMode = vi.fn((mode: 'hybrid' | 'semantic' | 'lexical') => ({
      caret: mode === 'hybrid' ? 0 : 9
    }))
    const recordCosmosHistorySnapshot = vi.fn()
    const scheduleCosmosHistorySnapshot = vi.fn()
    const onCosmosOpenNode = vi.fn(async () => {})
    const input = document.createElement('input')
    const focusSpy = vi.spyOn(input, 'focus')
    const selectionSpy = vi.spyOn(input, 'setSelectionRange')
    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      return selector === '[data-search-input="true"]' ? (input as HTMLInputElement) : null
    })

    const api = useAppShellPaneRuntime({
      activeFilePath: ref('/vault/active.md'),
      multiPane: {
        layout: ref({
          activePaneId: 'pane-1',
          panesById: {
            'pane-1': {
              activeTabId: 'doc-1',
              openTabs: [
                { id: 'doc-1', type: 'document', path: '/vault/doc-1.md' },
                { id: 'home-1', type: 'home', pinned: false }
              ]
            }
          }
        }),
        setActivePane,
        setActiveTabInPane,
        closeTabInPane,
        closeOtherTabsInPane,
        closeAllTabsInPane,
        getActiveTab: () => ({ type: 'document', path: '/vault/doc-1.md' }),
        getActiveDocumentPath: () => '/vault/doc-1.md'
      },
      editorState: {
        updateStatus,
        clearStatus,
        setActiveOutline
      },
      editorRef: ref({
        saveNow,
        resetCosmosView,
        focusCosmosNodeById,
        revealAnchor: vi.fn(),
        revealOutlineHeading: vi.fn()
      }),
      cosmos: {
        selectedNodeId: ref('node-1'),
        focusMode: ref(true),
        showSemanticEdges: ref(false),
        query: ref('semantic: hello'),
        selectedNode: ref({ id: 'node-1' }),
        searchEnter: vi.fn(() => 'node-2'),
        focusMatch: vi.fn(),
        expandNeighborhood: vi.fn(),
        jumpToRelated: vi.fn(),
        openSelected: vi.fn(() => ({ path: '/vault/selected.md' })),
        selectNode: vi.fn(),
        refreshGraph: vi.fn(async () => {}),
        error: ref('')
      },
      workspace: {
        sidebarMode: ref<'explorer' | 'favorites' | 'search'>('explorer'),
        previousNonCosmosMode: ref<'explorer' | 'favorites' | 'search'>('explorer'),
        setSidebarMode,
        toggleSidebar
      },
      search: {
        selectGlobalSearchMode
      },
      setActiveTabWithAutosave: vi.fn(async () => true),
      scheduleCosmosHistorySnapshot,
      recordCosmosHistorySnapshot,
      onCosmosOpenNode,
      propertiesPreview: ref([]),
      propertyParseErrorCount: ref(0)
    })

    await api.onPaneTabClick({ paneId: 'pane-1', tabId: 'doc-1' })
    expect(setActivePane).toHaveBeenCalledWith('pane-1')

    api.onPaneTabClose({ paneId: 'pane-1', tabId: 'doc-1' })
    expect(closeTabInPane).toHaveBeenCalledWith('pane-1', 'doc-1')
    expect(clearStatus).toHaveBeenCalledWith('/vault/doc-1.md')

    api.onPaneTabCloseOthers({ paneId: 'pane-1', tabId: 'doc-1' })
    expect(closeOtherTabsInPane).toHaveBeenCalledWith('pane-1', 'doc-1')

    api.onPaneTabCloseAll({ paneId: 'pane-1' })
    expect(closeAllTabsInPane).toHaveBeenCalledWith('pane-1')

    api.onEditorStatus({ path: '/vault/active.md', dirty: true, saving: false, saveError: '' })
    expect(updateStatus).toHaveBeenCalledWith('/vault/active.md', {
      dirty: true,
      saving: false,
      saveError: ''
    })

    api.onEditorOutline([{ level: 1, text: 'Heading' }])
    expect(setActiveOutline).toHaveBeenCalledWith([{ level: 1, text: 'Heading' }])

    api.onCosmosResetView()
    expect(resetCosmosView).toHaveBeenCalled()
    expect(recordCosmosHistorySnapshot).toHaveBeenCalled()

    api.onCosmosQueryUpdate('hello')
    expect(scheduleCosmosHistorySnapshot).toHaveBeenCalled()

    api.onCosmosToggleFocusMode(false)
    api.onCosmosToggleSemanticEdges(true)
    api.onCosmosSelectNode('node-2')
    api.onCosmosSearchEnter()
    api.onCosmosMatchClick('node-3')
    api.onCosmosExpandNeighborhood()
    api.onCosmosJumpToRelatedNode('node-4')
    api.onCosmosLocateSelectedNode()
    await api.onCosmosOpenSelectedNode()
    api.scheduleCosmosNodeFocus('node-5')
    await nextTick()
    expect(focusCosmosNodeById).toHaveBeenCalledWith('node-2')
    expect(focusCosmosNodeById).toHaveBeenCalledWith('node-5')
    expect(onCosmosOpenNode).toHaveBeenCalledWith('/vault/selected.md')

    api.onGlobalSearchModeSelect('semantic')
    await nextTick()
    expect(selectGlobalSearchMode).toHaveBeenCalledWith('semantic')
    expect(focusSpy).toHaveBeenCalled()
    expect(selectionSpy).toHaveBeenCalledWith(9, 9)

    await api.saveActiveTab()
    expect(saveNow).toHaveBeenCalled()
  })

  it('switches sidebar mode through the injected workspace port', () => {
    const sidebarMode = ref<'explorer' | 'favorites' | 'search'>('explorer')
    const previousNonCosmosMode = ref<'explorer' | 'favorites' | 'search'>('explorer')
    const setSidebarMode = vi.fn((mode: 'explorer' | 'favorites' | 'search') => {
      sidebarMode.value = mode
    })
    const toggleSidebar = vi.fn()

    const api = useAppShellPaneRuntime({
      activeFilePath: ref(''),
      multiPane: {
        layout: ref({ activePaneId: 'pane-1', panesById: {} }),
        setActivePane: vi.fn(),
        setActiveTabInPane: vi.fn(),
        closeTabInPane: vi.fn(),
        closeOtherTabsInPane: vi.fn(),
        closeAllTabsInPane: vi.fn(),
        getActiveTab: () => null,
        getActiveDocumentPath: () => null
      },
      editorState: {
        updateStatus: vi.fn(),
        clearStatus: vi.fn(),
        setActiveOutline: vi.fn()
      },
      editorRef: ref(null),
      cosmos: {
        selectedNodeId: ref(''),
        focusMode: ref(false),
        showSemanticEdges: ref(false),
        query: ref(''),
        selectedNode: ref(null),
        searchEnter: vi.fn(() => null),
        focusMatch: vi.fn(),
        expandNeighborhood: vi.fn(),
        jumpToRelated: vi.fn(),
        openSelected: vi.fn(() => null),
        selectNode: vi.fn(),
        refreshGraph: vi.fn(async () => {}),
        error: ref('')
      },
      workspace: {
        sidebarMode,
        previousNonCosmosMode,
        setSidebarMode,
        toggleSidebar
      },
      search: {
        selectGlobalSearchMode: vi.fn((mode: 'hybrid' | 'semantic' | 'lexical') => ({
          caret: mode === 'hybrid' ? 0 : 7
        }))
      },
      setActiveTabWithAutosave: vi.fn(async () => true),
      scheduleCosmosHistorySnapshot: vi.fn(),
      recordCosmosHistorySnapshot: vi.fn(),
      onCosmosOpenNode: vi.fn(async () => {}),
      propertiesPreview: ref([]),
      propertyParseErrorCount: ref(0)
    })

    api.setSidebarMode('search')
    expect(previousNonCosmosMode.value).toBe('search')
    expect(setSidebarMode).toHaveBeenCalledWith('search')

    api.setSidebarMode('search')
    expect(toggleSidebar).toHaveBeenCalled()
  })
})
