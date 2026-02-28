import { computed, ref } from 'vue'

/**
 * useWikilinkMenu
 *
 * Purpose:
 * - Manage wikilink candidate results and cache-backed heading lookups.
 *
 * Responsibilities:
 * - Build merged existing/create results from query and target list.
 * - Cache headings by target with TTL.
 * - Keep selected index clamped when result count changes.
 */
export type WikilinkMenuResult = { id: string; label: string; target: string; isCreate: boolean }

export type UseWikilinkMenuOptions = {
  ttlMs?: number
  loadTargets: () => Promise<string[]>
  loadHeadings: (target: string) => Promise<string[]>
}

/**
 * Creates menu state and async cache helpers for wikilink suggestions.
 */
export function useWikilinkMenu(options: UseWikilinkMenuOptions) {
  const open = ref(false)
  const index = ref(0)
  const query = ref('')
  const targets = ref<string[]>([])
  const headingsByTarget = ref<Record<string, string[]>>({})
  const headingsAt = ref<Record<string, number>>({})
  const ttlMs = options.ttlMs ?? 30_000

  const results = computed<WikilinkMenuResult[]>(() => {
    const q = query.value.trim().toLowerCase()
    const out = targets.value
      .filter((target) => !q || target.toLowerCase().includes(q))
      .slice(0, 16)
      .map((target) => ({ id: `existing:${target}`, label: target, target, isCreate: false }))

    if (q && !out.some((item) => item.target.toLowerCase() === q)) {
      out.unshift({ id: `create:${q}`, label: `Create "${q}"`, target: q, isCreate: true })
    }

    if (index.value >= out.length) {
      index.value = out.length > 0 ? out.length - 1 : 0
    }

    return out
  })

  async function refreshTargets() {
    try {
      targets.value = await options.loadTargets()
    } catch {
      targets.value = []
    }
  }

  async function headingsFor(target: string): Promise<string[]> {
    const key = target.trim().toLowerCase()
    const now = Date.now()
    if (headingsByTarget.value[key] && now - (headingsAt.value[key] ?? 0) < ttlMs) {
      return headingsByTarget.value[key]
    }

    try {
      const headings = await options.loadHeadings(target)
      headingsByTarget.value = {
        ...headingsByTarget.value,
        [key]: headings
      }
      headingsAt.value = {
        ...headingsAt.value,
        [key]: now
      }
      return headings
    } catch {
      return []
    }
  }

  function openMenu(nextQuery = '') {
    query.value = nextQuery
    open.value = true
    index.value = 0
  }

  function closeMenu() {
    open.value = false
    index.value = 0
    query.value = ''
  }

  return {
    open,
    index,
    query,
    targets,
    results,
    refreshTargets,
    headingsFor,
    openMenu,
    closeMenu
  }
}
