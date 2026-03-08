import type { Node as ProseNode } from '@tiptap/pm/model'
import type { BlockMenuTarget, TurnIntoType } from './types'

const NON_BLOCK_NODE_TYPES = new Set(['tableRow', 'tableCell', 'tableHeader'])

export function toBlockMenuTarget(node: ProseNode, pos: number): BlockMenuTarget {
  const canDelete = !NON_BLOCK_NODE_TYPES.has(node.type.name)
  const canConvert = !NON_BLOCK_NODE_TYPES.has(node.type.name)

  return {
    pos,
    nodeType: node.type.name,
    nodeSize: node.nodeSize,
    canDelete,
    canConvert,
    text: node.textContent ?? '',
  }
}

export function canCopyAnchor(target: BlockMenuTarget | null): boolean {
  if (!target) return false
  return target.nodeType === 'heading' && target.text.trim().length > 0
}

export function canTurnInto(target: BlockMenuTarget | null, _type: TurnIntoType): boolean {
  if (!target) return false
  return target.canConvert
}
