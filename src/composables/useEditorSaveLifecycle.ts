import type { OutputBlockData } from '@editorjs/editorjs'

/**
 * Options required by {@link useEditorSaveLifecycle}.
 */
export type UseEditorSaveLifecycleOptions = {
  getCurrentPath: () => string
  hasActiveEditor: () => boolean
  isSavingPath: (path: string) => boolean
  setSaving: (path: string, saving: boolean) => void
  setSaveError: (path: string, message: string) => void
  setDirty: (path: string, dirty: boolean) => void
  saveEditorData: () => Promise<{ blocks: OutputBlockData[] }>
  resolveRequestedTitle: (blocks: OutputBlockData[], initialPath: string) => string
  getLoadedText: (path: string) => string
  openFile: (path: string) => Promise<string>
  renameFileFromTitle: (path: string, title: string) => Promise<{ path: string; title: string }>
  normalizeBlocksForTitle: (blocks: OutputBlockData[], title: string) => { blocks: OutputBlockData[]; changed: boolean }
  stripVirtualTitle: (blocks: OutputBlockData[]) => OutputBlockData[]
  editorBlocksToMarkdown: (blocks: OutputBlockData[]) => string
  resolveFrontmatterYaml: (savePath: string, initialPath: string) => string
  composeMarkdownDocument: (bodyMarkdown: string, frontmatterYaml: string) => string
  movePersistencePathState: (from: string, to: string) => void
  moveFrontmatterPathState: (from: string, to: string) => void
  emitPathRenamed: (payload: { from: string; to: string; manual: boolean }) => void
  renderBlocks: (blocks: OutputBlockData[]) => Promise<void>
  saveFile: (path: string, text: string, options: { explicit: boolean }) => Promise<{ persisted: boolean }>
  setLoadedText: (path: string, markdown: string) => void
  deleteLoadedText: (path: string) => void
  parseAndStoreFrontmatter: (path: string, markdown: string) => void
  emitOutlineSoon: () => void
}

/**
 * useEditorSaveLifecycle
 *
 * Purpose:
 * - Owns save orchestration for editor content + frontmatter.
 *
 * Responsibilities:
 * - Guard against stale on-disk content before writing.
 * - Apply title-based rename flow and in-memory path migration.
 * - Persist normalized markdown and refresh loaded/frontmatter state.
 *
 * Invariants:
 * - Save is aborted when disk content diverges from last loaded snapshot.
 * - Rename path migration updates both persistence and frontmatter maps together.
 */
export function useEditorSaveLifecycle(options: UseEditorSaveLifecycleOptions) {
  /**
   * Persists the active note.
   *
   * @param manual Whether save is user-triggered (`true`) or autosave (`false`).
   */
  async function saveCurrentFile(manual = true) {
    const initialPath = options.getCurrentPath()
    if (!initialPath || !options.hasActiveEditor() || options.isSavingPath(initialPath)) return

    let savePath = initialPath
    options.setSaving(savePath, true)
    if (manual) options.setSaveError(savePath, '')

    try {
      const data = await options.saveEditorData()
      const rawBlocks = (data.blocks ?? []) as OutputBlockData[]
      const requestedTitle = options.resolveRequestedTitle(rawBlocks, initialPath)
      const lastLoaded = options.getLoadedText(initialPath)

      const latestOnDisk = await options.openFile(initialPath)
      if (latestOnDisk !== lastLoaded) {
        throw new Error('File changed on disk. Reload before saving to avoid overwrite.')
      }

      const renameResult = await options.renameFileFromTitle(initialPath, requestedTitle)
      savePath = renameResult.path
      const normalized = options.normalizeBlocksForTitle(rawBlocks, renameResult.title)
      const markdownBlocks = options.stripVirtualTitle(normalized.blocks)
      const bodyMarkdown = options.editorBlocksToMarkdown(markdownBlocks)
      const frontmatterYaml = options.resolveFrontmatterYaml(savePath, initialPath)
      const markdown = options.composeMarkdownDocument(bodyMarkdown, frontmatterYaml)

      // Touchy: autosave should not write if no content/path change happened.
      if (!manual && savePath === initialPath && markdown === lastLoaded) {
        options.setDirty(savePath, false)
        return
      }

      if (savePath !== initialPath) {
        options.movePersistencePathState(initialPath, savePath)
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

      options.setLoadedText(savePath, markdown)
      options.parseAndStoreFrontmatter(savePath, markdown)
      if (savePath !== initialPath) {
        options.deleteLoadedText(initialPath)
      }
      options.setDirty(savePath, false)
    } catch (error) {
      options.setSaveError(savePath, error instanceof Error ? error.message : 'Could not save file.')
    } finally {
      options.setSaving(savePath, false)
      options.emitOutlineSoon()
    }
  }

  return {
    saveCurrentFile
  }
}
