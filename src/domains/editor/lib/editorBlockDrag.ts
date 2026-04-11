import type { Editor } from '@tiptap/vue-3'
import { NodeSelection } from '@tiptap/pm/state'
import type { BlockMenuTarget } from './tiptap/blockMenu/types'

/**
 * Starts a block drag from the explicit gutter grip.
 *
 * Ownership:
 * - This helper owns the exact drag payload for one resolved block target.
 * - UI visibility/position remain outside; callers only provide the event and target.
 */
export function beginEditorBlockDrag(options: {
  event: DragEvent
  editor: Editor
  target: BlockMenuTarget
}) {
  const { event, editor, target } = options
  if (!event.dataTransfer) return false

  const node = editor.state.doc.nodeAt(target.pos)
  if (!node) return false

  const selection = NodeSelection.create(editor.state.doc, target.pos)
  const slice = editor.state.doc.slice(target.pos, target.pos + node.nodeSize)
  const dragImage = createDragImage(editor, target.pos)

  event.dataTransfer.clearData()
  event.dataTransfer.effectAllowed = 'move'
  if (dragImage) {
    document.body.append(dragImage)
    event.dataTransfer.setDragImage(dragImage, 0, 0)
    const cleanup = () => dragImage.remove()
    document.addEventListener('drop', cleanup, { once: true, capture: true })
    document.addEventListener('dragend', cleanup, { once: true, capture: true })
  }

  editor.view.dragging = { slice, move: true, node: selection } as typeof editor.view.dragging
  editor.view.dispatch(editor.state.tr.setSelection(selection))

  return true
}

function createDragImage(editor: Editor, pos: number) {
  const source = resolveBlockElement(editor, pos)
  if (!source) return null

  const wrapper = document.createElement('div')
  wrapper.style.position = 'absolute'
  wrapper.style.top = '-10000px'
  wrapper.style.left = '-10000px'
  wrapper.style.pointerEvents = 'none'
  wrapper.style.opacity = '0.94'
  wrapper.append(source.cloneNode(true))

  return wrapper
}

function resolveBlockElement(editor: Editor, pos: number) {
  const dom = editor.view.nodeDOM(pos)
  if (dom instanceof HTMLElement) return dom
  if (dom instanceof Node) return dom.parentElement
  return null
}
