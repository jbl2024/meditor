import { computed, ref } from 'vue'

export function useFilesystemState() {
  const workingFolderPath = ref('')
  const errorMessage = ref('')
  const selectedCount = ref(0)
  const indexingState = ref<'idle' | 'indexing'>('idle')
  const embeddingQueueState = ref<'idle' | 'queued' | 'running'>('idle')

  const hasWorkspace = computed(() => Boolean(workingFolderPath.value))

  function setWorkspacePath(path: string) {
    workingFolderPath.value = path
  }

  function clearWorkspacePath() {
    workingFolderPath.value = ''
  }

  return {
    workingFolderPath,
    errorMessage,
    selectedCount,
    indexingState,
    embeddingQueueState,
    hasWorkspace,
    setWorkspacePath,
    clearWorkspacePath
  }
}
