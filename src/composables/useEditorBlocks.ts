import type EditorJS from '@editorjs/editorjs'
import type { OutputBlockData } from '@editorjs/editorjs'
import type { Ref } from 'vue'

type EditorLikeBlock = {
  id?: string
  name?: string
  holder: HTMLElement
}

/**
 * Dependencies required by {@link useEditorBlocks}.
 */
export type UseEditorBlocksOptions = {
  holder: Ref<HTMLElement | null>
  getEditor: () => EditorJS | null
  virtualTitleBlockId: string
  setSuppressOnChange: (value: boolean) => void
  nextUiTick: () => Promise<void>
}

/**
 * useEditorBlocks
 *
 * Purpose:
 * - Own block-level editor mutations and caret placement helpers.
 *
 * Responsibilities:
 * - Read current block context and normalized block text.
 * - Replace/insert blocks while preserving expected caret behavior.
 * - Bootstrap first content block when note only has virtual title.
 *
 * Invariants:
 * - First editable content insertion happens at index `1` (after virtual title).
 * - Temporary synthetic insertions run with change suppression enabled.
 */
export function useEditorBlocks(options: UseEditorBlocksOptions) {
  function getEditableElement(block: { holder: HTMLElement }) {
    return block.holder.querySelector('[contenteditable="true"]') as HTMLElement | null
  }

  function getCurrentBlock(): EditorLikeBlock | null {
    const editor = options.getEditor()
    if (!editor) return null
    const index = editor.blocks.getCurrentBlockIndex()
    if (index < 0) return null
    return (editor.blocks.getBlockByIndex(index) as EditorLikeBlock | null) ?? null
  }

  function getCurrentBlockText(block: { holder: HTMLElement }) {
    const editable = getEditableElement(block)
    return (editable?.innerText ?? '').replace(/\u200B/g, '').trim()
  }

  function isCurrentBlockEmpty() {
    const block = getCurrentBlock()
    if (!block) return false
    return getCurrentBlockText(block).length === 0
  }

  function placeCaretInBlock(blockId: string) {
    const editor = options.getEditor()
    if (!editor) return

    const block = editor.blocks.getById(blockId)
    if (!block) return
    const editable = getEditableElement(block as { holder: HTMLElement })
    if (!editable) return

    editable.focus()
    const selection = window.getSelection()
    if (!selection) return

    const range = document.createRange()
    range.selectNodeContents(editable)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function firstEditableNonVirtualBlockId(): string | null {
    if (!options.holder.value) return null
    const blocks = Array.from(options.holder.value.querySelectorAll('.ce-block')) as HTMLElement[]
    for (const block of blocks) {
      const id = block.dataset.id ?? ''
      if (!id || id === options.virtualTitleBlockId) continue
      const editable = block.querySelector('[contenteditable="true"]') as HTMLElement | null
      if (editable) return id
    }
    return null
  }

  function focusEditor() {
    if (!options.holder.value) return
    const editable = options.holder.value.querySelector('[contenteditable="true"]') as HTMLElement | null
    editable?.focus()
  }

  async function focusFirstContentBlock() {
    const editor = options.getEditor()
    if (!editor) return

    const existing = firstEditableNonVirtualBlockId()
    if (existing) {
      placeCaretInBlock(existing)
      return
    }

    options.setSuppressOnChange(true)
    try {
      const inserted = editor.blocks.insert('paragraph', { text: '' }, undefined, 1, true, false)
      await options.nextUiTick()
      placeCaretInBlock(inserted.id)
    } finally {
      options.setSuppressOnChange(false)
    }
  }

  function replaceCurrentBlock(type: string, data: Record<string, unknown>): boolean {
    const editor = options.getEditor()
    if (!editor) return false

    const index = editor.blocks.getCurrentBlockIndex()
    if (index < 0) return false

    try {
      const inserted = editor.blocks.insert(type, data, undefined, index, true, true)
      const blockId = inserted?.id ?? editor.blocks.getBlockByIndex(index)?.id ?? null
      if (blockId) {
        if (!editor.caret.setToBlock(blockId, 'start')) {
          placeCaretInBlock(blockId)
        }
      } else {
        editor.caret.focus()
      }
      return true
    } catch (error) {
      console.error('Failed to replace current block', error)
      return false
    }
  }

  function insertParsedMarkdownBlocks(parsedBlocks: OutputBlockData[]) {
    const editor = options.getEditor()
    if (!editor || parsedBlocks.length === 0) return

    const index = editor.blocks.getCurrentBlockIndex()
    if (index < 0) return

    const current = editor.blocks.getBlockByIndex(index) as EditorLikeBlock | null
    const currentIsEmptyParagraph =
      Boolean(current) && current?.name === 'paragraph' && getCurrentBlockText(current).length === 0

    const [first, ...rest] = parsedBlocks

    if (currentIsEmptyParagraph) {
      const inserted = editor.blocks.insert(first.type, first.data, undefined, index, true, true)
      if (rest.length > 0) {
        editor.blocks.insertMany(rest, index + 1)
      }
      placeCaretInBlock(inserted.id)
      return
    }

    const insertionIndex = index + 1
    const inserted = editor.blocks.insert(first.type, first.data, undefined, insertionIndex, true, false)
    if (rest.length > 0) {
      editor.blocks.insertMany(rest, insertionIndex + 1)
    }
    placeCaretInBlock(inserted.id)
  }

  return {
    getCurrentBlock,
    getCurrentBlockText,
    isCurrentBlockEmpty,
    replaceCurrentBlock,
    insertParsedMarkdownBlocks,
    focusFirstContentBlock,
    focusEditor
  }
}
