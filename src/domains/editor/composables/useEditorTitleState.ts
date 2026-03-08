import { computed, ref, type Ref } from 'vue'

/**
 * useEditorTitleState
 *
 * Owns path-scoped title editing state for the editor header.
 */
export function useEditorTitleState(currentPath: Ref<string>, untitledLabel = 'Untitled') {
  const titleByPath = ref<Record<string, string>>({})
  const lastCommittedTitleByPath = ref<Record<string, string>>({})
  const isTitleDirtyByPath = ref<Record<string, boolean>>({})

  const currentTitle = computed(() => {
    const path = currentPath.value
    if (!path) return ''
    return titleByPath.value[path] ?? ''
  })

  const isCurrentTitleDirty = computed(() => {
    const path = currentPath.value
    if (!path) return false
    return Boolean(isTitleDirtyByPath.value[path])
  })

  function normalizeTitle(value: string): string {
    return value.replace(/\s+/g, ' ').trim() || untitledLabel
  }

  function noteTitleFromPath(path: string): string {
    const normalized = path.replace(/\\/g, '/')
    const parts = normalized.split('/')
    const name = parts[parts.length - 1] || normalized
    const stem = name.replace(/\.(md|markdown)$/i, '').trim()
    return stem || untitledLabel
  }

  function syncLoadedTitle(path: string, title: string) {
    const normalized = normalizeTitle(title)
    titleByPath.value = { ...titleByPath.value, [path]: normalized }
    lastCommittedTitleByPath.value = { ...lastCommittedTitleByPath.value, [path]: normalized }
    isTitleDirtyByPath.value = { ...isTitleDirtyByPath.value, [path]: false }
  }

  function setCurrentTitle(path: string, title: string) {
    const current = title
    const committed = lastCommittedTitleByPath.value[path] ?? normalizeTitle(title)
    titleByPath.value = { ...titleByPath.value, [path]: current }
    isTitleDirtyByPath.value = { ...isTitleDirtyByPath.value, [path]: normalizeTitle(current) !== committed }
  }

  function commitTitle(path: string): string {
    const normalized = normalizeTitle(titleByPath.value[path] ?? '')
    titleByPath.value = { ...titleByPath.value, [path]: normalized }
    lastCommittedTitleByPath.value = { ...lastCommittedTitleByPath.value, [path]: normalized }
    isTitleDirtyByPath.value = { ...isTitleDirtyByPath.value, [path]: false }
    return normalized
  }

  function revertTitle(path: string) {
    const committed = lastCommittedTitleByPath.value[path] ?? untitledLabel
    titleByPath.value = { ...titleByPath.value, [path]: committed }
    isTitleDirtyByPath.value = { ...isTitleDirtyByPath.value, [path]: false }
  }

  function movePathState(from: string, to: string) {
    if (!from || !to || from === to) return
    const moveRecord = (record: Record<string, string | boolean>) => {
      if (!(from in record)) return record
      const next = { ...record }
      next[to] = next[from]
      delete next[from]
      return next
    }
    titleByPath.value = moveRecord(titleByPath.value) as Record<string, string>
    lastCommittedTitleByPath.value = moveRecord(lastCommittedTitleByPath.value) as Record<string, string>
    isTitleDirtyByPath.value = moveRecord(isTitleDirtyByPath.value) as Record<string, boolean>
  }

  function resetTitleState(path?: string) {
    if (!path) {
      titleByPath.value = {}
      lastCommittedTitleByPath.value = {}
      isTitleDirtyByPath.value = {}
      return
    }
    const clearRecord = <T>(record: Record<string, T>) => {
      if (!(path in record)) return record
      const next = { ...record }
      delete next[path]
      return next
    }
    titleByPath.value = clearRecord(titleByPath.value)
    lastCommittedTitleByPath.value = clearRecord(lastCommittedTitleByPath.value)
    isTitleDirtyByPath.value = clearRecord(isTitleDirtyByPath.value)
  }

  function getTitle(path: string): string {
    return normalizeTitle(titleByPath.value[path] ?? lastCommittedTitleByPath.value[path] ?? untitledLabel)
  }

  return {
    titleByPath,
    lastCommittedTitleByPath,
    isTitleDirtyByPath,
    currentTitle,
    isCurrentTitleDirty,
    normalizeTitle,
    noteTitleFromPath,
    syncLoadedTitle,
    setCurrentTitle,
    commitTitle,
    revertTitle,
    movePathState,
    resetTitleState,
    getTitle
  }
}
