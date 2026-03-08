import { computed, ref, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { useEditorCaretOutline } from './useEditorCaretOutline'
import { useEditorInputHandlers } from './useEditorInputHandlers'
import { useEditorNavigation, type EditorHeadingNode } from './useEditorNavigation'
import { useEditorSlashInsertion } from './useEditorSlashInsertion'
import { useEditorTiptapSetup } from './useEditorTiptapSetup'
import { useEditorWikilinkDataSource } from './useEditorWikilinkDataSource'
import { useEditorWikilinkOverlayState } from './useEditorWikilinkOverlayState'
import { useSlashMenu } from './useSlashMenu'
import type { DocumentSession } from './useDocumentEditorSessions'
import { EDITOR_SLASH_COMMANDS } from '../lib/editorSlashCommands'
import { buildWikilinkCandidates } from '../lib/tiptap/wikilinkCandidates'
import { sanitizeExternalHref } from '../lib/markdownBlocks'
import { normalizeBlockId, normalizeHeadingAnchor, slugifyHeading } from '../lib/wikilinks'
import type { WikilinkCandidate } from '../lib/tiptap/plugins/wikilinkState'

/** Exposes the active document/session surface required for editor interactions. */
export type EditorInteractionRuntimeDocumentPort = {
  currentPath: Ref<string>
  holder: Ref<HTMLDivElement | null>
  activeEditor: Ref<Editor | null>
  getSession: (path: string) => DocumentSession | null
  saveCurrentFile: (manual?: boolean) => Promise<void>
  onEditorDocChanged: (path: string) => void
}

/** Groups the small slice of chrome state that interaction wiring must keep in sync. */
export type EditorInteractionRuntimeChromePort = {
  menus: {
    blockMenuOpen: Ref<boolean>
    tableToolbarOpen: Ref<boolean>
    isDragMenuOpen: () => boolean
    closeBlockMenu: () => void
    hideTableToolbar: () => void
  }
  toolbars: {
    updateFormattingToolbar: () => void
    updateTableToolbar: () => void
    inlineFormatToolbar: {
      updateFormattingToolbar: () => void
      openLinkPopover: () => void
      linkPopoverOpen: Ref<boolean>
      cancelLink: () => void
    }
  }
  zoom: {
    zoomEditorBy: (delta: number) => number
    resetEditorZoom: () => number
  }
}

/** Editor-side async lookups and side effects used by interaction features. */
export type EditorInteractionRuntimeIoPort = {
  loadLinkTargets: () => Promise<string[]>
  loadLinkHeadings: (target: string) => Promise<string[]>
  openLinkTarget: (target: string) => Promise<boolean>
  openExternalUrl: (value: string) => Promise<void>
}

/** Editor-specific callbacks that interaction owns but does not persist itself. */
export type EditorInteractionRuntimeEditorPort = {
  emitOutline: (payload: EditorHeadingNode[]) => void
  requestMermaidReplaceConfirm: (payload: { templateLabel: string }) => Promise<boolean>
}

/**
 * Groups editor behavior wiring so EditorView does not own slash/wikilink/tiptap flow directly.
 */
export type UseEditorInteractionRuntimeOptions = {
  interactionDocumentPort: EditorInteractionRuntimeDocumentPort
  interactionEditorPort: EditorInteractionRuntimeEditorPort
  interactionChromePort: EditorInteractionRuntimeChromePort
  interactionIoPort: EditorInteractionRuntimeIoPort
}

export function useEditorInteractionRuntime(options: UseEditorInteractionRuntimeOptions) {
  const SLASH_COMMANDS = computed(() => EDITOR_SLASH_COMMANDS)
  const lastEditorInteractionAt = ref(0)
  const USER_INTERACTION_CAPTURE_WINDOW_MS = 1200

  const slashMenu = useSlashMenu({
    getEditor: () => options.interactionDocumentPort.activeEditor.value,
    commands: SLASH_COMMANDS,
    closeCompetingMenus: () => options.interactionChromePort.menus.closeBlockMenu()
  })

  const navigation = useEditorNavigation({
    getEditor: () => options.interactionDocumentPort.activeEditor.value,
    emitOutline: (headings) => options.interactionEditorPort.emitOutline(headings),
    normalizeHeadingAnchor,
    slugifyHeading,
    normalizeBlockId
  })

  const caretOutline = useEditorCaretOutline({
    currentPath: options.interactionDocumentPort.currentPath,
    getSession: (path) => options.interactionDocumentPort.getSession(path),
    getEditor: () => options.interactionDocumentPort.activeEditor.value,
    emitOutline: (payload) => {
      options.interactionEditorPort.emitOutline(payload.headings)
    },
    parseOutlineFromDoc: () => navigation.parseOutlineFromDoc()
  })

  const wikilinkDataSource = useEditorWikilinkDataSource({
    loadLinkTargets: options.interactionIoPort.loadLinkTargets,
    loadLinkHeadings: options.interactionIoPort.loadLinkHeadings
  })

  const wikilinkOverlay = useEditorWikilinkOverlayState({
    getEditor: () => options.interactionDocumentPort.activeEditor.value,
    holder: options.interactionDocumentPort.holder,
    blockMenuOpen: options.interactionChromePort.menus.blockMenuOpen,
    isDragMenuOpen: () => options.interactionChromePort.menus.isDragMenuOpen(),
    closeBlockMenu: () => options.interactionChromePort.menus.closeBlockMenu()
  })

  const slashInsertion = useEditorSlashInsertion({
    getEditor: () => options.interactionDocumentPort.activeEditor.value,
    currentTextSelectionContext: slashMenu.currentTextSelectionContext,
    readSlashContext: slashMenu.readSlashContext
  })

  function markEditorInteraction() {
    lastEditorInteractionAt.value = Date.now()
  }

  async function getWikilinkCandidates(query: string): Promise<WikilinkCandidate[]> {
    return buildWikilinkCandidates({
      query,
      loadTargets: () => wikilinkDataSource.loadWikilinkTargets(),
      loadHeadings: (target) => wikilinkDataSource.loadWikilinkHeadings(target),
      currentHeadings: () => navigation.parseOutlineFromDoc().map((item) => item.text),
      resolve: (target) => wikilinkDataSource.resolveWikilinkTarget(target)
    })
  }

  async function openLinkTargetWithAutosave(target: string) {
    const path = options.interactionDocumentPort.currentPath.value
    const session = path ? options.interactionDocumentPort.getSession(path) : null
    if (path && session?.dirty) {
      await options.interactionDocumentPort.saveCurrentFile(false)
      if (options.interactionDocumentPort.getSession(path)?.dirty) return
    }
    await options.interactionIoPort.openLinkTarget(target)
  }

  const tiptapSetup = useEditorTiptapSetup({
    currentPath: options.interactionDocumentPort.currentPath,
    getCurrentEditor: () => options.interactionDocumentPort.activeEditor.value,
    getSessionEditor: (path) => options.interactionDocumentPort.getSession(path)?.editor ?? null,
    markSlashActivatedByUser: slashMenu.markSlashActivatedByUser,
    syncSlashMenuFromSelection: slashMenu.syncSlashMenuFromSelection,
    updateTableToolbar: () => options.interactionChromePort.toolbars.updateTableToolbar(),
    syncWikilinkUiFromPluginState: wikilinkOverlay.syncWikilinkUiFromPluginState,
    captureCaret: caretOutline.captureCaret,
    shouldCaptureCaret: (path) => {
      if (!path || options.interactionDocumentPort.currentPath.value !== path) return false
      if (!options.interactionDocumentPort.holder.value) return false
      const active = typeof document !== 'undefined' ? document.activeElement : null
      if (!active || !options.interactionDocumentPort.holder.value.contains(active)) return false
      return Date.now() - lastEditorInteractionAt.value <= USER_INTERACTION_CAPTURE_WINDOW_MS
    },
    updateFormattingToolbar: () => options.interactionChromePort.toolbars.updateFormattingToolbar(),
    onEditorDocChanged: (path) => options.interactionDocumentPort.onEditorDocChanged(path),
    requestMermaidReplaceConfirm: options.interactionEditorPort.requestMermaidReplaceConfirm,
    getWikilinkCandidates,
    openLinkTargetWithAutosave,
    resolveWikilinkTarget: wikilinkDataSource.resolveWikilinkTarget,
    sanitizeExternalHref,
    openExternalUrl: options.interactionIoPort.openExternalUrl,
    inlineFormatToolbar: {
      updateFormattingToolbar: options.interactionChromePort.toolbars.inlineFormatToolbar.updateFormattingToolbar,
      openLinkPopover: options.interactionChromePort.toolbars.inlineFormatToolbar.openLinkPopover
    }
  })

  const inputHandlers = useEditorInputHandlers({
    editingPort: {
      getEditor: () => options.interactionDocumentPort.activeEditor.value,
      currentPath: options.interactionDocumentPort.currentPath,
      captureCaret: caretOutline.captureCaret,
      currentTextSelectionContext: slashMenu.currentTextSelectionContext,
      insertBlockFromDescriptor: slashInsertion.insertBlockFromDescriptor
    },
    menusPort: {
      visibleSlashCommands: slashMenu.visibleSlashCommands,
      slashOpen: slashMenu.slashOpen,
      slashIndex: slashMenu.slashIndex,
      closeSlashMenu: slashMenu.dismissSlashMenu,
      blockMenuOpen: options.interactionChromePort.menus.blockMenuOpen,
      closeBlockMenu: () => options.interactionChromePort.menus.closeBlockMenu(),
      tableToolbarOpen: options.interactionChromePort.menus.tableToolbarOpen,
      hideTableToolbar: () => options.interactionChromePort.menus.hideTableToolbar(),
      inlineFormatToolbar: {
        linkPopoverOpen: options.interactionChromePort.toolbars.inlineFormatToolbar.linkPopoverOpen,
        cancelLink: options.interactionChromePort.toolbars.inlineFormatToolbar.cancelLink
      }
    },
    uiPort: {
      updateFormattingToolbar: () => options.interactionChromePort.toolbars.updateFormattingToolbar(),
      updateTableToolbar: () => options.interactionChromePort.toolbars.updateTableToolbar(),
      syncSlashMenuFromSelection: slashMenu.syncSlashMenuFromSelection
    },
    zoomPort: {
      zoomEditorBy: (delta) => options.interactionChromePort.zoom.zoomEditorBy(delta),
      resetEditorZoom: () => options.interactionChromePort.zoom.resetEditorZoom()
    }
  })

  return {
    createSessionEditor: (path: string) => tiptapSetup.createSessionEditor(path),
    slashOpen: slashMenu.slashOpen,
    slashIndex: slashMenu.slashIndex,
    slashLeft: slashMenu.slashLeft,
    slashTop: slashMenu.slashTop,
    slashQuery: slashMenu.slashQuery,
    visibleSlashCommands: slashMenu.visibleSlashCommands,
    closeSlashMenu: slashMenu.closeSlashMenu,
    dismissSlashMenu: slashMenu.dismissSlashMenu,
    setSlashQuery: slashMenu.setSlashQuery,
    markSlashActivatedByUser: slashMenu.markSlashActivatedByUser,
    currentTextSelectionContext: slashMenu.currentTextSelectionContext,
    readSlashContext: slashMenu.readSlashContext,
    openSlashAtSelection: slashMenu.openSlashAtSelection,
    syncSlashMenuFromSelection: slashMenu.syncSlashMenuFromSelection,
    wikilinkOpen: wikilinkOverlay.wikilinkOpen,
    wikilinkIndex: wikilinkOverlay.wikilinkIndex,
    wikilinkLeft: wikilinkOverlay.wikilinkLeft,
    wikilinkTop: wikilinkOverlay.wikilinkTop,
    wikilinkResults: wikilinkOverlay.wikilinkResults,
    closeWikilinkMenu: wikilinkOverlay.closeWikilinkMenu,
    syncWikilinkUiFromPluginState: wikilinkOverlay.syncWikilinkUiFromPluginState,
    onWikilinkMenuSelect: wikilinkOverlay.onWikilinkMenuSelect,
    onWikilinkMenuIndexUpdate: wikilinkOverlay.onWikilinkMenuIndexUpdate,
    captureCaret: caretOutline.captureCaret,
    restoreCaret: caretOutline.restoreCaret,
    clearOutlineTimer: caretOutline.clearOutlineTimer,
    emitOutlineSoon: caretOutline.emitOutlineSoon,
    insertBlockFromDescriptor: slashInsertion.insertBlockFromDescriptor,
    onEditorKeydown: inputHandlers.onEditorKeydown,
    onEditorKeyup: inputHandlers.onEditorKeyup,
    onEditorContextMenu: inputHandlers.onEditorContextMenu,
    onEditorPaste: inputHandlers.onEditorPaste,
    openLinkTargetWithAutosave,
    getWikilinkCandidates,
    markEditorInteraction,
    resetWikilinkDataCache: wikilinkDataSource.resetCache,
    revealSnippet: navigation.revealSnippet,
    revealOutlineHeading: navigation.revealOutlineHeading,
    revealAnchor: navigation.revealAnchor
  }
}
