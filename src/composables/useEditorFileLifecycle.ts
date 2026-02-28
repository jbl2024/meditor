import { nextTick, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import type { EditorBlock } from '../lib/markdownBlocks'
import { editorDataToMarkdown, markdownToEditorData } from '../lib/markdownBlocks'
import { composeMarkdownDocument, serializeFrontmatter, type FrontmatterEnvelope } from '../lib/frontmatter'
import { toTiptapDoc } from '../lib/tiptap/editorBlocksToTiptapDoc'
import type { DocumentSession } from './useDocumentEditorSessions'

/**
 * Mutable loading-overlay refs controlled by file load orchestration.
 *
 * Invariant:
 * - These refs are always reset in `finally` after `loadCurrentFile` unless a newer request
 *   supersedes the current one and exits early through request-id guards.
 */
export type EditorLoadUiState = {
  isLoadingLargeDocument: Ref<boolean>
  loadStageLabel: Ref<string>
  loadProgressPercent: Ref<number>
  loadProgressIndeterminate: Ref<boolean>
  loadDocumentStats: Ref<{ chars: number; lines: number } | null>
}

/**
 * Session/runtime ownership callbacks used by file lifecycle orchestration.
 */
export type EditorFileLifecycleSessionPort = {
  currentPath: Ref<string>
  holder: Ref<HTMLDivElement | null>
  getEditor: () => Editor | null
  getSession: (path: string) => DocumentSession | null
  ensureSession: (path: string) => DocumentSession
  renameSessionPath: (from: string, to: string) => void
  moveLifecyclePathState: (from: string, to: string) => void
  setSuppressOnChange: (value: boolean) => void
  restoreCaret: (path: string) => boolean
  setDirty: (path: string, dirty: boolean) => void
  setSaving: (path: string, saving: boolean) => void
  setSaveError: (path: string, message: string) => void
}

/**
 * Document parsing/serialization and title/frontmatter callbacks.
 */
export type EditorFileLifecycleDocumentPort = {
  ensurePropertySchemaLoaded: () => Promise<void>
  parseAndStoreFrontmatter: (path: string, sourceMarkdown: string) => void
  frontmatterByPath: Ref<Record<string, FrontmatterEnvelope>>
  propertyEditorMode: Ref<'structured' | 'raw'>
  rawYamlByPath: Ref<Record<string, string>>
  serializableFrontmatterFields: (fields: FrontmatterEnvelope['fields']) => FrontmatterEnvelope['fields']
  moveFrontmatterPathState: (from: string, to: string) => void
  countLines: (input: string) => number
  noteTitleFromPath: (path: string) => string
  readVirtualTitle: (blocks: EditorBlock[]) => string
  blockTextCandidate: (block: EditorBlock | undefined) => string
  withVirtualTitle: (blocks: EditorBlock[], title: string) => { blocks: EditorBlock[]; changed: boolean }
  stripVirtualTitle: (blocks: EditorBlock[]) => EditorBlock[]
  serializeCurrentDocBlocks: () => EditorBlock[]
  renderBlocks: (blocks: EditorBlock[]) => Promise<void>
}

/**
 * Host UI side effects and emits coordinated during load/save flows.
 */
export type EditorFileLifecycleUiPort = {
  clearAutosaveTimer: () => void
  clearOutlineTimer: (path: string) => void
  emitOutlineSoon: (path: string) => void
  emitPathRenamed: (payload: { from: string; to: string; manual: boolean }) => void
  resetTransientUiState: () => void
  updateGutterHitboxStyle: () => void
  syncWikilinkUiFromPluginState: () => void
  ui: EditorLoadUiState
  largeDocThreshold: number
}

/**
 * Read/write IO adapters for markdown documents.
 */
export type EditorFileLifecycleIoPort = {
  openFile: (path: string) => Promise<string>
  saveFile: (path: string, text: string, options: { explicit: boolean }) => Promise<{ persisted: boolean }>
  renameFileFromTitle: (path: string, title: string) => Promise<{ path: string; title: string }>
}

/**
 * Request-token guard adapter.
 */
export type EditorFileLifecycleRequestPort = {
  isCurrentRequest: (requestId: number) => boolean
}

/**
 * Runtime dependencies required by {@link useEditorFileLifecycle}.
 *
 * Boundary:
 * - This composable delegates host ownership through grouped ports.
 * - Grouped ports keep the top-level contract stable and reviewable.
 */
export type UseEditorFileLifecycleOptions = {
  sessionPort: EditorFileLifecycleSessionPort
  documentPort: EditorFileLifecycleDocumentPort
  uiPort: EditorFileLifecycleUiPort
  ioPort: EditorFileLifecycleIoPort
  requestPort: EditorFileLifecycleRequestPort
}

/**
 * useEditorFileLifecycle
 *
 * Purpose:
 * - Own file load/save orchestration for per-path editor sessions.
 *
 * Responsibilities:
 * - Guard async operations with request-token checks.
 * - Apply frontmatter + markdown conversions for load/save.
 * - Coordinate transient UI reset, loading overlay state, and status updates.
 *
 * Boundaries:
 * - Does not define editor schema/interaction behavior.
 * - Consumes grouped ports for path/session state ownership.
 *
 * Side effects:
 * - Reads/writes session state through injected callbacks.
 * - Performs filesystem IO via `openFile` and `saveFile`.
 * - Emits path rename + outline refresh via injected callbacks.
 */
export function useEditorFileLifecycle(options: UseEditorFileLifecycleOptions) {
  const { sessionPort, documentPort, uiPort, ioPort, requestPort } = options

  async function flushUiFrame() {
    await nextTick()
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
  }

  /**
   * Loads a file into the active session editor.
   *
   * Invariants:
   * - Drops stale completions using `requestId` guard checks before and after async steps.
   * - Never applies loaded content when `currentPath` changed mid-flight.
   *
   * Failure behavior:
   * - Catches read/parse errors and stores a user-safe message via `setSaveError`.
   */
  async function loadCurrentFile(path: string, loadOptions?: { forceReload?: boolean; requestId?: number }) {
    if (!path) return
    await documentPort.ensurePropertySchemaLoaded()
    if (typeof loadOptions?.requestId === 'number' && !requestPort.isCurrentRequest(loadOptions.requestId)) return

    const session = sessionPort.ensureSession(path)
    const editor = sessionPort.getEditor()
    if (!editor) return

    sessionPort.setSaveError(path, '')
    uiPort.clearAutosaveTimer()
    uiPort.clearOutlineTimer(path)
    uiPort.resetTransientUiState()
    uiPort.ui.isLoadingLargeDocument.value = false
    uiPort.ui.loadStageLabel.value = ''
    uiPort.ui.loadProgressPercent.value = 0
    uiPort.ui.loadProgressIndeterminate.value = false
    uiPort.ui.loadDocumentStats.value = null

    try {
      if (!session.isLoaded || loadOptions?.forceReload) {
        const txt = await ioPort.openFile(path)
        if (typeof loadOptions?.requestId === 'number' && !requestPort.isCurrentRequest(loadOptions.requestId)) return

        documentPort.parseAndStoreFrontmatter(path, txt)
        const body = documentPort.frontmatterByPath.value[path]?.body ?? txt
        const isLargeDocument = txt.length >= uiPort.largeDocThreshold

        if (isLargeDocument) {
          uiPort.ui.isLoadingLargeDocument.value = true
          uiPort.ui.loadDocumentStats.value = { chars: body.length, lines: documentPort.countLines(body) }
          uiPort.ui.loadStageLabel.value = 'Parsing markdown blocks...'
          uiPort.ui.loadProgressPercent.value = 35
          uiPort.ui.loadProgressIndeterminate.value = false
          await flushUiFrame()
        }

        const parsed = markdownToEditorData(body)
        const normalized = documentPort.withVirtualTitle(parsed.blocks as EditorBlock[], documentPort.noteTitleFromPath(path)).blocks

        if (isLargeDocument) {
          uiPort.ui.loadStageLabel.value = 'Rendering blocks in editor...'
          uiPort.ui.loadProgressPercent.value = 70
          await flushUiFrame()
        }

        sessionPort.setSuppressOnChange(true)
        session.editor.commands.setContent(toTiptapDoc(normalized), { emitUpdate: false })
        sessionPort.setSuppressOnChange(false)
        session.loadedText = txt
        session.isLoaded = true
        sessionPort.setDirty(path, false)
      }

      await nextTick()
      if (typeof loadOptions?.requestId === 'number' && !requestPort.isCurrentRequest(loadOptions.requestId)) return
      if (sessionPort.currentPath.value !== path) return

      const remembered = session.scrollTop
      if (sessionPort.holder.value && typeof remembered === 'number') {
        sessionPort.holder.value.scrollTop = remembered
      }
      if (!sessionPort.restoreCaret(path)) {
        editor.commands.focus('end')
      }

      uiPort.emitOutlineSoon(path)
      uiPort.syncWikilinkUiFromPluginState()
      uiPort.updateGutterHitboxStyle()
    } catch (error) {
      sessionPort.setSaveError(path, error instanceof Error ? error.message : 'Could not read file.')
    } finally {
      if (typeof loadOptions?.requestId === 'number' && !requestPort.isCurrentRequest(loadOptions.requestId)) return
      uiPort.ui.isLoadingLargeDocument.value = false
      uiPort.ui.loadStageLabel.value = ''
      uiPort.ui.loadProgressPercent.value = 0
      uiPort.ui.loadProgressIndeterminate.value = false
      uiPort.ui.loadDocumentStats.value = null
    }
  }

  /**
   * Saves active editor content and reconciles title-driven rename before persistence.
   *
   * Why/invariant:
   * - Save validates on-disk text equality before rename/write to avoid overwriting concurrent
   *   external edits.
   * - Rename state transfer (`renameSessionPath`/`move*PathState`) occurs before writing so
   *   subsequent state updates are attributed to the final path.
   *
   * Failure behavior:
   * - Any step failure records an error with `setSaveError` and still clears `saving` in `finally`.
   */
  async function saveCurrentFile(manual = true) {
    const editor = sessionPort.getEditor()
    const initialPath = sessionPort.currentPath.value
    const initialSession = sessionPort.getSession(initialPath)
    if (!initialPath || !editor || !initialSession || initialSession.saving) return

    let savePath = initialPath
    sessionPort.setSaving(savePath, true)
    if (manual) sessionPort.setSaveError(savePath, '')

    try {
      const rawBlocks = documentPort.serializeCurrentDocBlocks()
      const requestedTitle = documentPort.readVirtualTitle(rawBlocks) || documentPort.blockTextCandidate(rawBlocks[0]) || documentPort.noteTitleFromPath(initialPath)
      const lastLoaded = initialSession.loadedText

      const latestOnDisk = await ioPort.openFile(initialPath)
      if (latestOnDisk !== lastLoaded) {
        throw new Error('File changed on disk. Reload before saving to avoid overwrite.')
      }

      const renameResult = await ioPort.renameFileFromTitle(initialPath, requestedTitle)
      savePath = renameResult.path
      const normalized = documentPort.withVirtualTitle(rawBlocks, renameResult.title)
      const markdownBlocks = documentPort.stripVirtualTitle(normalized.blocks)
      const bodyMarkdown = editorDataToMarkdown({ blocks: markdownBlocks })
      const frontmatterState = documentPort.frontmatterByPath.value[savePath] ?? documentPort.frontmatterByPath.value[initialPath]
      const frontmatterYaml = documentPort.propertyEditorMode.value === 'raw'
        ? (documentPort.rawYamlByPath.value[savePath] ?? documentPort.rawYamlByPath.value[initialPath] ?? '')
        : serializeFrontmatter(documentPort.serializableFrontmatterFields(frontmatterState?.fields ?? []))
      const markdown = composeMarkdownDocument(bodyMarkdown, frontmatterYaml)

      if (!manual && savePath === initialPath && markdown === lastLoaded) {
        sessionPort.setDirty(savePath, false)
        return
      }

      if (savePath !== initialPath) {
        sessionPort.renameSessionPath(initialPath, savePath)
        sessionPort.moveLifecyclePathState(initialPath, savePath)
        documentPort.moveFrontmatterPathState(initialPath, savePath)
        uiPort.emitPathRenamed({ from: initialPath, to: savePath, manual })
      }

      if (normalized.changed) {
        await documentPort.renderBlocks(normalized.blocks)
      }

      const result = await ioPort.saveFile(savePath, markdown, { explicit: manual })
      if (!result.persisted) {
        sessionPort.setDirty(savePath, true)
        return
      }

      const savedSession = sessionPort.getSession(savePath)
      if (savedSession) {
        savedSession.loadedText = markdown
        savedSession.isLoaded = true
      }

      documentPort.parseAndStoreFrontmatter(savePath, markdown)
      sessionPort.setDirty(savePath, false)
    } catch (error) {
      sessionPort.setSaveError(savePath, error instanceof Error ? error.message : 'Could not save file.')
    } finally {
      sessionPort.setSaving(savePath, false)
      uiPort.emitOutlineSoon(savePath)
    }
  }

  return {
    loadCurrentFile,
    saveCurrentFile
  }
}
