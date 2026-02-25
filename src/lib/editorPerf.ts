export function hasWikilinkHint(text: string): boolean {
  return /[\[\]]/.test(text)
}

function elementFromNode(node: Node | null): Element | null {
  if (!node) return null
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element
  return node.parentElement
}

export function collectAffectedCodeBlocks(records: readonly MutationRecord[], root: HTMLElement): HTMLElement[] {
  const out = new Set<HTMLElement>()

  const addBlockFromNode = (node: Node | null, includeNested: boolean) => {
    const element = elementFromNode(node)
    if (!element || !root.contains(element)) return

    const direct = element.matches('.ce-code') ? element : element.closest('.ce-code')
    if (direct && root.contains(direct)) {
      out.add(direct as HTMLElement)
    }

    if (!includeNested) return

    if ('querySelectorAll' in element) {
      const nested = Array.from(element.querySelectorAll('.ce-code')) as HTMLElement[]
      nested.forEach((block) => {
        if (root.contains(block)) out.add(block)
      })
    }
  }

  records.forEach((record) => {
    addBlockFromNode(record.target, false)
    record.addedNodes.forEach((node) => addBlockFromNode(node, true))
  })

  return [...out]
}
