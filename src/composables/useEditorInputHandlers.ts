import type { Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import type { SlashCommand } from '../lib/editorSlashCommands'
import {
  applyMarkdownShortcut,
  isEditorZoomModifier,
  isLikelyMarkdownPaste,
  isZoomInShortcut,
  isZoomOutShortcut,
  isZoomResetShortcut
} from '../lib/editorInteractions'
import { markdownToEditorData, type EditorBlock } from '../lib/markdownBlocks'
import { toTiptapDoc } from '../lib/tiptap/editorBlocksToTiptapDoc'

/**
 * useEditorInputHandlers
 *
 * Purpose:
 * - Centralize host-level keyboard/paste/contextmenu behavior for EditorView.
 *
 * Responsibilities:
 * - Route zoom shortcuts and slash-menu keyboard navigation.
 * - Trigger markdown shortcuts and code-fence insertion transforms.
 * - Process markdown paste conversion and context-menu guards.
 *
 * Boundaries:
 * - Does not own menu state; host passes callbacks and refs.
 */
export type UseEditorInputHandlersOptions = {
  getEditor: () => Editor | null
  currentPath: Ref<string>
  captureCaret: (path: string) => void
  currentTextSelectionContext: () => { text: string; nodeType: string } | null
  visibleSlashCommands: Ref<SlashCommand[]>
  slashOpen: Ref<boolean>
  slashIndex: Ref<number>
  closeSlashMenu: () => void
  insertBlockFromDescriptor: (type: string, data: Record<string, unknown>) => boolean
  blockMenuOpen: Ref<boolean>
  closeBlockMenu: () => void
  tableToolbarOpen: Ref<boolean>
  hideTableToolbar: () => void
  updateFormattingToolbar: () => void
  updateTableToolbar: () => void
  syncSlashMenuFromSelection: (options?: { preserveIndex?: boolean }) => void
  zoomEditorBy: (delta: number) => number
  resetEditorZoom: () => number
  inlineFormatToolbar: {
    linkPopoverOpen: Ref<boolean>
    cancelLink: () => void
  }
}

/**
 * Creates DOM event handlers bound to editor/menu runtime dependencies.
 */
export function useEditorInputHandlers(options: UseEditorInputHandlersOptions) {
  function onEditorKeydown(event: KeyboardEvent) {
    if (!options.getEditor()) return

    if (isEditorZoomModifier(event)) {
      if (isZoomInShortcut(event)) {
        event.preventDefault()
        options.zoomEditorBy(0.1)
        return
      }
      if (isZoomOutShortcut(event)) {
        event.preventDefault()
        options.zoomEditorBy(-0.1)
        return
      }
      if (isZoomResetShortcut(event)) {
        event.preventDefault()
        options.resetEditorZoom()
        return
      }
    }

    if (options.slashOpen.value) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        if (!options.visibleSlashCommands.value.length) return
        options.slashIndex.value = (options.slashIndex.value + 1) % options.visibleSlashCommands.value.length
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        if (!options.visibleSlashCommands.value.length) return
        options.slashIndex.value = (options.slashIndex.value - 1 + options.visibleSlashCommands.value.length) % options.visibleSlashCommands.value.length
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        const command = options.visibleSlashCommands.value[options.slashIndex.value]
        if (!command) return
        options.closeSlashMenu()
        options.insertBlockFromDescriptor(command.type, command.data)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        options.closeSlashMenu()
        return
      }
    }

    const context = options.currentTextSelectionContext()
    if ((event.key === ' ' || event.code === 'Space') && context?.nodeType === 'paragraph') {
      const marker = context.text.trim()
      const transform = applyMarkdownShortcut(marker)
      if (transform) {
        event.preventDefault()
        options.closeSlashMenu()
        options.insertBlockFromDescriptor(transform.type, transform.data)
        return
      }
    }

    if (event.key === 'Enter' && context?.nodeType === 'paragraph') {
      const marker = context.text.trim()
      if (marker === '```') {
        event.preventDefault()
        options.insertBlockFromDescriptor('code', { code: '' })
      }
    }

    if (event.key === 'Escape' && options.blockMenuOpen.value) {
      event.preventDefault()
      options.closeBlockMenu()
      return
    }

    if (event.key === 'Escape' && options.inlineFormatToolbar.linkPopoverOpen.value) {
      event.preventDefault()
      options.inlineFormatToolbar.cancelLink()
      return
    }

    if (event.key === 'Escape' && options.tableToolbarOpen.value) {
      event.preventDefault()
      options.hideTableToolbar()
    }
  }

  function onEditorKeyup() {
    const path = options.currentPath.value
    if (path) options.captureCaret(path)
    options.syncSlashMenuFromSelection({ preserveIndex: true })
    options.updateFormattingToolbar()
    options.updateTableToolbar()
  }

  function onEditorContextMenu(event: MouseEvent) {
    const target = event.target as HTMLElement | null
    const heading = target?.closest('h1') as HTMLElement | null
    if (!heading) return
    if (heading.closest('[data-virtual-title="true"]') || heading.parentElement?.getAttribute('data-virtual-title') === 'true') {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  function onEditorPaste(event: ClipboardEvent) {
    const editor = options.getEditor()
    if (!editor) return

    const plain = event.clipboardData?.getData('text/plain') ?? ''
    const html = event.clipboardData?.getData('text/html') ?? ''
    if (!isLikelyMarkdownPaste(plain, html)) return
    const parsed = markdownToEditorData(plain)
    if (!parsed.blocks.length) return

    event.preventDefault()
    event.stopPropagation()
    const json = toTiptapDoc(parsed.blocks as EditorBlock[])
    const content = Array.isArray(json.content) ? json.content : []
    editor.chain().focus().insertContent(content).run()
  }

  return {
    onEditorKeydown,
    onEditorKeyup,
    onEditorContextMenu,
    onEditorPaste
  }
}
