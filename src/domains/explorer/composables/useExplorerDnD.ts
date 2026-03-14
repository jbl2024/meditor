import type { IPlacement } from '@vue-dnd-kit/core'
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { TreeNode } from '../../../shared/api/apiTypes'
import {
  normalizeDraggedPaths,
  resolveDropIntent,
  resolveExplorerDropTarget,
  type ExplorerDropIntent
} from '../lib/explorerDndRules'

export type ExplorerRowDropState = {
  active: boolean
  intent: ExplorerDropIntent
  allowed: boolean
  blocked: boolean
  dragging: boolean
  dragGroup: boolean
}

export type ExplorerDnDController = {
  activeDragPaths: Readonly<Ref<string[]>>
  syncDraggedPaths: (paths: string[]) => void
  isRowDraggable: (path: string) => boolean
  isRowDropEnabled: (path: string) => boolean
  buildDragPayload: (path: string) => string[]
  handleDragStart: (path: string) => string[]
  handleDragEnd: () => void
  handleDropResolved: (targetPath: string, placement: IPlacement | undefined) => Promise<boolean>
  rowDropState: (targetPath: string, placement: IPlacement | undefined, isAllowed: boolean) => ExplorerRowDropState
  shouldSuppressPointerInteraction: () => boolean
}

export type UseExplorerDnDOptions = {
  folderPath: Readonly<Ref<string>>
  nodeByPath: Readonly<Ref<Record<string, TreeNode>>>
  parentByPath: Readonly<Ref<Record<string, string>>>
  selectionPaths: Readonly<ComputedRef<string[]>>
  focusedPath: Ref<string>
  editingPath: Readonly<Ref<string>>
  hasActiveFilter: Readonly<ComputedRef<boolean>>
  setSelection: (paths: string[]) => void
  emitSelection: (paths: string[]) => void
  movePaths: (targetDir: string, paths: string[]) => Promise<void>
}

/**
 * Owns explorer-local drag and drop state. It translates row hover state into
 * move intents and delegates the actual filesystem operation to explorer
 * operations so drag and drop stays a thin interaction layer.
 */
export function useExplorerDnD(options: UseExplorerDnDOptions): ExplorerDnDController {
  const activeDragPaths = ref<string[]>([])
  const suppressPointerUntilMs = ref(0)

  const dndDisabled = computed(() => options.hasActiveFilter.value)

  function isRowDraggable(path: string): boolean {
    return Boolean(path && !dndDisabled.value && options.editingPath.value !== path)
  }

  function isRowDropEnabled(path: string): boolean {
    return Boolean(path && !dndDisabled.value && options.editingPath.value !== path)
  }

  function syncDraggedPaths(paths: string[]) {
    const normalized = normalizeDraggedPaths(paths, options.parentByPath.value)
    if (!normalized.length) return
    if (
      normalized.length === activeDragPaths.value.length &&
      normalized.every((path, index) => activeDragPaths.value[index] === path)
    ) {
      return
    }

    activeDragPaths.value = normalized
  }

  function buildDragPayload(path: string): string[] {
    const selectedPaths = options.selectionPaths.value.includes(path)
      ? options.selectionPaths.value
      : [path]
    return normalizeDraggedPaths(selectedPaths, options.parentByPath.value)
  }

  function handleDragStart(path: string): string[] {
    if (!isRowDraggable(path)) {
      activeDragPaths.value = []
      return []
    }

    const nextSelection = buildDragPayload(path)
    syncDraggedPaths(nextSelection)

    if (
      nextSelection.length !== options.selectionPaths.value.length ||
      nextSelection.some((selectedPath, index) => options.selectionPaths.value[index] !== selectedPath)
    ) {
      options.setSelection(nextSelection)
      options.emitSelection(nextSelection)
    }

    options.focusedPath.value = path
    return nextSelection
  }

  function handleDragEnd() {
    activeDragPaths.value = []
    suppressPointerUntilMs.value = Date.now() + 160
  }

  async function handleDropResolved(targetPath: string, placement: IPlacement | undefined): Promise<boolean> {
    const targetNode = options.nodeByPath.value[targetPath]
    const intent = resolveDropIntent(targetNode, placement)
    const resolution = resolveExplorerDropTarget({
      folderPath: options.folderPath.value,
      targetPath,
      intent,
      draggedPaths: activeDragPaths.value,
      nodeByPath: options.nodeByPath.value,
      parentByPath: options.parentByPath.value,
      editingPath: options.editingPath.value,
      hasActiveFilter: options.hasActiveFilter.value
    })

    if (!resolution.isValid || !resolution.targetDir || !activeDragPaths.value.length) {
      handleDragEnd()
      return false
    }

    await options.movePaths(resolution.targetDir, activeDragPaths.value)
    handleDragEnd()
    return true
  }

  function rowDropState(
    targetPath: string,
    placement: IPlacement | undefined,
    isAllowed: boolean
  ): ExplorerRowDropState {
    const targetNode = options.nodeByPath.value[targetPath]
    const intent = resolveDropIntent(targetNode, placement)
    const active = Boolean(placement && activeDragPaths.value.length)

    if (!active) {
      return {
        active: false,
        intent: null,
        allowed: false,
        blocked: false,
        dragging: activeDragPaths.value.includes(targetPath),
        dragGroup: activeDragPaths.value.length > 1 && activeDragPaths.value.includes(targetPath)
      }
    }

    const resolution = resolveExplorerDropTarget({
      folderPath: options.folderPath.value,
      targetPath,
      intent,
      draggedPaths: activeDragPaths.value,
      nodeByPath: options.nodeByPath.value,
      parentByPath: options.parentByPath.value,
      editingPath: options.editingPath.value,
      hasActiveFilter: options.hasActiveFilter.value
    })

    return {
      active,
      intent,
      allowed: isAllowed && resolution.isValid,
      blocked: !isAllowed || !resolution.isValid,
      dragging: activeDragPaths.value.includes(targetPath),
      dragGroup: activeDragPaths.value.length > 1 && activeDragPaths.value.includes(targetPath)
    }
  }

  function shouldSuppressPointerInteraction(): boolean {
    return Date.now() < suppressPointerUntilMs.value
  }

  return {
    activeDragPaths,
    syncDraggedPaths,
    isRowDraggable,
    isRowDropEnabled,
    buildDragPayload,
    handleDragStart,
    handleDragEnd,
    handleDropResolved,
    rowDropState,
    shouldSuppressPointerInteraction
  }
}
