import { FilterableDropdownItem } from "../../../shared/components/ui/UiFilterableDropdown.vue"

export type QuickStartLibraryItem = FilterableDropdownItem & {
  prompt: string
}

function parseFrontmatter(raw: string) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

  if (!match) {
    return { data: {}, content: raw }
  }

  const [, yaml, content] = match

  const data: Record<string, string> = {}

  yaml.split('\n').forEach(line => {
    const [key, ...rest] = line.split(':')
    if (!key) return
    data[key.trim()] = rest.join(':').trim()
  })

  return { data, content }
}

/**
 * Load all built-in alters from markdown files
 */
export const builtInAlterModules = import.meta.glob('../data/*.{md,markdown}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export const builtInAlters: QuickStartLibraryItem[] = Object.entries(builtInAlterModules)
  .map(([path, raw]) => {
    const { data, content } = parseFrontmatter(raw)

    return {
      ...data,
      prompt: content.trim(),
      id: data.id || path.split('/').pop()?.replace(/\.md$/, '') || 'unknown'
    } as QuickStartLibraryItem
  })
  .sort((a, b) => a.id.localeCompare(b.id))
