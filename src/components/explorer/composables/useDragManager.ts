import { ref } from 'vue'

export function useDragManager() {
  const draggingPaths = ref<string[]>([])
  const dragTargetPath = ref<string>('')

  function startDrag(paths: string[]) {
    draggingPaths.value = paths
  }

  function setDragTarget(path: string) {
    dragTargetPath.value = path
  }

  function clearDragTarget() {
    dragTargetPath.value = ''
  }

  function endDrag() {
    draggingPaths.value = []
    dragTargetPath.value = ''
  }

  return {
    draggingPaths,
    dragTargetPath,
    startDrag,
    setDragTarget,
    clearDragTarget,
    endDrag
  }
}
