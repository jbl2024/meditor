import { computed, ref, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { toSelectionBlockMenuTarget, toSelectionBlockMenuTargets } from '../lib/tiptap/blockMenu/guards'
import type { BlockMenuTarget } from '../lib/tiptap/blockMenu/types'

/**
 * Owns the editor block gutter state for the active body selection.
 *
 * Boundary:
 * - Resolves the current block target from editor selection/focus.
 * - Pins a stable menu target while the block menu is open.
 * - Computes the absolute toolbar anchor inside the scrolling editor holder.
 * - Does not execute block actions or render UI.
 */
export function useEditorBlockGutterController(options: {
  getEditor: () => Editor | null
  holder: Ref<HTMLDivElement | null>
  titleEditorFocused: Ref<boolean>
}) {
  const gutterGapPx = 8
  const gutterButtonSizePx = 28
  const gutterControlGapPx = 6
  const gutterLabelWidthPx = 44
  const gutterCompactWidthPx = gutterButtonSizePx * 2 + gutterControlGapPx
  const gutterFallbackWidthPx = gutterCompactWidthPx + gutterGapPx
  const gutterControlsWithLabelWidthPx = gutterCompactWidthPx + gutterControlGapPx + gutterLabelWidthPx
  const target = ref<BlockMenuTarget | null>(null)
  const selectionTargets = ref<BlockMenuTarget[]>([])
  const menuTarget = ref<BlockMenuTarget | null>(null)
  const menuTargets = ref<BlockMenuTarget[]>([])
  const menuOpen = ref(false)
  const contentFocused = ref(false)
  const anchorRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)

  const activeTarget = computed(() => menuTarget.value ?? target.value)
  const visible = computed(() => Boolean(
    activeTarget.value
      && anchorRect.value
      && ((contentFocused.value && !options.titleEditorFocused.value) || menuOpen.value)
  ))

  /**
   * Mirrors real DOM/editor focus into reactive state so toolbar visibility
   * can depend on body focus instead of hover.
   */
  function syncContentFocus() {
    const editor = options.getEditor()
    if (!editor || options.titleEditorFocused.value) {
      contentFocused.value = false
      return
    }

    const active = typeof document !== 'undefined' ? document.activeElement : null
    const viewDom = editor.view?.dom
    const domContainsFocus = Boolean(viewDom instanceof Node && active instanceof Node && viewDom.contains(active))
    const viewHasFocus = typeof editor.view?.hasFocus === 'function' ? editor.view.hasFocus() : false
    contentFocused.value = Boolean(editor.isFocused || viewHasFocus || domContainsFocus)
  }

  /**
   * Re-resolves the gutter target from the active editor selection.
   *
   * Invariant:
   * - `target` always reflects the live selection.
   * - `menuTarget` remains pinned while the menu is open.
   */
  function syncSelectionTarget() {
    syncContentFocus()
    const editor = options.getEditor()
    const titleFocused = options.titleEditorFocused.value
    target.value = titleFocused ? null : toSelectionBlockMenuTarget(editor)
    selectionTargets.value = titleFocused ? [] : toSelectionBlockMenuTargets(editor)
    syncAnchor()
  }

  /**
   * Recomputes the toolbar anchor for the currently active gutter target.
   */
  function syncAnchor() {
    const editor = options.getEditor()
    const holder = options.holder.value
    const nextTarget = activeTarget.value
    if (!editor || !holder || !nextTarget) {
      anchorRect.value = null
      return
    }

    const blockElement = resolveTargetElement(editor, nextTarget.pos)
    if (!blockElement) {
      anchorRect.value = null
      return
    }

    const holderRect = holder.getBoundingClientRect()
    const blockRect = blockElement.getBoundingClientRect()
    const editorRect = editor.view.dom.getBoundingClientRect()
    anchorRect.value = {
      left: editorRect.left - holderRect.left + holder.scrollLeft,
      top: blockRect.top - holderRect.top + holder.scrollTop + blockRect.height / 2,
      width: blockRect.width,
      height: blockRect.height
    }
  }

  /**
   * Resolves a pane-safe gutter placement from the current anchor rectangle.
   *
   * When a pane is too narrow for the gutter to sit fully to the left of the
   * active block, the placement pins the control to the visible pane edge
   * instead of letting it clip into the split boundary.
   */
  function resolveToolbarPlacement(toolbarWidthPx?: number): { left: number; top: number } | null {
    const holder = options.holder.value
    const anchor = anchorRect.value
    if (!holder || !anchor) return null

    const width = Math.max(gutterFallbackWidthPx, toolbarWidthPx ?? 0)
    const holderScrollLeft = holder.scrollLeft
    const holderClientWidth = holder.clientWidth
    const minLeft = holderScrollLeft + gutterGapPx
    const maxLeft = holderScrollLeft + holderClientWidth - width - gutterGapPx
    const preferredLeft = anchor.left - width - gutterGapPx
    const left = maxLeft >= minLeft
      ? Math.min(Math.max(preferredLeft, minLeft), maxLeft)
      : minLeft

    return {
      left,
      top: anchor.top
    }
  }

  /**
   * Returns whether the block-type badge can be shown without forcing the
   * gutter controls out of the left gutter in a narrow pane.
   */
  function shouldShowToolbarLabel(availableGutterWidthPx?: number): boolean {
    const holder = options.holder.value
    if (!holder) return false

    const resolvedAvailableWidth =
      typeof availableGutterWidthPx === 'number' && Number.isFinite(availableGutterWidthPx) && availableGutterWidthPx > 0
        ? availableGutterWidthPx
        : holder.clientWidth
    return resolvedAvailableWidth >= gutterControlsWithLabelWidthPx
  }

  function openMenu() {
    if (!target.value) return null
    menuTarget.value = target.value
    menuTargets.value = selectionTargets.value
    menuOpen.value = true
    syncAnchor()
    return menuTarget.value
  }

  function closeMenu() {
    menuOpen.value = false
    menuTarget.value = null
    menuTargets.value = []
    syncAnchor()
  }

  function clear() {
    target.value = null
    selectionTargets.value = []
    menuTarget.value = null
    menuTargets.value = []
    menuOpen.value = false
    contentFocused.value = false
    anchorRect.value = null
  }

  return {
    target,
    selectionTargets,
    menuTarget,
    menuTargets,
    activeTarget,
    anchorRect,
    menuOpen,
    contentFocused,
    visible,
    syncContentFocus,
    syncSelectionTarget,
    syncAnchor,
    resolveToolbarPlacement,
    shouldShowToolbarLabel,
    openMenu,
    closeMenu,
    clear
  }
}

function resolveTargetElement(editor: Editor, pos: number) {
  const dom = editor.view.nodeDOM(pos)
  if (dom instanceof HTMLElement) return dom
  if (dom instanceof Node) return dom.parentElement
  return null
}
