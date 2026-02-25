import type EditorJS from '@editorjs/editorjs'
import type { OutputBlockData } from '@editorjs/editorjs'
import type { Ref } from 'vue'
import {
  applyMarkdownShortcut,
  isEditorZoomModifier,
  isLikelyMarkdownPaste,
  isZoomInShortcut,
  isZoomOutShortcut,
  isZoomResetShortcut
} from '../lib/editorInteractions'

type SlashCommand = {
  id: string
  label: string
  type: string
  data: Record<string, unknown>
}

type UseEditorInteractionOptions = {
  getEditor: () => EditorJS | null
  currentPath: Ref<string>
  wikilinkOpen: Ref<boolean>
  wikilinkIndex: Ref<number>
  wikilinkResults: Ref<Array<{ id: string; label: string; target: string; isCreate: boolean }>>
  slashOpen: Ref<boolean>
  slashIndex: Ref<number>
  slashCommands: SlashCommand[]
  virtualTitleBlockId: string
  getCurrentBlock: () => { id?: string; name?: string; holder: HTMLElement } | null
  getCurrentBlockText: (block: { holder: HTMLElement }) => string
  isCurrentBlockEmpty: () => boolean
  replaceCurrentBlock: (type: string, data: Record<string, unknown>) => boolean
  insertParsedMarkdownBlocks: (parsedBlocks: OutputBlockData[]) => void
  closeSlashMenu: () => void
  closeWikilinkMenu: () => void
  applyWikilinkSelection: (target: string) => Promise<void>
  applyWikilinkDraftSelection: (target: string) => Promise<void>
  expandAdjacentLinkForEditing: (direction: 'left' | 'right') => boolean
  consumeSuppressCollapseOnArrowKeyup: () => boolean
  collapseExpandedLinkIfCaretOutside: () => boolean
  collapseClosedLinkNearCaret: () => boolean
  shouldSyncWikilinkFromSelection: () => boolean
  isWikilinkRelevantKey: (event: KeyboardEvent) => boolean
  syncWikilinkMenuFromCaret: () => Promise<void>
  readWikilinkTargetFromAnchor: (anchor: HTMLAnchorElement) => string
  openLinkTargetWithAutosave: (target: string) => Promise<void>
  isDateLinkModifierPressed: (event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'> | Pick<MouseEvent, 'metaKey' | 'ctrlKey'>) => boolean
  openLinkedTokenAtCaret: () => Promise<void>
  zoomEditorBy: (delta: number) => void
  resetEditorZoom: () => void
  sanitizeExternalHref: (href: string) => string | null
  openExternalUrl: (url: string) => Promise<void>
  markdownToEditorData: (markdown: string) => { blocks: unknown[] }
  captureCaret: (path: string) => void
}

/**
 * useEditorInteraction
 *
 * Purpose:
 * - Owns editor DOM input handlers (keyboard/mouse/paste/contextmenu).
 *
 * Responsibilities:
 * - Route user events to wikilink, slash-command, zoom, and markdown-paste flows.
 * - Keep handler logic centralized and detached from EditorView lifecycle wiring.
 *
 * Boundaries:
 * - Stateless orchestration layer; all side effects are injected via callbacks.
 */
export function useEditorInteraction(options: UseEditorInteractionOptions) {
  function stopImmediate(event: Event) {
    if (typeof (event as KeyboardEvent).stopImmediatePropagation === 'function') {
      ;(event as KeyboardEvent).stopImmediatePropagation()
    }
  }

  function onEditorKeydown(event: KeyboardEvent) {
    const editor = options.getEditor()
    if (!editor) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.meditor-mermaid')) return

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

    if (options.wikilinkOpen.value) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        stopImmediate(event)
        if (options.wikilinkResults.value.length) {
          options.wikilinkIndex.value = (options.wikilinkIndex.value + 1) % options.wikilinkResults.value.length
        }
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        stopImmediate(event)
        if (options.wikilinkResults.value.length) {
          options.wikilinkIndex.value = (options.wikilinkIndex.value - 1 + options.wikilinkResults.value.length) % options.wikilinkResults.value.length
        }
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        event.stopPropagation()
        stopImmediate(event)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const selected = options.wikilinkResults.value[options.wikilinkIndex.value]
        if (!selected) return
        event.preventDefault()
        event.stopPropagation()
        stopImmediate(event)
        if (event.key === 'Tab') {
          void options.applyWikilinkDraftSelection(selected.target)
        } else {
          void options.applyWikilinkSelection(selected.target)
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        stopImmediate(event)
        options.closeWikilinkMenu()
        return
      }
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const direction = event.key === 'ArrowLeft' ? 'left' : 'right'
      if (options.expandAdjacentLinkForEditing(direction)) {
        event.preventDefault()
        event.stopPropagation()
        stopImmediate(event)
        return
      }
    }

    if (options.slashOpen.value) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        options.slashIndex.value = (options.slashIndex.value + 1) % options.slashCommands.length
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        options.slashIndex.value = (options.slashIndex.value - 1 + options.slashCommands.length) % options.slashCommands.length
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const command = options.slashCommands[options.slashIndex.value]
        options.closeSlashMenu()
        options.replaceCurrentBlock(command.type, command.data)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        options.closeSlashMenu()
        return
      }
    }

    const block = options.getCurrentBlock()
    if (!block) return
    if (block.id === options.virtualTitleBlockId && event.key === 'Backspace' && options.getCurrentBlockText(block).length === 0) {
      event.preventDefault()
      return
    }

    if (event.key === '[' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      window.setTimeout(() => {
        void options.syncWikilinkMenuFromCaret()
      }, 0)
    }

    if (event.key === '/' && block.name === 'paragraph' && options.isCurrentBlockEmpty()) {
      options.closeSlashMenu()
      return
    }

    if ((event.key === ' ' || event.code === 'Space') && block.name === 'paragraph') {
      const marker = options.getCurrentBlockText(block)
      const transform = applyMarkdownShortcut(marker)
      if (transform && options.replaceCurrentBlock(transform.type, transform.data)) {
        event.preventDefault()
        options.closeSlashMenu()
        return
      }
    }

    if (event.key === 'Enter' && block.name === 'paragraph') {
      const marker = options.getCurrentBlockText(block)
      if (marker === '```') {
        event.preventDefault()
        options.closeSlashMenu()
        options.replaceCurrentBlock('code', { code: '' })
        return
      }
    }

    if (event.key === 'Backspace' && block.name === 'header' && options.getCurrentBlockText(block).length === 0) {
      const index = editor.blocks.getCurrentBlockIndex()
      if (index === 0) {
        event.preventDefault()
        options.closeSlashMenu()
        return
      }
      event.preventDefault()
      options.closeSlashMenu()
      options.replaceCurrentBlock('paragraph', { text: '' })
    }
  }

  function onEditorKeyup(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null
    if (target?.closest('.meditor-mermaid')) return
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && options.consumeSuppressCollapseOnArrowKeyup()) return

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (options.collapseExpandedLinkIfCaretOutside()) return
      options.collapseClosedLinkNearCaret()
      return
    }

    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) return

    options.collapseClosedLinkNearCaret()
    options.captureCaret(options.currentPath.value)
    if (!options.wikilinkOpen.value && !options.isWikilinkRelevantKey(event) && !options.shouldSyncWikilinkFromSelection()) return
    void options.syncWikilinkMenuFromCaret()
  }

  function onEditorClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null
    if (!target?.closest('.ce-block')) return
    if (target.closest('.meditor-mermaid')) return

    options.collapseExpandedLinkIfCaretOutside()
    const anchor = target.closest('a') as HTMLAnchorElement | null
    const wikilinkTarget = anchor ? options.readWikilinkTargetFromAnchor(anchor) : ''
    if (anchor && wikilinkTarget) {
      event.preventDefault()
      event.stopPropagation()
      void options.openLinkTargetWithAutosave(wikilinkTarget)
      return
    }
    if (anchor) {
      const href = anchor.getAttribute('href')?.trim() ?? ''
      const safeHref = options.sanitizeExternalHref(href)
      if (safeHref) {
        event.preventDefault()
        event.stopPropagation()
        void options.openExternalUrl(safeHref)
        return
      }
    }
    options.collapseClosedLinkNearCaret()
    options.captureCaret(options.currentPath.value)
    void options.syncWikilinkMenuFromCaret()
    if (options.isDateLinkModifierPressed(event)) {
      void options.openLinkedTokenAtCaret()
    }
  }

  function onEditorContextMenu(event: MouseEvent) {
    const target = event.target as HTMLElement | null
    if (!target) return
    const block = target.closest('.ce-block') as HTMLElement | null
    if (!block || block.dataset.id !== options.virtualTitleBlockId) return
    event.preventDefault()
    event.stopPropagation()
  }

  function onEditorPaste(event: ClipboardEvent) {
    if (!options.getEditor()) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.meditor-mermaid')) return

    const plain = event.clipboardData?.getData('text/plain') ?? ''
    const html = event.clipboardData?.getData('text/html') ?? ''
    if (!isLikelyMarkdownPaste(plain, html)) return

    const parsed = options.markdownToEditorData(plain)
    if (!parsed.blocks.length) return

    event.preventDefault()
    event.stopPropagation()
    stopImmediate(event)
    options.insertParsedMarkdownBlocks(parsed.blocks as OutputBlockData[])
  }

  return {
    onEditorKeydown,
    onEditorKeyup,
    onEditorClick,
    onEditorContextMenu,
    onEditorPaste
  }
}
