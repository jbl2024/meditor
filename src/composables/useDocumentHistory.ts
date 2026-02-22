import { computed, ref } from 'vue'

export function useDocumentHistory() {
  const entries = ref<string[]>([])
  const index = ref(-1)

  const currentPath = computed(() => {
    if (index.value < 0 || index.value >= entries.value.length) return ''
    return entries.value[index.value]
  })

  const canGoBack = computed(() => index.value > 0)
  const canGoForward = computed(() => index.value >= 0 && index.value < entries.value.length - 1)

  function reset() {
    entries.value = []
    index.value = -1
  }

  function record(path: string) {
    const target = path.trim()
    if (!target) return
    if (target === currentPath.value) return

    const next = index.value >= 0
      ? entries.value.slice(0, index.value + 1)
      : []

    next.push(target)
    entries.value = next
    index.value = next.length - 1
  }

  function goBack(): string {
    if (!canGoBack.value) return ''
    index.value -= 1
    return entries.value[index.value] ?? ''
  }

  function goForward(): string {
    if (!canGoForward.value) return ''
    index.value += 1
    return entries.value[index.value] ?? ''
  }

  function replacePath(fromPath: string, toPath: string) {
    if (!fromPath || !toPath || fromPath === toPath) return

    let changed = false
    const next = entries.value.map((path) => {
      if (path !== fromPath) return path
      changed = true
      return toPath
    })

    if (changed) {
      entries.value = next
    }
  }

  return {
    currentPath,
    canGoBack,
    canGoForward,
    reset,
    record,
    goBack,
    goForward,
    replacePath
  }
}
