import type { OutputBlockData } from '@editorjs/editorjs'
import { ref } from 'vue'

type MarkdownParseResult = {
  version: string
  blocks: unknown[]
}

/**
 * Options required by {@link useEditorDocumentLifecycle}.
 */
export type UseEditorDocumentLifecycleOptions = {
  largeDocumentThreshold?: number
  ensureEditor: () => Promise<void>
  ensurePropertySchemaLoaded: () => Promise<void>
  hasActiveEditor: () => boolean
  clearAutosaveTimer: () => void
  closeSlashMenu: () => void
  closeWikilinkMenu: () => void
  setSaveError: (path: string, error: string) => void
  openFile: (path: string) => Promise<string>
  parseAndStoreFrontmatter: (path: string, markdown: string) => void
  resolveEditorBody: (path: string, rawMarkdown: string) => string
  markdownToEditorData: (markdown: string) => MarkdownParseResult
  normalizeLoadedBlocks: (blocks: OutputBlockData[], path: string) => OutputBlockData[]
  setLoadedText: (path: string, markdown: string) => void
  setSuppressOnChange: (value: boolean) => void
  renderEditor: (payload: { version: string; blocks: OutputBlockData[] }) => Promise<void>
  setDirty: (path: string, dirty: boolean) => void
  ensureCodeBlockUi: () => void
  nextUiTick: () => Promise<void>
  getRememberedScrollTop: (path: string) => number | undefined
  setEditorScrollTop: (value: number) => void
  restoreCaret: (path: string) => boolean
  focusFirstContentBlock: () => Promise<void>
  emitOutlineSoon: () => void
  flushUiFrame: () => Promise<void>
}

/**
 * useEditorDocumentLifecycle
 *
 * Purpose:
 * - Owns document loading orchestration and large-document overlay state.
 *
 * Responsibilities:
 * - Sequence editor/file/property initialization before rendering blocks.
 * - Protect against stale async loads when multiple paths are requested quickly.
 * - Restore scroll/caret state and focus fallback after rendering.
 *
 * Invariants:
 * - Only the most recent `loadCurrentFile` call can update UI/editor state.
 * - Large-document overlay state is always reset at the end of the active load.
 */
export function useEditorDocumentLifecycle(options: UseEditorDocumentLifecycleOptions) {
  const threshold = options.largeDocumentThreshold ?? 50_000
  let activeLoadSequence = 0

  const isLoadingLargeDocument = ref(false)
  const loadStageLabel = ref('')
  const loadProgressPercent = ref(0)
  const loadProgressIndeterminate = ref(false)
  const loadDocumentStats = ref<{ chars: number; lines: number } | null>(null)

  function countLines(input: string): number {
    if (!input) return 0
    return input.replace(/\r\n?/g, '\n').split('\n').length
  }

  function startLargeDocumentLoadOverlay() {
    isLoadingLargeDocument.value = true
    loadDocumentStats.value = null
    loadStageLabel.value = 'Reading file...'
    loadProgressPercent.value = 5
    loadProgressIndeterminate.value = true
  }

  function setLargeDocumentLoadStats(body: string) {
    if (!isLoadingLargeDocument.value) return
    loadDocumentStats.value = { chars: body.length, lines: countLines(body) }
  }

  async function setLargeDocumentLoadStage(stage: string, percent: number) {
    if (!isLoadingLargeDocument.value) return
    loadStageLabel.value = stage
    loadProgressPercent.value = Math.max(0, Math.min(100, Math.round(percent)))
    loadProgressIndeterminate.value = false
    await options.flushUiFrame()
  }

  function finishLargeDocumentLoadOverlay() {
    isLoadingLargeDocument.value = false
    loadStageLabel.value = ''
    loadProgressPercent.value = 0
    loadProgressIndeterminate.value = false
    loadDocumentStats.value = null
  }

  /**
   * Loads and renders a path in the editor.
   *
   * If a newer load starts while this call is in flight, this call exits without
   * mutating final UI/editor state.
   */
  async function loadCurrentFile(path: string) {
    if (!path) return

    const loadSequence = ++activeLoadSequence
    const isStaleLoad = () => loadSequence !== activeLoadSequence

    await options.ensureEditor()
    await options.ensurePropertySchemaLoaded()
    if (!options.hasActiveEditor() || isStaleLoad()) return

    options.clearAutosaveTimer()
    options.closeSlashMenu()
    options.closeWikilinkMenu()
    options.setSaveError(path, '')

    let shouldShowLargeDocOverlay = false

    try {
      startLargeDocumentLoadOverlay()
      await options.flushUiFrame()
      if (isStaleLoad()) return

      const txt = await options.openFile(path)
      if (isStaleLoad()) return
      options.parseAndStoreFrontmatter(path, txt)
      const body = options.resolveEditorBody(path, txt)
      shouldShowLargeDocOverlay = txt.length >= threshold

      if (!shouldShowLargeDocOverlay) {
        if (!isStaleLoad()) finishLargeDocumentLoadOverlay()
      } else {
        setLargeDocumentLoadStats(body)
        await setLargeDocumentLoadStage('Parsing markdown blocks...', 35)
        if (isStaleLoad()) return
      }

      const parsed = options.markdownToEditorData(body)
      if (isStaleLoad()) return
      const normalizedBlocks = options.normalizeLoadedBlocks(parsed.blocks as OutputBlockData[], path)

      options.setSuppressOnChange(true)
      options.setLoadedText(path, txt)

      if (shouldShowLargeDocOverlay) {
        await setLargeDocumentLoadStage('Rendering blocks in editor...', 70)
      }

      if (!options.hasActiveEditor() || isStaleLoad()) return
      await options.renderEditor({
        version: parsed.version,
        blocks: normalizedBlocks
      })

      if (isStaleLoad()) return
      if (shouldShowLargeDocOverlay) {
        await setLargeDocumentLoadStage('Finalizing view...', 95)
      }

      options.setDirty(path, false)
      options.ensureCodeBlockUi()

      await options.nextUiTick()
      const remembered = options.getRememberedScrollTop(path)
      const hasRememberedScroll = typeof remembered === 'number'
      const targetScrollTop = remembered ?? 0
      options.setEditorScrollTop(targetScrollTop)

      const restoredCaret = options.restoreCaret(path)
      if (!restoredCaret && (!hasRememberedScroll || targetScrollTop <= 1)) {
        await options.focusFirstContentBlock()
      }

      options.emitOutlineSoon()
      if (shouldShowLargeDocOverlay) {
        loadProgressPercent.value = 100
      }
    } catch (error) {
      if (!isStaleLoad()) {
        options.setSaveError(path, error instanceof Error ? error.message : 'Could not read file.')
      }
    } finally {
      if (!isStaleLoad()) {
        options.setSuppressOnChange(false)
        finishLargeDocumentLoadOverlay()
      }
    }
  }

  return {
    isLoadingLargeDocument,
    loadStageLabel,
    loadProgressPercent,
    loadProgressIndeterminate,
    loadDocumentStats,
    loadCurrentFile
  }
}
