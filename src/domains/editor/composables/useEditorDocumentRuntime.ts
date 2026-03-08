import { computed, nextTick, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { useFrontmatterProperties } from './useFrontmatterProperties'
import { useEditorSessionLifecycle } from './useEditorSessionLifecycle'
import { useEditorSessionStatus } from './useEditorSessionStatus'
import { useEditorFileLifecycle } from './useEditorFileLifecycle'
import { useEditorPathWatchers } from './useEditorPathWatchers'
import { useEditorTitleState } from './useEditorTitleState'
import { useEditorMountedSessions } from './useEditorMountedSessions'
import { useDocumentEditorSessions, type PaneId } from './useDocumentEditorSessions'
import { toTiptapDoc } from '../lib/tiptap/editorBlocksToTiptapDoc'
import { fromTiptapDoc } from '../lib/tiptap/tiptapDocToEditorBlocks'
import type { EditorBlock } from '../lib/markdownBlocks'
import type { FrontmatterEnvelope } from '../lib/frontmatter'
import type { WaitForHeavyRenderIdle, HasPendingHeavyRender, EditorLoadUiState } from './useEditorFileLifecycle'

const MAIN_PANE_ID: PaneId = 'main'

/** Groups editor props and persistence I/O consumed by the document runtime. */
export type EditorDocumentRuntimePropsPort = {
  path: Ref<string>
  openPaths: Ref<string[]>
  openFile: (path: string) => Promise<string>
  saveFile: (path: string, text: string, options: { explicit: boolean }) => Promise<{ persisted: boolean }>
  renameFileFromTitle: (path: string, title: string) => Promise<{ path: string; title: string }>
  loadPropertyTypeSchema: () => Promise<Record<string, string>>
  savePropertyTypeSchema: (schema: Record<string, string>) => Promise<void>
}

/** Emits document-facing updates back to the shell. */
export type EditorDocumentRuntimeEmitPort = {
  emitStatus: (payload: { path: string; dirty: boolean; saving: boolean; saveError: string }) => void
  emitOutline: (payload: Array<{ text: string; level: number; id: string }>) => void
  emitProperties: (payload: { path: string; items: Array<{ key: string; value: string }>; parseErrorCount: number }) => void
  emitPathRenamed: (payload: { from: string; to: string; manual: boolean }) => void
}

/** Owns active editor/session access for document lifecycle orchestration. */
export type EditorDocumentRuntimeSessionPort = {
  holder: Ref<HTMLDivElement | null>
  activeEditor: Ref<Editor | null>
  isEditingTitle: () => boolean
  createSessionEditor: (path: string) => Editor
}

/** Keeps only the UI hooks the document runtime truly needs to coordinate with. */
export type EditorDocumentRuntimeUiPort = {
  loading: EditorLoadUiState
  largeDocThreshold: number
  resetTransientUi: () => void
  syncLayout: () => void
  hideTableToolbarAnchor: () => void
  closeCompetingMenus: () => void
  syncAfterSessionChange: () => void
  syncAfterDocumentChange: () => void
  initializeUi: () => Promise<void>
  disposeUi: () => Promise<void>
  interaction: {
    captureCaret: (path: string) => void
    restoreCaret: (path: string) => boolean
    clearOutlineTimer: (path: string) => void
    emitOutlineSoon: (path: string) => void
    closeSlashMenu: () => void
    closeWikilinkMenu: () => void
    syncWikilinkUiFromPluginState: () => void
  }
}

/**
 * Groups document/session lifecycle ownership so EditorView can stay a shell.
 */
export type UseEditorDocumentRuntimeOptions = {
  documentInputPort: EditorDocumentRuntimePropsPort
  documentOutputPort: EditorDocumentRuntimeEmitPort
  documentSessionPort: EditorDocumentRuntimeSessionPort
  documentUiPort: EditorDocumentRuntimeUiPort
  waitForHeavyRenderIdle?: WaitForHeavyRenderIdle
  hasPendingHeavyRender?: HasPendingHeavyRender
}

export function useEditorDocumentRuntime(options: UseEditorDocumentRuntimeOptions) {
  const currentPath = computed(() => options.documentInputPort.path.value?.trim() || '')

  const sessionStore = useDocumentEditorSessions({
    createEditor: (path) => options.documentSessionPort.createSessionEditor(path)
  })
  const lifecycle = useEditorSessionLifecycle({
    emitStatus: (payload) => options.documentOutputPort.emitStatus(payload),
    saveCurrentFile: (manual) => saveCurrentFile(manual),
    isEditingTitle: () => options.documentSessionPort.isEditingTitle(),
    autosaveIdleMs: 1800
  })
  const sessionStatus = useEditorSessionStatus({
    getSession: (path) => sessionStore.getSession(path),
    ensureSession: (path) => sessionStore.ensureSession(path),
    patchStatus: (path, patch) => lifecycle.patchStatus(path, patch),
    clearAutosaveTimer: () => lifecycle.clearAutosaveTimer(),
    scheduleAutosave: () => lifecycle.scheduleAutosave()
  })
  const getSession = sessionStatus.getSession
  const ensureSession = sessionStatus.ensureSession
  const setDirty = sessionStatus.setDirty
  const setSaving = sessionStatus.setSaving
  const setSaveError = sessionStatus.setSaveError
  const clearAutosaveTimer = sessionStatus.clearAutosaveTimer
  const scheduleAutosave = sessionStatus.scheduleAutosave

  function serializeCurrentDocBlocks(): EditorBlock[] {
    const editor = options.documentSessionPort.activeEditor.value
    if (!editor) return []
    return fromTiptapDoc(editor.getJSON())
  }

  async function renderBlocks(blocks: EditorBlock[]) {
    const editor = options.documentSessionPort.activeEditor.value
    if (!editor) return
    const doc = toTiptapDoc(blocks)
    const rememberedScroll = options.documentSessionPort.holder.value?.scrollTop ?? 0
    setSuppressOnChange(true)
    editor.commands.setContent(doc, { emitUpdate: false })
    setSuppressOnChange(false)
    await nextTick()
    options.documentUiPort.syncAfterDocumentChange()
    if (options.documentSessionPort.holder.value) {
      options.documentSessionPort.holder.value.scrollTop = rememberedScroll
    }
  }

  const titleState = useEditorTitleState(currentPath)
  const currentTitle = titleState.currentTitle

  const {
    propertyEditorMode,
    frontmatterByPath,
    rawYamlByPath,
    activeParseErrors,
    activeRawYaml,
    canUseStructuredProperties,
    structuredPropertyFields,
    structuredPropertyKeys,
    ensurePropertySchemaLoaded,
    resetPropertySchemaState,
    parseAndStoreFrontmatter,
    serializableFrontmatterFields,
    addPropertyField,
    removePropertyField,
    onPropertyTypeChange,
    onPropertyKeyInput,
    onPropertyValueInput,
    onPropertyCheckboxInput,
    onPropertyTokensChange,
    effectiveTypeForField,
    isPropertyTypeLocked,
    propertiesExpanded,
    togglePropertiesVisibility,
    onRawYamlInput,
    movePathState: moveFrontmatterPathState
  } = useFrontmatterProperties({
    currentPath,
    loadPropertyTypeSchema: options.documentInputPort.loadPropertyTypeSchema,
    savePropertyTypeSchema: options.documentInputPort.savePropertyTypeSchema,
    onDirty: (path) => {
      setDirty(path, true)
      setSaveError(path, '')
      scheduleAutosave(path)
    },
    emitProperties: (payload) => options.documentOutputPort.emitProperties(payload)
  })

  function onTitleInput(value: string) {
    const path = currentPath.value
    if (!path) return
    titleState.setCurrentTitle(path, value)
    setDirty(path, true)
    setSaveError(path, '')
    scheduleAutosave(path)
  }

  function onTitleCommit() {
    const path = currentPath.value
    if (!path) return
    titleState.commitTitle(path)
  }

  let suppressOnChange = false

  function setSuppressOnChange(value: boolean) {
    suppressOnChange = value
  }

  function onEditorDocChanged(path: string) {
    if (suppressOnChange || !path) return
    setDirty(path, true)
    setSaveError(path, '')
    scheduleAutosave(path)
    options.documentUiPort.interaction.emitOutlineSoon(path)
    options.documentUiPort.syncAfterDocumentChange()
  }

  function setActiveSession(path: string) {
    sessionStore.setActivePath(MAIN_PANE_ID, path)
    options.documentSessionPort.activeEditor.value = getSession(path)?.editor ?? null
    options.documentUiPort.syncAfterSessionChange()
  }

  const mountedSessions = useEditorMountedSessions({
    openPaths: computed(() => options.documentInputPort.openPaths.value ?? []),
    currentPath,
    ensureSession
  })
  const renderPaths = mountedSessions.renderPaths
  const isActiveMountedPath = mountedSessions.isActivePath
  const renderedEditorsByPath = computed<Record<string, Editor | null>>(() => {
    const byPath: Record<string, Editor | null> = {}
    for (const path of renderPaths.value) {
      byPath[path] = getSession(path)?.editor ?? null
    }
    return byPath
  })

  const fileLifecycle = useEditorFileLifecycle({
    sessionPort: {
      currentPath,
      holder: options.documentSessionPort.holder,
      getEditor: () => options.documentSessionPort.activeEditor.value,
      getSession,
      ensureSession,
      renameSessionPath: (from, to) => {
        sessionStore.renamePath(from, to)
      },
      moveLifecyclePathState: (from, to) => lifecycle.movePathState(from, to),
      setSuppressOnChange,
      restoreCaret: (path) => options.documentUiPort.interaction.restoreCaret(path),
      setDirty,
      setSaving,
      setSaveError
    },
    documentPort: {
      ensurePropertySchemaLoaded,
      parseAndStoreFrontmatter,
      frontmatterByPath,
      propertyEditorMode,
      rawYamlByPath,
      serializableFrontmatterFields: serializableFrontmatterFields as (
        fields: FrontmatterEnvelope['fields']
      ) => FrontmatterEnvelope['fields'],
      moveFrontmatterPathState,
      countLines: (input) => input.split('\n').length,
      noteTitleFromPath: titleState.noteTitleFromPath,
      getCurrentTitle: titleState.getTitle,
      syncLoadedTitle: titleState.syncLoadedTitle,
      commitTitle: titleState.commitTitle,
      moveTitlePathState: titleState.movePathState,
      serializeCurrentDocBlocks,
      renderBlocks
    },
    uiPort: {
      clearAutosaveTimer,
      clearOutlineTimer: (path) => options.documentUiPort.interaction.clearOutlineTimer(path),
      emitOutlineSoon: (path) => options.documentUiPort.interaction.emitOutlineSoon(path),
      emitPathRenamed: (payload) => options.documentOutputPort.emitPathRenamed(payload),
      resetTransientUiState: () => options.documentUiPort.resetTransientUi(),
      updateGutterHitboxStyle: () => options.documentUiPort.syncLayout(),
      syncWikilinkUiFromPluginState: () => options.documentUiPort.interaction.syncWikilinkUiFromPluginState(),
      largeDocThreshold: options.documentUiPort.largeDocThreshold,
      ui: options.documentUiPort.loading
    },
    ioPort: {
      openFile: options.documentInputPort.openFile,
      saveFile: options.documentInputPort.saveFile,
      renameFileFromTitle: options.documentInputPort.renameFileFromTitle
    },
    requestPort: {
      isCurrentRequest: (requestId) => lifecycle.isCurrentRequest(requestId)
    },
    waitForHeavyRenderIdle: options.waitForHeavyRenderIdle,
    hasPendingHeavyRender: options.hasPendingHeavyRender
  })

  async function loadCurrentFile(path: string, loadOptions?: { forceReload?: boolean; requestId?: number }) {
    await fileLifecycle.loadCurrentFile(path, loadOptions)
  }

  async function saveCurrentFile(manual = true) {
    await fileLifecycle.saveCurrentFile(manual)
  }

  useEditorPathWatchers({
    path: computed(() => options.documentInputPort.path.value ?? ''),
    openPaths: computed(() => options.documentInputPort.openPaths.value ?? []),
    holder: options.documentSessionPort.holder,
    currentPath,
    nextRequestId: () => lifecycle.nextRequestId(),
    ensureSession,
    setActiveSession,
    loadCurrentFile,
    captureCaret: (path) => options.documentUiPort.interaction.captureCaret(path),
    getSession,
    getActivePath: () => sessionStore.getActivePath(MAIN_PANE_ID),
    setActivePath: (path) => sessionStore.setActivePath(MAIN_PANE_ID, path),
    clearActiveEditor: () => {
      options.documentSessionPort.activeEditor.value = null
      options.documentUiPort.syncAfterSessionChange()
    },
    listPaths: () => sessionStore.listPaths(),
    closePath: (path) => sessionStore.closePath(path),
    resetPropertySchemaState,
    emitEmptyProperties: () => {
      options.documentOutputPort.emitProperties({ path: '', items: [], parseErrorCount: 0 })
    },
    closeSlashMenu: () => options.documentUiPort.interaction.closeSlashMenu(),
    closeWikilinkMenu: () => options.documentUiPort.interaction.closeWikilinkMenu(),
    closeBlockMenu: () => options.documentUiPort.closeCompetingMenus(),
    hideTableToolbarAnchor: () => options.documentUiPort.hideTableToolbarAnchor(),
    emitEmptyOutline: () => {
      options.documentOutputPort.emitOutline([])
    },
    onMountInit: async () => {
      const chromeInitPromise = options.documentUiPort.initializeUi()
      if (currentPath.value) {
        const requestId = lifecycle.nextRequestId()
        ensureSession(currentPath.value)
        setActiveSession(currentPath.value)
        await loadCurrentFile(currentPath.value, { requestId })
      }
      await chromeInitPromise
    },
    onUnmountCleanup: async () => {
      await options.documentUiPort.disposeUi()
      sessionStore.closeAll()
      options.documentSessionPort.activeEditor.value = null
    }
  })

  return {
    currentPath,
    sessionStore,
    getSession,
    ensureSession,
    renderPaths,
    renderedEditorsByPath,
    isActiveMountedPath,
    setActiveSession,
    loadCurrentFile,
    saveCurrentFile,
    clearAutosaveTimer,
    scheduleAutosave,
    nextRequestId: lifecycle.nextRequestId,
    isCurrentRequest: lifecycle.isCurrentRequest,
    setDirty,
    setSaveError,
    currentTitle,
    onTitleInput,
    onTitleCommit,
    onEditorDocChanged,
    serializeCurrentDocBlocks,
    renderBlocks,
    propertyEditorMode,
    frontmatterByPath,
    rawYamlByPath,
    activeParseErrors,
    activeRawYaml,
    canUseStructuredProperties,
    structuredPropertyFields,
    structuredPropertyKeys,
    ensurePropertySchemaLoaded,
    resetPropertySchemaState,
    parseAndStoreFrontmatter,
    serializableFrontmatterFields,
    addPropertyField,
    removePropertyField,
    onPropertyTypeChange,
    onPropertyKeyInput,
    onPropertyValueInput,
    onPropertyCheckboxInput,
    onPropertyTokensChange,
    effectiveTypeForField,
    isPropertyTypeLocked,
    propertiesExpanded,
    togglePropertiesVisibility,
    onRawYamlInput,
    moveFrontmatterPathState,
    isLoadingLargeDocument: options.documentUiPort.loading.isLoadingLargeDocument,
    loadStageLabel: options.documentUiPort.loading.loadStageLabel,
    loadProgressPercent: options.documentUiPort.loading.loadProgressPercent,
    loadProgressIndeterminate: options.documentUiPort.loading.loadProgressIndeterminate,
    loadDocumentStats: options.documentUiPort.loading.loadDocumentStats,
    resetTransientDocumentUiState: options.documentUiPort.resetTransientUi
  }
}
