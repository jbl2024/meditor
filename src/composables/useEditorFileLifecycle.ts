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
 * Runtime dependencies required by {@link useEditorFileLifecycle}.
 *
 * Boundary:
 * - This composable delegates all host ownership (session map, status store, emits) through
 *   callbacks instead of mutating external stores directly.
 *
 * Failure behavior:
 * - `openFile`/`saveFile`/`renameFileFromTitle` errors are surfaced through `setSaveError`.
 */
export type UseEditorFileLifecycleOptions = {
  currentPath: Ref<string>
  holder: Ref<HTMLDivElement | null>
  getEditor: () => Editor | null
  getSession: (path: string) => DocumentSession | null
  ensureSession: (path: string) => DocumentSession
  ensurePropertySchemaLoaded: () => Promise<void>
  openFile: (path: string) => Promise<string>
  saveFile: (path: string, text: string, options: { explicit: boolean }) => Promise<{ persisted: boolean }>
  renameFileFromTitle: (path: string, title: string) => Promise<{ path: string; title: string }>
  parseAndStoreFrontmatter: (path: string, sourceMarkdown: string) => void
  frontmatterByPath: Ref<Record<string, FrontmatterEnvelope>>
  propertyEditorMode: Ref<'structured' | 'raw'>
  rawYamlByPath: Ref<Record<string, string>>
  serializableFrontmatterFields: (fields: FrontmatterEnvelope['fields']) => FrontmatterEnvelope['fields']
  moveFrontmatterPathState: (from: string, to: string) => void
  renameSessionPath: (from: string, to: string) => void
  moveLifecyclePathState: (from: string, to: string) => void
  emitPathRenamed: (payload: { from: string; to: string; manual: boolean }) => void
  clearAutosaveTimer: () => void
  clearOutlineTimer: (path: string) => void
  emitOutlineSoon: (path: string) => void
  resetTransientUiState: () => void
  countLines: (input: string) => number
  noteTitleFromPath: (path: string) => string
  readVirtualTitle: (blocks: EditorBlock[]) => string
  blockTextCandidate: (block: EditorBlock | undefined) => string
  withVirtualTitle: (blocks: EditorBlock[], title: string) => { blocks: EditorBlock[]; changed: boolean }
  stripVirtualTitle: (blocks: EditorBlock[]) => EditorBlock[]
  serializeCurrentDocBlocks: () => EditorBlock[]
  renderBlocks: (blocks: EditorBlock[]) => Promise<void>
  restoreCaret: (path: string) => boolean
  setSuppressOnChange: (value: boolean) => void
  setDirty: (path: string, dirty: boolean) => void
  setSaving: (path: string, saving: boolean) => void
  setSaveError: (path: string, message: string) => void
  updateGutterHitboxStyle: () => void
  syncWikilinkUiFromPluginState: () => void
  isCurrentRequest: (requestId: number) => boolean
  largeDocThreshold: number
  ui: EditorLoadUiState
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
 * - Consumes callbacks for path/session state ownership.
 *
 * Side effects:
 * - Reads/writes session state through injected callbacks.
 * - Performs filesystem IO via `openFile` and `saveFile`.
 * - Emits path rename + outline refresh via injected callbacks.
 */
export function useEditorFileLifecycle(options: UseEditorFileLifecycleOptions) {
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
  async function loadCurrentFile(path: string, loadOptions?: { forceReload?: boolean; requestId?: number; skipActivate?: boolean }) {
    if (!path) return
    await options.ensurePropertySchemaLoaded()
    if (typeof loadOptions?.requestId === 'number' && !options.isCurrentRequest(loadOptions.requestId)) return

    const session = options.ensureSession(path)
    const editor = options.getEditor()
    if (!editor) return

    options.setSaveError(path, '')
    options.clearAutosaveTimer()
    options.clearOutlineTimer(path)
    options.resetTransientUiState()
    options.ui.isLoadingLargeDocument.value = false
    options.ui.loadStageLabel.value = ''
    options.ui.loadProgressPercent.value = 0
    options.ui.loadProgressIndeterminate.value = false
    options.ui.loadDocumentStats.value = null

    try {
      if (!session.isLoaded || loadOptions?.forceReload) {
        const txt = await options.openFile(path)
        if (typeof loadOptions?.requestId === 'number' && !options.isCurrentRequest(loadOptions.requestId)) return

        options.parseAndStoreFrontmatter(path, txt)
        const body = options.frontmatterByPath.value[path]?.body ?? txt
        const isLargeDocument = txt.length >= options.largeDocThreshold

        if (isLargeDocument) {
          options.ui.isLoadingLargeDocument.value = true
          options.ui.loadDocumentStats.value = { chars: body.length, lines: options.countLines(body) }
          options.ui.loadStageLabel.value = 'Parsing markdown blocks...'
          options.ui.loadProgressPercent.value = 35
          options.ui.loadProgressIndeterminate.value = false
          await flushUiFrame()
        }

        const parsed = markdownToEditorData(body)
        const normalized = options.withVirtualTitle(parsed.blocks as EditorBlock[], options.noteTitleFromPath(path)).blocks

        if (isLargeDocument) {
          options.ui.loadStageLabel.value = 'Rendering blocks in editor...'
          options.ui.loadProgressPercent.value = 70
          await flushUiFrame()
        }

        options.setSuppressOnChange(true)
        session.editor.commands.setContent(toTiptapDoc(normalized), { emitUpdate: false })
        options.setSuppressOnChange(false)
        session.loadedText = txt
        session.isLoaded = true
        options.setDirty(path, false)
      }

      await nextTick()
      if (typeof loadOptions?.requestId === 'number' && !options.isCurrentRequest(loadOptions.requestId)) return
      if (options.currentPath.value !== path) return

      const remembered = session.scrollTop
      if (options.holder.value && typeof remembered === 'number') {
        options.holder.value.scrollTop = remembered
      }
      if (!options.restoreCaret(path)) {
        editor.commands.focus('end')
      }

      options.emitOutlineSoon(path)
      options.syncWikilinkUiFromPluginState()
      options.updateGutterHitboxStyle()
    } catch (error) {
      options.setSaveError(path, error instanceof Error ? error.message : 'Could not read file.')
    } finally {
      if (typeof loadOptions?.requestId === 'number' && !options.isCurrentRequest(loadOptions.requestId)) return
      options.ui.isLoadingLargeDocument.value = false
      options.ui.loadStageLabel.value = ''
      options.ui.loadProgressPercent.value = 0
      options.ui.loadProgressIndeterminate.value = false
      options.ui.loadDocumentStats.value = null
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
    const editor = options.getEditor()
    const initialPath = options.currentPath.value
    const initialSession = options.getSession(initialPath)
    if (!initialPath || !editor || !initialSession || initialSession.saving) return

    let savePath = initialPath
    options.setSaving(savePath, true)
    if (manual) options.setSaveError(savePath, '')

    try {
      const rawBlocks = options.serializeCurrentDocBlocks()
      const requestedTitle = options.readVirtualTitle(rawBlocks) || options.blockTextCandidate(rawBlocks[0]) || options.noteTitleFromPath(initialPath)
      const lastLoaded = initialSession.loadedText

      const latestOnDisk = await options.openFile(initialPath)
      if (latestOnDisk !== lastLoaded) {
        throw new Error('File changed on disk. Reload before saving to avoid overwrite.')
      }

      const renameResult = await options.renameFileFromTitle(initialPath, requestedTitle)
      savePath = renameResult.path
      const normalized = options.withVirtualTitle(rawBlocks, renameResult.title)
      const markdownBlocks = options.stripVirtualTitle(normalized.blocks)
      const bodyMarkdown = editorDataToMarkdown({ blocks: markdownBlocks })
      const frontmatterState = options.frontmatterByPath.value[savePath] ?? options.frontmatterByPath.value[initialPath]
      const frontmatterYaml = options.propertyEditorMode.value === 'raw'
        ? (options.rawYamlByPath.value[savePath] ?? options.rawYamlByPath.value[initialPath] ?? '')
        : serializeFrontmatter(options.serializableFrontmatterFields(frontmatterState?.fields ?? []))
      const markdown = composeMarkdownDocument(bodyMarkdown, frontmatterYaml)

      if (!manual && savePath === initialPath && markdown === lastLoaded) {
        options.setDirty(savePath, false)
        return
      }

      if (savePath !== initialPath) {
        options.renameSessionPath(initialPath, savePath)
        options.moveLifecyclePathState(initialPath, savePath)
        options.moveFrontmatterPathState(initialPath, savePath)
        options.emitPathRenamed({ from: initialPath, to: savePath, manual })
      }

      if (normalized.changed) {
        await options.renderBlocks(normalized.blocks)
      }

      const result = await options.saveFile(savePath, markdown, { explicit: manual })
      if (!result.persisted) {
        options.setDirty(savePath, true)
        return
      }

      const savedSession = options.getSession(savePath)
      if (savedSession) {
        savedSession.loadedText = markdown
        savedSession.isLoaded = true
      }

      options.parseAndStoreFrontmatter(savePath, markdown)
      options.setDirty(savePath, false)
    } catch (error) {
      options.setSaveError(savePath, error instanceof Error ? error.message : 'Could not save file.')
    } finally {
      options.setSaving(savePath, false)
      options.emitOutlineSoon(savePath)
    }
  }

  return {
    loadCurrentFile,
    saveCurrentFile
  }
}
