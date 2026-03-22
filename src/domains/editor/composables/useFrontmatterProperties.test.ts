import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useFrontmatterProperties } from './useFrontmatterProperties'
import type {
  FrontmatterGeneratedProperty,
  FrontmatterGenerationResponse
} from '../../../shared/api/frontmatterGenerationApi'

const apiMocks = vi.hoisted(() => ({
  readPropertyKeys: vi.fn(async () => ['status', 'tags', 'title']),
  readPropertyValueSuggestions: vi.fn(async (key: string) => {
    if (key === 'status') return ['draft', 'review', 'published']
    if (key === 'tags') return ['alpha', 'beta']
    return ['one', 'two']
  })
}))

const generationMocks = vi.hoisted(() => ({
  generateFrontmatterProperties: vi.fn(async (): Promise<FrontmatterGenerationResponse> => ({
    language: 'fr',
    properties: []
  })),
  serializeFrontmatterGenerationField: vi.fn((field: { key: string; type: string; value: unknown }) => ({
    key: field.key,
    type: field.type,
    value: Array.isArray(field.value)
      ? field.value.join(', ')
      : typeof field.value === 'boolean'
        ? String(field.value)
        : String(field.value ?? '')
  }))
}))

vi.mock('../../../shared/api/indexApi', () => apiMocks)
vi.mock('../../../shared/api/frontmatterGenerationApi', () => generationMocks)

function setup(path = 'notes/a.md') {
  const currentPath = ref(path)
  const emitProperties = vi.fn()
  const onDirty = vi.fn()
  const savePropertyTypeSchema = vi.fn(async () => {})
  const loadPropertyTypeSchema = vi.fn(async () => ({ published: 'checkbox', tags: 'tags', bad: 'nope' }))
  const getCurrentTitle = vi.fn(() => 'Titre')
  const getCurrentBodyMarkdown = vi.fn(() => 'Corps de note')

  const api = useFrontmatterProperties({
    currentPath,
    getCurrentTitle,
    getCurrentBodyMarkdown,
    loadPropertyTypeSchema,
    savePropertyTypeSchema,
    onDirty,
    emitProperties
  })

  return {
    currentPath,
    emitProperties,
    onDirty,
    savePropertyTypeSchema,
    loadPropertyTypeSchema,
    getCurrentTitle,
    getCurrentBodyMarkdown,
    api
  }
}

describe('useFrontmatterProperties', () => {
  it('loads and sanitizes schema once', async () => {
    const { api, loadPropertyTypeSchema } = setup()

    await api.ensurePropertySchemaLoaded()
    await api.ensurePropertySchemaLoaded()

    expect(loadPropertyTypeSchema).toHaveBeenCalledTimes(1)
    expect(api.propertySchema.value).toEqual({ published: 'checkbox', tags: 'tags' })
  })

  it('loads workspace property keys for autocomplete', async () => {
    const { api } = setup()

    api.parseAndStoreFrontmatter('notes/a.md', '---\nstatus: draft\n---\nBody')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(api.propertyKeySuggestions.value).toEqual(['status', 'tags', 'title'])
  })

  it('switches to raw mode when parse errors exist', () => {
    const { api } = setup()

    api.parseAndStoreFrontmatter('notes/a.md', '---\ntags:\n  - one\n  bad-indent\n---\nBody')
    expect(api.propertyEditorMode.value).toBe('raw')
    expect(api.activeParseErrors.value.length).toBeGreaterThan(0)
  })

  it('detects duplicate keys and invalid date format in structured editing', () => {
    const { api } = setup()
    api.parseAndStoreFrontmatter('notes/a.md', 'Body')

    api.addPropertyField('date')
    api.onPropertyValueInput(0, '2026/02/25')
    api.addPropertyField('date')

    const messages = api.activeParseErrors.value.map((item) => item.message)
    expect(messages.some((message) => message.includes('Invalid date value'))).toBe(true)
    expect(messages.some((message) => message.includes('Duplicate property key'))).toBe(true)
  })

  it('assigns the expected default types for common second-brain keys', () => {
    const { api } = setup()
    api.parseAndStoreFrontmatter('notes/a.md', 'Body')

    api.addPropertyField('created')
    api.addPropertyField('priority')
    api.addPropertyField('version')

    expect(api.activeFields.value.map((field) => field.type)).toEqual(['date', 'number', 'text'])
  })

  it('coerces values when field type changes', async () => {
    const { api } = setup()
    api.parseAndStoreFrontmatter('notes/a.md', '---\ncount: "7"\n---\nBody')

    await api.onPropertyTypeChange(0, 'number')
    expect(api.activeFields.value[0]?.value).toBe(7)
    expect(typeof api.activeFields.value[0]?.value).toBe('number')
  })

  it('marks document dirty when property value changes', () => {
    const { api, onDirty } = setup()
    api.parseAndStoreFrontmatter('notes/a.md', '---\ntitle: test\n---\nBody')

    api.onPropertyValueInput(0, 'updated')
    expect(onDirty).toHaveBeenCalledWith('notes/a.md')
  })

  it('preloads and caches autocomplete suggestions for property fields', async () => {
    const { api } = setup()
    apiMocks.readPropertyValueSuggestions.mockClear()

    api.parseAndStoreFrontmatter('notes/a.md', '---\nstatus: draft\ntags:\n  - alpha\n---\nBody')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    const firstCallCount = apiMocks.readPropertyValueSuggestions.mock.calls.length
    expect(firstCallCount).toBeGreaterThanOrEqual(2)
    expect(api.propertySuggestionsForField(api.activeFields.value[0]!) ).toEqual(['draft', 'review', 'published'])
    expect(api.propertySuggestionsForField(api.activeFields.value[1]!) ).toEqual(['alpha', 'beta'])

    api.parseAndStoreFrontmatter('notes/a.md', '---\nstatus: draft\ntags:\n  - alpha\n---\nBody')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(apiMocks.readPropertyValueSuggestions.mock.calls.length).toBe(firstCallCount + 2)
  })

  it('refreshes suggestions when a different note is loaded', async () => {
    const { api } = setup()
    apiMocks.readPropertyValueSuggestions.mockClear()

    api.parseAndStoreFrontmatter('notes/a.md', '---\nstatus: draft\n---\nBody')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(api.propertySuggestionsForField(api.activeFields.value[0]!) ).toEqual(['draft', 'review', 'published'])

    apiMocks.readPropertyValueSuggestions.mockImplementation(async (key: string) => {
      if (key === 'status') return ['draft', 'review', 'published', 'blocked']
      return []
    })

    api.parseAndStoreFrontmatter('notes/b.md', '---\nstatus: draft\n---\nBody')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(api.propertySuggestionsForField(api.activeFields.value[0]!) ).toEqual(['draft', 'review', 'published', 'blocked'])
  })

  it('applies generated properties without overwriting existing values in auto mode', async () => {
    const { api, onDirty } = setup()
    api.parseAndStoreFrontmatter('notes/a.md', '---\nstatus: draft\n---\nBody')

    generationMocks.generateFrontmatterProperties.mockResolvedValueOnce({
      language: 'fr',
      properties: [
        { key: 'status', type: 'text', value: 'publié' },
        { key: 'tags', type: 'tags', value: ['projet', 'archive'] }
      ] as FrontmatterGeneratedProperty[]
    } satisfies FrontmatterGenerationResponse)

    await api.generateAutoProperties()

    expect(api.activeFields.value.some((field) => field.key === 'status' && field.value === 'draft')).toBe(true)
    expect(api.activeFields.value.some((field) => field.key === 'tags')).toBe(true)
    expect(onDirty).toHaveBeenCalledWith('notes/a.md')
    expect(generationMocks.generateFrontmatterProperties).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'auto',
      language_hint: expect.any(String),
      title: 'Titre',
      body_markdown: 'Corps de note'
    }))
  })

  it('replaces only the targeted field in sparkle mode', async () => {
    const { api } = setup()
    api.parseAndStoreFrontmatter('notes/a.md', '---\nstatus: draft\ntags: [alpha]\n---\nBody')

    generationMocks.generateFrontmatterProperties.mockResolvedValueOnce({
      language: 'fr',
      properties: [
        { key: 'status', type: 'text', value: 'publié' }
      ] as FrontmatterGeneratedProperty[]
    } satisfies FrontmatterGenerationResponse)

    await api.generatePropertyValue(0)

    expect(api.activeFields.value[0]?.value).toBe('publié')
    expect(api.activeFields.value[1]?.value).toEqual(['alpha'])
  })
})
