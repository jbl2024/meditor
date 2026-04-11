import { computed, ref, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { toSelectionBlockMenuTarget } from '../lib/tiptap/blockMenu/guards'
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
  const target = ref<BlockMenuTarget | null>(null)
  const menuTarget = ref<BlockMenuTarget | null>(null)
  const menuOpen = ref(false)
  const dragging = ref(false)
  const contentFocused = ref(false)
  const anchorRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)

  const activeTarget = computed(() => menuTarget.value ?? target.value)
  const visible = computed(() => Boolean(
    activeTarget.value
      && anchorRect.value
      && ((contentFocused.value && !options.titleEditorFocused.value) || menuOpen.value || dragging.value)
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
    target.value = options.titleEditorFocused.value ? null : toSelectionBlockMenuTarget(options.getEditor())
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
    anchorRect.value = {
      left: blockRect.left - holderRect.left + holder.scrollLeft,
      top: blockRect.top - holderRect.top + holder.scrollTop + blockRect.height / 2,
      width: blockRect.width,
      height: blockRect.height
    }
  }

  function openMenu() {
    if (!target.value) return null
    menuTarget.value = target.value
    menuOpen.value = true
    syncAnchor()
    return menuTarget.value
  }

  function closeMenu() {
    menuOpen.value = false
    menuTarget.value = null
    syncAnchor()
  }

  function startDragging() {
    dragging.value = true
    menuOpen.value = false
    syncAnchor()
  }

  function stopDragging() {
    dragging.value = false
    syncSelectionTarget()
  }

  function clear() {
    target.value = null
    menuTarget.value = null
    menuOpen.value = false
    dragging.value = false
    contentFocused.value = false
    anchorRect.value = null
  }

  return {
    target,
    menuTarget,
    activeTarget,
    anchorRect,
    menuOpen,
    dragging,
    contentFocused,
    visible,
    syncContentFocus,
    syncSelectionTarget,
    syncAnchor,
    openMenu,
    closeMenu,
    startDragging,
    stopDragging,
    clear
  }
}

function resolveTargetElement(editor: Editor, pos: number) {
  const dom = editor.view.nodeDOM(pos)
  if (dom instanceof HTMLElement) return dom
  if (dom instanceof Node) return dom.parentElement
  return null
}
