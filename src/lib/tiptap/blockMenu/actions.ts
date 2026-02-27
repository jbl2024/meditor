import type { Editor } from '@tiptap/vue-3'
import type { Node as ProseNode, Schema } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { BlockMenuTarget, TurnIntoType } from './types'

function createParagraph(schema: Schema, text = ''): ProseNode | null {
  const paragraph = schema.nodes.paragraph
  if (!paragraph) return null
  const content = text ? [schema.text(text)] : undefined
  return paragraph.create(null, content)
}

function createTurnIntoNode(schema: Schema, type: TurnIntoType, text: string): ProseNode | null {
  const safeText = text.trim()
  const paragraph = createParagraph(schema, safeText)
  if (!paragraph) return null

  if (type === 'paragraph') return paragraph

  if (type === 'heading1' || type === 'heading2' || type === 'heading3') {
    const heading = schema.nodes.heading
    if (!heading) return null
    const level = Number(type.slice(-1))
    return heading.create({ level }, paragraph.content)
  }

  if (type === 'blockquote') {
    const blockquote = schema.nodes.blockquote
    if (!blockquote) return null
    return blockquote.create(null, [paragraph])
  }

  if (type === 'codeBlock') {
    const codeBlock = schema.nodes.codeBlock
    if (!codeBlock) return null
    return codeBlock.create(null, safeText ? [schema.text(safeText)] : undefined)
  }

  if (type === 'bulletList' || type === 'orderedList') {
    const listType = type === 'orderedList' ? schema.nodes.orderedList : schema.nodes.bulletList
    const listItem = schema.nodes.listItem
    if (!listType || !listItem) return null
    return listType.create(null, [listItem.create(null, [paragraph])])
  }

  if (type === 'taskList') {
    const taskList = schema.nodes.taskList
    const taskItem = schema.nodes.taskItem
    if (!taskList || !taskItem) return null
    return taskList.create(null, [taskItem.create({ checked: false }, [paragraph])])
  }

  return null
}

function focusNearPos(editor: Editor, pos: number) {
  const max = Math.max(1, editor.state.doc.content.size)
  const nextPos = Math.max(1, Math.min(pos, max))
  editor.commands.focus(nextPos)
}

export function insertAbove(editor: Editor, target: BlockMenuTarget): boolean {
  const node = createParagraph(editor.state.schema)
  if (!node) return false
  const tr = editor.state.tr.insert(target.pos, node)
  editor.view.dispatch(tr)
  focusNearPos(editor, target.pos + 1)
  return true
}

export function insertBelow(editor: Editor, target: BlockMenuTarget): boolean {
  const node = createParagraph(editor.state.schema)
  if (!node) return false
  const insertPos = target.pos + target.nodeSize
  const tr = editor.state.tr.insert(insertPos, node)
  editor.view.dispatch(tr)
  focusNearPos(editor, insertPos + 1)
  return true
}

export function duplicateNode(editor: Editor, target: BlockMenuTarget): boolean {
  const node = editor.state.doc.nodeAt(target.pos)
  if (!node) return false
  const clone = editor.state.schema.nodeFromJSON(node.toJSON())
  const insertPos = target.pos + node.nodeSize
  const tr = editor.state.tr.insert(insertPos, clone)
  editor.view.dispatch(tr)
  focusNearPos(editor, insertPos + 1)
  return true
}

export function deleteNode(editor: Editor, target: BlockMenuTarget): boolean {
  const node = editor.state.doc.nodeAt(target.pos)
  if (!node) return false
  const tr = editor.state.tr.delete(target.pos, target.pos + node.nodeSize)
  const fallback = Math.max(1, Math.min(target.pos, tr.doc.content.size))
  tr.setSelection(TextSelection.near(tr.doc.resolve(fallback), -1))
  editor.view.dispatch(tr)
  editor.commands.focus()
  return true
}

export function turnInto(editor: Editor, target: BlockMenuTarget, type: TurnIntoType): boolean {
  const node = editor.state.doc.nodeAt(target.pos)
  if (!node) return false
  const replacement = createTurnIntoNode(editor.state.schema, type, node.textContent ?? '')
  if (!replacement) return false

  const tr = editor.state.tr.replaceWith(target.pos, target.pos + node.nodeSize, replacement)
  editor.view.dispatch(tr)
  focusNearPos(editor, target.pos + 1)
  return true
}
