import type { OutputBlockData } from '@editorjs/editorjs'
import type { Ref } from 'vue'

/**
 * Dependencies required by {@link useVirtualTitleBehavior}.
 */
export type UseVirtualTitleBehaviorOptions = {
  virtualTitleBlockId: string
  holder: Ref<HTMLElement | null>
  currentPath: Ref<string>
  hasActiveEditor: () => boolean
  isSuppressOnChange: () => boolean
  saveEditorData: () => Promise<{ blocks: OutputBlockData[] }>
  renderBlocks: (blocks: OutputBlockData[]) => Promise<void>
}

/**
 * useVirtualTitleBehavior
 *
 * Purpose:
 * - Owns the virtual-title block lifecycle (`h1` block injected at top of EditorJS data).
 *
 * Responsibilities:
 * - Normalize loaded/saved block lists to a single leading virtual title block.
 * - Derive fallback title from first block/path when title block is missing.
 * - Guard DOM structure with delayed enforcement after editor changes.
 *
 * Invariants:
 * - The first editable block must always be the virtual title block (`h1`).
 * - At most one virtual title block exists after normalization.
 */
export function useVirtualTitleBehavior(options: UseVirtualTitleBehaviorOptions) {
  let titleLockTimer: ReturnType<typeof setTimeout> | null = null

  /** Derives a default title from note path (`Notes/Todo.md` -> `Todo`). */
  function noteTitleFromPath(path: string): string {
    const normalized = path.replace(/\\/g, '/')
    const parts = normalized.split('/')
    const name = parts[parts.length - 1] || normalized
    const stem = name.replace(/\.(md|markdown)$/i, '').trim()
    return stem || 'Untitled'
  }

  function extractPlainText(value: unknown): string {
    const html = String(value ?? '')
    if (!html.trim()) return ''
    const container = document.createElement('div')
    container.innerHTML = html
    const rawText = container.textContent ?? ''
    return rawText.replace(/\u200B/g, ' ').replace(/\s+/g, ' ').trim()
  }

  /** Reads best-effort text from block data (`text` for rich blocks, `code` for code blocks). */
  function blockTextCandidate(block: OutputBlockData | undefined): string {
    if (!block) return ''
    const data = (block.data as Record<string, unknown>) ?? {}
    if (typeof data.text !== 'undefined') return extractPlainText(data.text)
    if (typeof data.code === 'string') return data.code.trim()
    return ''
  }

  function virtualTitleBlock(title: string): OutputBlockData {
    return {
      id: options.virtualTitleBlockId,
      type: 'header',
      data: { level: 1, text: title.trim() || 'Untitled' }
    } as OutputBlockData
  }

  /** Removes every virtual-title block occurrence from an array. */
  function stripVirtualTitle(blocks: OutputBlockData[]): OutputBlockData[] {
    return blocks.filter((block) => block.id !== options.virtualTitleBlockId)
  }

  /** Extracts current virtual-title text if present. */
  function readVirtualTitle(blocks: OutputBlockData[]): string {
    const virtual = blocks.find((block) => block.id === options.virtualTitleBlockId)
    return blockTextCandidate(virtual)
  }

  /**
   * Ensures one normalized leading virtual title block.
   *
   * Returns cloned blocks to avoid mutating caller-owned EditorJS payload objects.
   */
  function withVirtualTitle(blocks: OutputBlockData[], title: string): { blocks: OutputBlockData[]; changed: boolean } {
    const content = stripVirtualTitle(
      blocks.map((block) => ({
        ...block,
        data: { ...(block.data as Record<string, unknown>) }
      }))
    )
    const desired = title.trim() || 'Untitled'
    const next = [virtualTitleBlock(desired), ...content]

    const first = blocks[0]
    const firstLevel = Number(((first?.data as Record<string, unknown>)?.level ?? 0))
    const firstText = blockTextCandidate(first)
    const hasSingleLeadingVirtual =
      Boolean(first) &&
      first.id === options.virtualTitleBlockId &&
      first.type === 'header' &&
      firstLevel === 1 &&
      firstText === desired &&
      !blocks.slice(1).some((block) => block.id === options.virtualTitleBlockId)

    const changed = !hasSingleLeadingVirtual || blocks.length !== next.length
    return { blocks: next, changed }
  }

  /** True when current DOM selection is inside the virtual title block. */
  function isEditingVirtualTitle(): boolean {
    if (!options.holder.value) return false
    const selection = window.getSelection()
    if (!selection?.focusNode) return false

    const focusedElement =
      selection.focusNode.nodeType === Node.ELEMENT_NODE
        ? (selection.focusNode as Element)
        : selection.focusNode.parentElement
    if (!focusedElement) return false

    const block = focusedElement.closest('.ce-block') as HTMLElement | null
    return block?.dataset.id === options.virtualTitleBlockId
  }

  function isVirtualTitleDomValid(): boolean {
    if (!options.holder.value) return true
    const firstBlock = options.holder.value.querySelector('.ce-block') as HTMLElement | null
    if (!firstBlock) return false
    if (firstBlock.dataset.id !== options.virtualTitleBlockId) return false
    const header = firstBlock.querySelector('.ce-header') as HTMLElement | null
    return Boolean(header && header.tagName.toLowerCase() === 'h1')
  }

  /** Re-renders editor blocks when current DOM/data shape violates virtual-title invariant. */
  async function enforceVirtualTitleStructure() {
    if (!options.hasActiveEditor() || options.isSuppressOnChange()) return
    const path = options.currentPath.value
    if (!path) return

    const data = await options.saveEditorData()
    const rawBlocks = (data.blocks ?? []) as OutputBlockData[]
    const title = readVirtualTitle(rawBlocks) || blockTextCandidate(rawBlocks[0]) || noteTitleFromPath(path)
    const normalized = withVirtualTitle(rawBlocks, title)
    if (!normalized.changed) return
    await options.renderBlocks(normalized.blocks)
  }

  function clearVirtualTitleLock() {
    if (!titleLockTimer) return
    clearTimeout(titleLockTimer)
    titleLockTimer = null
  }

  /** Delayed invariant check after editor mutations to avoid thrashing while typing. */
  function scheduleVirtualTitleLock() {
    clearVirtualTitleLock()
    titleLockTimer = setTimeout(() => {
      if (isVirtualTitleDomValid()) return
      void enforceVirtualTitleStructure()
    }, 80)
  }

  return {
    noteTitleFromPath,
    blockTextCandidate,
    stripVirtualTitle,
    readVirtualTitle,
    withVirtualTitle,
    isEditingVirtualTitle,
    scheduleVirtualTitleLock,
    clearVirtualTitleLock,
    enforceVirtualTitleStructure
  }
}
