import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../../../shared/api/apiTypes'
import { useExplorerDnD } from './useExplorerDnD'

function fileNode(path: string): TreeNode {
  return {
    name: path.split('/').pop() ?? path,
    path,
    is_dir: false,
    is_markdown: true,
    has_children: false
  }
}

function dirNode(path: string): TreeNode {
  return {
    name: path.split('/').pop() ?? path,
    path,
    is_dir: true,
    is_markdown: false,
    has_children: true
  }
}

describe('useExplorerDnD', () => {
  it('selects the dragged row when dragging starts from a non-selected item', () => {
    const selected = ref<string[]>(['/vault/a.md'])
    const focusedPath = ref('/vault/a.md')
    const emitSelection = vi.fn((paths: string[]) => {
      selected.value = paths
    })
    const dnd = useExplorerDnD({
      folderPath: ref('/vault'),
      nodeByPath: ref<Record<string, TreeNode>>({
        '/vault/a.md': fileNode('/vault/a.md'),
        '/vault/b.md': fileNode('/vault/b.md')
      }),
      parentByPath: ref<Record<string, string>>({
        '/vault/a.md': '/vault',
        '/vault/b.md': '/vault'
      }),
      selectionPaths: computed(() => selected.value),
      focusedPath,
      editingPath: ref(''),
      hasActiveFilter: computed(() => false),
      setSelection: (paths) => {
        selected.value = paths
      },
      emitSelection,
      movePaths: vi.fn(async () => {})
    })

    expect(dnd.handleDragStart('/vault/b.md')).toEqual(['/vault/b.md'])
    expect(selected.value).toEqual(['/vault/b.md'])
    expect(focusedPath.value).toBe('/vault/b.md')
    expect(emitSelection).toHaveBeenCalledWith(['/vault/b.md'])
  })

  it('drops inside folders via movePaths', async () => {
    const movePaths = vi.fn(async () => {})
    const dnd = useExplorerDnD({
      folderPath: ref('/vault'),
      nodeByPath: ref<Record<string, TreeNode>>({
        '/vault/a.md': fileNode('/vault/a.md'),
        '/vault/folder': dirNode('/vault/folder')
      }),
      parentByPath: ref<Record<string, string>>({
        '/vault/a.md': '/vault',
        '/vault/folder': '/vault'
      }),
      selectionPaths: computed(() => ['/vault/a.md']),
      focusedPath: ref('/vault/a.md'),
      editingPath: ref(''),
      hasActiveFilter: computed(() => false),
      setSelection: vi.fn(),
      emitSelection: vi.fn(),
      movePaths
    })

    dnd.handleDragStart('/vault/a.md')
    await dnd.handleDropResolved('/vault/folder', {
      top: false,
      right: false,
      bottom: false,
      left: false,
      center: true
    })

    expect(movePaths).toHaveBeenCalledWith('/vault/folder', ['/vault/a.md'])
    expect(dnd.activeDragPaths.value).toEqual([])
  })

  it('marks filtered explorer rows as blocked drop targets', () => {
    const dnd = useExplorerDnD({
      folderPath: ref('/vault'),
      nodeByPath: ref<Record<string, TreeNode>>({
        '/vault/folder': dirNode('/vault/folder')
      }),
      parentByPath: ref<Record<string, string>>({
        '/vault/folder': '/vault'
      }),
      selectionPaths: computed(() => ['/vault/a.md']),
      focusedPath: ref('/vault/a.md'),
      editingPath: ref(''),
      hasActiveFilter: computed(() => true),
      setSelection: vi.fn(),
      emitSelection: vi.fn(),
      movePaths: vi.fn(async () => {})
    })

    dnd.handleDragStart('/vault/a.md')

    expect(dnd.rowDropState(
      '/vault/folder',
      { top: false, right: false, bottom: false, left: false, center: true },
      true
    )).toMatchObject({
      active: false,
      allowed: false,
      blocked: false
    })
  })
})
