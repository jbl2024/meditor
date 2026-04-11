import { describe, expect, it } from 'vitest'
import { getBlockStructureLabel, isSelectionInsideList, toBlockMenuTarget, toSelectionBlockMenuTarget, toSelectionBlockMenuTargets } from './guards'
import type { BlockMenuTarget } from './types'

function target(overrides: Partial<BlockMenuTarget>): BlockMenuTarget {
  return {
    pos: 0,
    nodeType: 'paragraph',
    nodeSize: 1,
    canDelete: true,
    canConvert: true,
    text: '',
    ...overrides
  }
}

describe('getBlockStructureLabel', () => {
  it('returns short labels for common block types', () => {
    expect(getBlockStructureLabel(target({ nodeType: 'paragraph' }))).toBe('P')
    expect(getBlockStructureLabel(target({ nodeType: 'codeBlock' }))).toBe('Code')
    expect(getBlockStructureLabel(target({ nodeType: 'bulletList' }))).toBe('UL')
    expect(getBlockStructureLabel(target({ nodeType: 'orderedList' }))).toBe('OL')
    expect(getBlockStructureLabel(target({ nodeType: 'taskList' }))).toBe('TL')
    expect(getBlockStructureLabel(target({ nodeType: 'listItem' }))).toBe('LI')
    expect(getBlockStructureLabel(target({ nodeType: 'taskItem' }))).toBe('TI')
    expect(getBlockStructureLabel(target({ nodeType: 'quoteBlock' }))).toBe('Q')
    expect(getBlockStructureLabel(target({ nodeType: 'calloutBlock' }))).toBe('Cal')
    expect(getBlockStructureLabel(target({ nodeType: 'mermaidBlock' }))).toBe('Mmd')
    expect(getBlockStructureLabel(target({ nodeType: 'htmlBlock' }))).toBe('HTML')
    expect(getBlockStructureLabel(target({ nodeType: 'tableCell' }))).toBe('Tbl')
  })

  it('includes heading level when present', () => {
    expect(getBlockStructureLabel(target({ nodeType: 'heading', attrs: { level: 1 } }))).toBe('H1')
    expect(getBlockStructureLabel(target({ nodeType: 'heading', attrs: { level: 2 } }))).toBe('H2')
    expect(getBlockStructureLabel(target({ nodeType: 'heading', attrs: { level: 3 } }))).toBe('H3')
    expect(getBlockStructureLabel(target({ nodeType: 'heading', attrs: { level: 6 } }))).toBe('H6')
  })

  it('falls back to a humanized node type for uncommon blocks', () => {
    expect(getBlockStructureLabel(target({ nodeType: 'customBlock' }))).toBe('Custom')
  })

  it('returns an empty label when no target is active', () => {
    expect(getBlockStructureLabel(null)).toBe('')
  })
})

describe('toBlockMenuTarget', () => {
  it('copies node attrs so downstream UI can read the heading level', () => {
    const node = {
      type: { name: 'heading' },
      nodeSize: 3,
      attrs: { level: 2 },
      textContent: 'Title'
    } as any

    expect(toBlockMenuTarget(node, 5)).toEqual({
      pos: 5,
      nodeType: 'heading',
      nodeSize: 3,
      canDelete: true,
      canConvert: true,
      text: 'Title',
      attrs: { level: 2 }
    })
  })
})

describe('toSelectionBlockMenuTarget', () => {
  it('maps a collapsed heading or paragraph selection to its containing block', () => {
    const headingNode = {
      type: { name: 'heading' },
      nodeSize: 4,
      attrs: { level: 2 },
      textContent: 'Title'
    } as any
    const paragraphNode = {
      type: { name: 'paragraph' },
      nodeSize: 3,
      attrs: {},
      textContent: 'Body'
    } as any

    const headingSelection = {
      state: {
        selection: {
          $from: {
            depth: 1,
            parent: headingNode,
            node: (depth: number) => (depth === 1 ? headingNode : { type: { name: 'doc' } }),
            before: () => 1
          }
        }
      }
    } as any
    const paragraphSelection = {
      state: {
        selection: {
          $from: {
            depth: 1,
            parent: paragraphNode,
            node: (depth: number) => (depth === 1 ? paragraphNode : { type: { name: 'doc' } }),
            before: () => 5
          }
        }
      }
    } as any

    expect(toSelectionBlockMenuTarget(headingSelection)).toMatchObject({
      nodeType: 'heading',
      attrs: { level: 2 },
      text: 'Title'
    })
    expect(toSelectionBlockMenuTarget(paragraphSelection)).toMatchObject({
      nodeType: 'paragraph',
      text: 'Body'
    })
  })

  it('maps a cursor inside a list item to the enclosing list block', () => {
    const listNode = {
      type: { name: 'bulletList' },
      nodeSize: 12,
      attrs: {},
      textContent: 'Item'
    } as any
    const paragraphNode = {
      type: { name: 'paragraph' },
      nodeSize: 4,
      attrs: {},
      textContent: 'Item'
    } as any
    const listItemNode = {
      type: { name: 'listItem' },
      nodeSize: 8,
      attrs: {},
      textContent: 'Item'
    } as any
    const editor = {
      state: {
        selection: {
          $from: {
            depth: 3,
            parent: paragraphNode,
            node: (depth: number) => {
              if (depth === 3) return paragraphNode
              if (depth === 2) return listItemNode
              if (depth === 1) return listNode
              return { type: { name: 'doc' } }
            },
            before: (depth: number) => {
              if (depth === 1) return 9
              return 1
            }
          }
        }
      }
    } as any

    expect(toSelectionBlockMenuTarget(editor)).toMatchObject({
      nodeType: 'bulletList',
      text: 'Item'
    })
  })

  it('keeps table selections out of the block handle target', () => {
    const editor = {
      state: {
        selection: {
          $from: {
            depth: 3,
            parent: {
              type: { name: 'paragraph' },
              nodeSize: 4,
              attrs: {},
              textContent: 'Cell'
            },
            node: (depth: number) => {
              if (depth === 3) return { type: { name: 'paragraph' }, nodeSize: 4, attrs: {}, textContent: 'Cell' }
              if (depth === 2) return { type: { name: 'tableCell' }, nodeSize: 10, attrs: {}, textContent: 'Cell' }
              if (depth === 1) return { type: { name: 'tableRow' }, nodeSize: 12, attrs: {}, textContent: 'Cell' }
              return { type: { name: 'table' }, nodeSize: 14, attrs: {}, textContent: 'Cell' }
            },
            before: () => 1
          }
        }
      }
    } as any

    expect(toSelectionBlockMenuTarget(editor)).toBeNull()
  })

  it('returns null for non-textblock selections', () => {
    const editor = {
      state: {
        selection: {
          $from: {
            depth: 1,
            parent: { type: { name: 'tableCell' } },
            node: (depth: number) => (depth === 1 ? { type: { name: 'tableCell' } } : { type: { name: 'doc' } }),
            before: () => 1
          }
        }
      }
    } as any

    expect(toSelectionBlockMenuTarget(editor)).toBeNull()
  })
})

describe('toSelectionBlockMenuTargets', () => {
  function makeDocNode(name: string, size: number) {
    return { type: { name }, nodeSize: size, attrs: {}, textContent: name }
  }

  function makeEditor(from: number, to: number, docNodes: Array<{ name: string; size: number }>) {
    const nodes = docNodes.map(n => makeDocNode(n.name, n.size))
    return {
      state: {
        selection: {
          from,
          to,
          $from: {
            depth: 1,
            parent: nodes[0],
            node: (depth: number) => (depth === 1 ? nodes[0] : { type: { name: 'doc' } }),
            before: () => 0
          }
        },
        doc: {
          forEach(fn: (node: any, offset: number) => void) {
            let offset = 0
            for (const node of nodes) {
              fn(node, offset)
              offset += node.nodeSize
            }
          }
        }
      }
    } as any
  }

  it('returns all top-level nodes that overlap the selection', () => {
    // Three nodes: pos 0 (size 4), pos 4 (size 4), pos 8 (size 4)
    // Selection from=2 to=10 covers all three
    const editor = makeEditor(2, 10, [
      { name: 'paragraph', size: 4 },
      { name: 'heading', size: 4 },
      { name: 'paragraph', size: 4 }
    ])
    const targets = toSelectionBlockMenuTargets(editor)
    expect(targets).toHaveLength(3)
    expect(targets[0].nodeType).toBe('paragraph')
    expect(targets[0].pos).toBe(0)
    expect(targets[1].nodeType).toBe('heading')
    expect(targets[1].pos).toBe(4)
    expect(targets[2].nodeType).toBe('paragraph')
    expect(targets[2].pos).toBe(8)
  })

  it('returns only nodes that overlap the selection range', () => {
    // Three nodes: pos 0 (size 4), pos 4 (size 4), pos 8 (size 4)
    // Selection from=4 to=8 covers only the second node
    const editor = makeEditor(4, 8, [
      { name: 'paragraph', size: 4 },
      { name: 'heading', size: 4 },
      { name: 'paragraph', size: 4 }
    ])
    const targets = toSelectionBlockMenuTargets(editor)
    expect(targets).toHaveLength(1)
    expect(targets[0].nodeType).toBe('heading')
    expect(targets[0].pos).toBe(4)
  })

  it('falls back to single-target logic when selection is collapsed', () => {
    // from === to — collapsed cursor inside a paragraph
    const paragraphNode = { type: { name: 'paragraph' }, nodeSize: 4, attrs: {}, textContent: 'Hello' } as any
    const editor = {
      state: {
        selection: {
          from: 2,
          to: 2,
          $from: {
            depth: 1,
            parent: paragraphNode,
            node: (depth: number) => (depth === 1 ? paragraphNode : { type: { name: 'doc' } }),
            before: () => 0
          }
        },
        doc: {
          forEach() {}
        }
      }
    } as any
    const targets = toSelectionBlockMenuTargets(editor)
    expect(targets).toHaveLength(1)
    expect(targets[0].nodeType).toBe('paragraph')
  })

  it('returns empty array for null editor', () => {
    expect(toSelectionBlockMenuTargets(null)).toEqual([])
  })
})

describe('isSelectionInsideList', () => {
  it('detects selection inside a nested list block', () => {
    const editor = {
      state: {
        selection: {
          $from: {
            depth: 3,
            node: (depth: number) => {
              if (depth === 3) return { type: { name: 'paragraph' } }
              if (depth === 2) return { type: { name: 'listItem' } }
              if (depth === 1) return { type: { name: 'orderedList' } }
              return { type: { name: 'doc' } }
            }
          }
        }
      }
    } as any

    expect(isSelectionInsideList(editor)).toBe(true)
  })

  it('returns false for a regular paragraph selection', () => {
    const editor = {
      state: {
        selection: {
          $from: {
            depth: 1,
            node: (depth: number) => (depth === 1 ? { type: { name: 'paragraph' } } : { type: { name: 'doc' } })
          }
        }
      }
    } as any

    expect(isSelectionInsideList(editor)).toBe(false)
  })
})
