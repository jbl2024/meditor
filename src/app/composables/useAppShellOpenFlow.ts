import { nextTick, ref, watch, type Ref } from 'vue'
import type { SemanticLink } from '../../shared/api/apiTypes'
import { backlinksForPath, semanticLinksForPath } from '../../shared/api/indexApi'
import {
  bindPendingOpenTrace,
  findOpenTrace,
  finishOpenTrace,
  finishOpenTraceSpan,
  runWithOpenTraceSpan,
  startOpenTrace,
  startOpenTraceSpan,
  traceOpenStep
} from '../../shared/lib/openTrace'
import { formatIsoDate } from '../lib/appShellPaths'
import { parseWikilinkTarget, type WikilinkAnchor } from '../../domains/editor/lib/wikilinks'
import { type HeadingNode } from '../../domains/editor/composables/useEditorState'
import type { QuickOpenResult } from './useAppQuickOpen'
import type { SidebarMode } from './useWorkspaceState'

type VirtualDoc = {
  content: string
  titleLine: string
}

type EditorSurfacePort = {
  focusEditor: () => void
  revealSnippet: (snippet: string) => Promise<void>
  revealAnchor: (anchor: WikilinkAnchor) => Promise<boolean>
  resetCosmosView: () => void
  focusCosmosNodeById: (nodeId: string) => boolean
}

type ExplorerSurfacePort = {
  revealPathInView: (path: string, options?: { focusTree?: boolean; behavior?: ScrollBehavior }) => Promise<void>
}

/**
 * Module: useAppShellOpenFlow
 *
 * Purpose:
 * - Own the shell's note-open workflow, including active-note side effects,
 *   wikilink resolution, search-hit navigation, explorer reveal, and open
 *   tracing.
 *
 * Boundary:
 * - This composable coordinates multiple shell concerns, but it does not own
 *   domain logic for editor rendering, persistence, or workspace indexing.
 * - App.vue injects the ports and keeps the UI assembly and domain controllers
 *   outside this workflow.
 */

export type AppShellOpenFlowWorkspacePort = {
  workingFolderPath: Readonly<Ref<string>>
  sidebarVisible: Readonly<Ref<boolean>>
  previousNonCosmosMode: Ref<SidebarMode>
  setSidebarMode: (mode: SidebarMode) => void
  errorMessage: Ref<string>
}

export type AppShellOpenFlowEditorPort = {
  activeFilePath: Readonly<Ref<string>>
  editorState: {
    setActiveOutline: (outline: HeadingNode[]) => void
    consumeRevealSnippet: (path: string) => string
    setRevealSnippet: (path: string, snippet: string) => void
  }
  editorRef: Readonly<Ref<EditorSurfacePort | null>>
  virtualDocs: Ref<Record<string, VirtualDoc>>
  explorerRef: Readonly<Ref<ExplorerSurfacePort | null>>
}

export type AppShellOpenFlowContextPort = {
  resetForAnchor: (path: string) => void
}

export type AppShellOpenFlowWorkspaceDataPort = {
  refreshActiveFileMetadata: (
    path: string | null,
    options?: { traceId?: string | null; parentSpanId?: string | null }
  ) => Promise<void>
  isMarkdownPath: (path: string) => boolean
  loadWikilinkTargets: () => Promise<string[]>
  pathExists: (path: string) => Promise<boolean>
  readTextFile: (path: string) => Promise<string>
  dailyNotePath: (root: string, date: string) => string
  isIsoDate: (value: string) => boolean
  sanitizeRelativePath: (value: string) => string
  resolveExistingWikilinkPath: (target: string, markdownFiles: string[]) => string | null
  extractHeadingsFromMarkdown: (content: string) => string[]
}

export type AppShellOpenFlowNavigationPort = {
  openTabWithAutosave: (path: string, options?: { traceId?: string | null }) => Promise<boolean>
  openDailyNote: (date: string, openPath: (path: string) => Promise<boolean>) => Promise<boolean>
  recordCosmosHistorySnapshot: () => void
}

export type AppShellOpenFlowUiPort = {
  closeQuickOpen: () => void
}

export type AppShellOpenFlowOptions = {
  workspacePort: AppShellOpenFlowWorkspacePort
  editorPort: AppShellOpenFlowEditorPort
  contextPort: AppShellOpenFlowContextPort
  dataPort: AppShellOpenFlowWorkspaceDataPort
  navigationPort: AppShellOpenFlowNavigationPort
  uiPort: AppShellOpenFlowUiPort
}

export type RefreshBacklinksOptions = {
  path?: string
  traceId?: string | null
  parentSpanId?: string | null
  requestToken?: number
}

export type SearchHit = {
  path: string
  snippet: string
}

function resolvedNoteNavigationFallback(previousNonCosmosMode: Ref<SidebarMode>): SidebarMode {
  const current = previousNonCosmosMode.value
  if (current === 'search' || current === 'favorites' || current === 'explorer') return current
  return 'explorer'
}

/**
 * Owns shell note-opening flows and the active-note refresh lifecycle.
 */
export function useAppShellOpenFlow(options: AppShellOpenFlowOptions) {
  const backlinks = ref<string[]>([])
  const backlinksLoading = ref(false)
  const semanticLinks = ref<SemanticLink[]>([])
  const semanticLinksLoading = ref(false)

  let activeNoteEffectsRequestToken = 0

  function isCurrentActiveNoteEffectsRequest(requestToken: number, path: string) {
    return requestToken === activeNoteEffectsRequestToken && options.editorPort.activeFilePath.value === path
  }

  async function refreshBacklinks(optionsOverride: RefreshBacklinksOptions = {}) {
    const root = options.workspacePort.workingFolderPath.value
    const path = optionsOverride.path ?? options.editorPort.activeFilePath.value
    if (!root || !path) {
      backlinks.value = []
      semanticLinks.value = []
      return
    }

    const traceId = optionsOverride.traceId ?? null
    backlinksLoading.value = true
    semanticLinksLoading.value = true
    try {
      const [results, relatedSemanticLinks] = await Promise.all([
        runWithOpenTraceSpan(traceId, 'open.backlinks', async () => await backlinksForPath(path), {
          parentSpanId: optionsOverride.parentSpanId,
          bucket: 'backlinks',
          payload: { path }
        }),
        runWithOpenTraceSpan(traceId, 'open.semantic_links', async () => await semanticLinksForPath(path), {
          parentSpanId: optionsOverride.parentSpanId,
          bucket: 'semantic_links',
          payload: { path }
        })
      ])
      if (optionsOverride.requestToken && !isCurrentActiveNoteEffectsRequest(optionsOverride.requestToken, path)) {
        return
      }
      backlinks.value = results.map((item) => item.path)
      semanticLinks.value = relatedSemanticLinks
    } catch {
      if (optionsOverride.requestToken && !isCurrentActiveNoteEffectsRequest(optionsOverride.requestToken, path)) {
        return
      }
      backlinks.value = []
      semanticLinks.value = []
    } finally {
      if (!optionsOverride.requestToken || isCurrentActiveNoteEffectsRequest(optionsOverride.requestToken, path)) {
        backlinksLoading.value = false
        semanticLinksLoading.value = false
      }
    }
  }

  async function openTodayNote() {
    return await options.navigationPort.openDailyNote(formatIsoDate(new Date()), options.navigationPort.openTabWithAutosave)
  }

  async function openYesterdayNote() {
    const value = new Date()
    value.setDate(value.getDate() - 1)
    return await options.navigationPort.openDailyNote(formatIsoDate(value), options.navigationPort.openTabWithAutosave)
  }

  async function showExplorerForActiveFile(optionsOverride: { focusTree?: boolean; traceId?: string | null; parentSpanId?: string | null } = {}) {
    options.workspacePort.setSidebarMode('explorer')
    if (!options.workspacePort.sidebarVisible.value) return
    const activePath = options.editorPort.activeFilePath.value
    if (!activePath) return
    await runWithOpenTraceSpan(optionsOverride.traceId ?? null, 'open.explorer_reveal', async () => {
      await nextTick()
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const revealPathInView = options.editorPort.explorerRef.value?.revealPathInView
        if (typeof revealPathInView === 'function') {
          await revealPathInView(activePath, {
            focusTree: optionsOverride.focusTree ?? false,
            behavior: 'auto'
          })
          return
        }
        await nextTick()
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    }, {
      parentSpanId: optionsOverride.parentSpanId,
      bucket: 'explorer_reveal',
      payload: { path: activePath }
    })
  }

  async function openOrPrepareMarkdown(path: string, titleLine: string) {
    if (!options.workspacePort.workingFolderPath.value) {
      options.workspacePort.errorMessage.value = 'Working folder is not set.'
      return false
    }

    let exists = false
    try {
      exists = await options.dataPort.pathExists(path)
    } catch {
      exists = false
    }
    if (exists) {
      const nextVirtual = { ...options.editorPort.virtualDocs.value }
      delete nextVirtual[path]
      options.editorPort.virtualDocs.value = nextVirtual
      const opened = await options.navigationPort.openTabWithAutosave(path)
      if (!opened) return false
      await nextTick()
      options.editorPort.editorRef.value?.focusEditor()
      return true
    }

    if (!options.editorPort.virtualDocs.value[path]) {
      options.editorPort.virtualDocs.value = {
        ...options.editorPort.virtualDocs.value,
        [path]: {
          content: '',
          titleLine
        }
      }
    }

    const opened = await options.navigationPort.openTabWithAutosave(path)
    if (!opened) return false
    await nextTick()
    options.editorPort.editorRef.value?.focusEditor()
    return true
  }

  async function openWikilinkTarget(target: string) {
    const root = options.workspacePort.workingFolderPath.value
    if (!root) return false
    const parsed = parseWikilinkTarget(target)
    const anchor = parsed.anchor
    const normalized = options.dataPort.sanitizeRelativePath(parsed.notePath)
    const revealAnchor = async () => {
      if (!anchor) return true
      await nextTick()
      return await options.editorPort.editorRef.value?.revealAnchor(anchor) ?? false
    }

    if (!normalized) {
      if (!anchor || !options.editorPort.activeFilePath.value) return false
      return await revealAnchor()
    }

    if (normalized.split('/').some((segment) => segment === '.' || segment === '..')) {
      options.workspacePort.errorMessage.value = 'Invalid link target.'
      return false
    }

    if (options.dataPort.isIsoDate(normalized)) {
      const opened = await options.navigationPort.openDailyNote(normalized, options.navigationPort.openTabWithAutosave)
      if (!opened) return false
      return await revealAnchor()
    }

    const markdownFiles = await options.dataPort.loadWikilinkTargets()
    const existing = options.dataPort.resolveExistingWikilinkPath(normalized, markdownFiles)

    if (existing) {
      const opened = await options.navigationPort.openTabWithAutosave(`${root}/${existing}`)
      if (!opened) return false
      const revealed = await revealAnchor()
      if (!anchor || !revealed) {
        options.editorPort.editorRef.value?.focusEditor()
      }
      return true
    }

    const withExtension = /\.(md|markdown)$/i.test(normalized) ? normalized : `${normalized}.md`
    const fullPath = `${root}/${withExtension}`
    const opened = await openOrPrepareMarkdown(fullPath, '')
    if (!opened) return false
    if (!anchor) return true
    return await revealAnchor()
  }

  async function onCosmosOpenNode(path: string) {
    options.navigationPort.recordCosmosHistorySnapshot()
    const root = options.workspacePort.workingFolderPath.value
    const targetPath = root && !path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)
      ? `${root}/${path}`
      : path
    const opened = await options.navigationPort.openTabWithAutosave(targetPath)
    if (!opened) return
    const fallback = resolvedNoteNavigationFallback(options.workspacePort.previousNonCosmosMode)
    options.workspacePort.setSidebarMode(fallback)
    await nextTick()
    if (fallback === 'explorer') {
      await showExplorerForActiveFile({ traceId: null })
    }
    options.editorPort.editorRef.value?.focusEditor()
  }

  async function loadWikilinkHeadings(target: string): Promise<string[]> {
    const root = options.workspacePort.workingFolderPath.value
    if (!root) return []
    const normalized = options.dataPort.sanitizeRelativePath(target)
    if (!normalized) return []
    if (normalized.split('/').some((segment) => segment === '.' || segment === '..')) return []

    try {
      if (options.dataPort.isIsoDate(normalized)) {
        const path = options.dataPort.dailyNotePath(root, normalized)
        if (!(await options.dataPort.pathExists(path))) return []
        return options.dataPort.extractHeadingsFromMarkdown(await options.dataPort.readTextFile(path))
      }

      const markdownFiles = await options.dataPort.loadWikilinkTargets()
      const existing = options.dataPort.resolveExistingWikilinkPath(normalized, markdownFiles)
      if (!existing) return []
      return options.dataPort.extractHeadingsFromMarkdown(await options.dataPort.readTextFile(`${root}/${existing}`))
    } catch {
      return []
    }
  }

  async function openQuickResult(item: QuickOpenResult) {
    if (item.kind === 'file' || item.kind === 'recent') {
      const opened = await options.navigationPort.openTabWithAutosave(item.path)
      if (!opened) return
      options.uiPort.closeQuickOpen()
      nextTick(() => options.editorPort.editorRef.value?.focusEditor())
      return
    }
    void options.navigationPort.openDailyNote(item.date, options.navigationPort.openTabWithAutosave).then((opened) => {
      if (opened) options.uiPort.closeQuickOpen()
    })
  }

  async function onSearchResultOpen(hit: SearchHit) {
    const opened = await options.navigationPort.openTabWithAutosave(hit.path)
    if (!opened) return
    options.editorPort.editorState.setRevealSnippet(hit.path, hit.snippet)

    await nextTick()
    await options.editorPort.editorRef.value?.revealSnippet(hit.snippet)
  }

  async function onBacklinkOpen(path: string) {
    const opened = await options.navigationPort.openTabWithAutosave(path)
    if (!opened) return
    await nextTick()
    options.editorPort.editorRef.value?.focusEditor()
  }

  async function onExplorerOpen(path: string) {
    const traceId = startOpenTrace(path, 'explorer-click')
    bindPendingOpenTrace(path, traceId)
    traceOpenStep(traceId, 'explorer open requested')
    const opened = await options.navigationPort.openTabWithAutosave(path, { traceId })
    if (!opened) {
      finishOpenTrace(traceId, 'blocked', { stage: 'navigation' })
    }
  }

  async function runActiveNoteEffects(path: string) {
    const traceId = findOpenTrace(path)
    const requestToken = ++activeNoteEffectsRequestToken
    traceOpenStep(traceId, 'active note effects started', {
      path,
      request_token: requestToken
    })

    if (!path || !options.dataPort.isMarkdownPath(path)) {
      options.editorPort.editorState.setActiveOutline([])
      backlinks.value = []
      semanticLinks.value = []
      traceOpenStep(traceId, 'active note effects cleared', {
        path,
      request_token: requestToken
      })
      await options.dataPort.refreshActiveFileMetadata(path)
      return
    }

    const activeEffectsSpanId = startOpenTraceSpan(traceId, 'open.active_note_effects', {
      bucket: 'active_note_effects',
      payload: { path }
    })
    const rightPaneSpanId = startOpenTraceSpan(traceId, 'open.right_pane_data', {
      parentSpanId: activeEffectsSpanId,
      bucket: 'right_pane_data',
      payload: { path }
    })

    const finishBlocked = (stage: string) => {
      finishOpenTraceSpan(traceId, rightPaneSpanId, 'blocked', { stage, path })
      finishOpenTraceSpan(traceId, activeEffectsSpanId, 'blocked', { stage, path })
      finishOpenTrace(traceId, 'blocked', { stage, path })
    }

    try {
      traceOpenStep(traceId, 'active note metadata refresh started', {
        path,
        request_token: requestToken
      })
      await options.dataPort.refreshActiveFileMetadata(path, {
        traceId,
        parentSpanId: activeEffectsSpanId
      })
      traceOpenStep(traceId, 'active note metadata refresh finished', {
        path,
        request_token: requestToken
      })
      if (!isCurrentActiveNoteEffectsRequest(requestToken, path)) {
        finishBlocked('stale_after_metadata')
        return
      }

      const snippet = options.editorPort.editorState.consumeRevealSnippet(path)
      traceOpenStep(traceId, 'active note reveal snippet check', {
        path,
        request_token: requestToken,
        has_snippet: Boolean(snippet)
      })
      if (snippet) {
        await runWithOpenTraceSpan(traceId, 'open.reveal_snippet', async () => {
          await nextTick()
          await options.editorPort.editorRef.value?.revealSnippet(snippet)
        }, {
          parentSpanId: activeEffectsSpanId,
          payload: { path, chars: snippet.length }
        })
        traceOpenStep(traceId, 'active note reveal snippet finished', {
          path,
          chars: snippet.length,
          request_token: requestToken
        })
      }
      if (!isCurrentActiveNoteEffectsRequest(requestToken, path)) {
        finishBlocked('stale_after_reveal_snippet')
        return
      }

      traceOpenStep(traceId, 'active note backlinks refresh started', {
        path,
        request_token: requestToken
      })
      await refreshBacklinks({
        path,
        traceId,
        parentSpanId: rightPaneSpanId,
        requestToken
      })
      traceOpenStep(traceId, 'active note backlinks refresh finished', {
        path,
        backlink_count: backlinks.value.length,
        semantic_count: semanticLinks.value.length,
        request_token: requestToken
      })
      if (!isCurrentActiveNoteEffectsRequest(requestToken, path)) {
        finishBlocked('stale_after_right_pane')
        return
      }

      finishOpenTraceSpan(traceId, rightPaneSpanId, 'done', { path })
      finishOpenTraceSpan(traceId, activeEffectsSpanId, 'done', { path })
      finishOpenTrace(traceId, 'done', {
        stage: 'open.complete',
        path
      })
    } catch (error) {
      finishOpenTraceSpan(traceId, rightPaneSpanId, 'error', { path })
      finishOpenTraceSpan(traceId, activeEffectsSpanId, 'error', { path })
      finishOpenTrace(traceId, 'error', {
        stage: 'active_note_effects',
        path,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  watch(
    () => options.editorPort.activeFilePath.value,
    (path) => {
      options.contextPort.resetForAnchor(path ?? '')
      const isInitialRun = activeNoteEffectsRequestToken === 0
      if (isInitialRun) {
        activeNoteEffectsRequestToken += 1
        if (!path) {
          options.editorPort.editorState.setActiveOutline([])
          backlinks.value = []
          semanticLinks.value = []
        }
        void options.dataPort.refreshActiveFileMetadata(path)
        return
      }
      void runActiveNoteEffects(path)
    },
    { immediate: true }
  )

  return {
    backlinks,
    backlinksLoading,
    semanticLinks,
    semanticLinksLoading,
    refreshBacklinks,
    openTodayNote,
    openYesterdayNote,
    showExplorerForActiveFile,
    openWikilinkTarget,
    onCosmosOpenNode,
    loadWikilinkHeadings,
    openQuickResult,
    onSearchResultOpen,
    onBacklinkOpen,
    onExplorerOpen,
    runActiveNoteEffects
  }
}
