import { computed, createApp, defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AlterPayload,
  AlterRevisionPayload,
  AlterSummary,
  AppSettingsAlters,
  CreateAlterPayload
} from '../../../shared/api/apiTypes'
import { useSecondBrainSessionWorkflow } from './useSecondBrainSessionWorkflow'
import { createAlterDraft, useAlterManager } from '../../alters/composables/useAlterManager'

const api = vi.hoisted(() => ({
  createDeliberationSession: vi.fn(),
  fetchAlterList: vi.fn(),
  fetchSecondBrainConfigStatus: vi.fn(),
  fetchSecondBrainSessions: vi.fn(),
  loadDeliberationSession: vi.fn(),
  removeDeliberationSession: vi.fn(),
  replaceSessionContext: vi.fn(),
  setDeliberationSessionAlter: vi.fn()
}))

vi.mock('../lib/secondBrainApi', () => api)

const altersApi = vi.hoisted(() => ({
  createWorkspaceAlter: vi.fn(),
  deleteWorkspaceAlter: vi.fn(),
  duplicateWorkspaceAlter: vi.fn(),
  fetchAlter: vi.fn(),
  fetchAlterList: vi.fn(),
  fetchAlterRevision: vi.fn(),
  fetchAlterRevisions: vi.fn(),
  generateWorkspaceAlterDraft: vi.fn(),
  previewWorkspaceAlter: vi.fn(),
  updateWorkspaceAlter: vi.fn()
}))

vi.mock('../../alters/lib/altersApi', () => altersApi)

const echoesPack = vi.hoisted(() => ({
  useEchoesPack: vi.fn()
}))

vi.mock('../../echoes/composables/useEchoesPack', () => echoesPack)

function buildAlterRecord(id: string, name: string): AlterPayload {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    description: `${name} description`,
    icon: null,
    color: null,
    category: 'Strategy',
    mission: `${name} mission`,
    inspirations: [],
    principles: [],
    reflexes: [],
    values: [],
    critiques: [],
    blind_spots: [],
    system_hints: [],
    style: {
      tone: 'strategic',
      verbosity: 'medium',
      temperature: 0.15,
      contradiction_level: 55,
      exploration_level: 60,
      influence_intensity: 'balanced',
      response_style: 'analytic',
      cite_hypotheses: true,
      signal_biases: true
    },
    invocation_prompt: `Prompt for ${name}`,
    is_favorite: false,
    is_built_in: false,
    created_at_ms: 1,
    updated_at_ms: 1
  }
}

function toAlterSummary(record: AlterPayload): AlterSummary {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: record.description,
    icon: record.icon,
    color: record.color,
    category: record.category,
    mission: record.mission,
    is_favorite: record.is_favorite,
    is_built_in: record.is_built_in,
    revision_count: 1,
    updated_at_ms: record.updated_at_ms
  }
}

function flushUi() {
  return nextTick().then(() => Promise.resolve()).then(() => nextTick())
}

function mountSessionWorkflow(options: {
  requestedSessionId?: string
  requestedSessionNonce?: number
  requestedAlterId?: string
  requestedAlterNonce?: number
} = {}) {
  const workspacePath = ref('/vault')
  const allWorkspaceFiles = ref(['/vault/seed.md', '/vault/notes/a.md'])
  const requestedSessionId = ref(options.requestedSessionId ?? '')
  const requestedSessionNonce = ref(options.requestedSessionNonce ?? 0)
  const requestedAlterId = ref(options.requestedAlterId ?? '')
  const requestedAlterNonce = ref(options.requestedAlterNonce ?? 0)
  const echoesRefreshToken = ref(0)
  const settings = computed<AppSettingsAlters>(() => ({
    default_mode: 'neutral',
    show_badge_in_chat: true,
    default_influence_intensity: 'balanced'
  }))
  const emitContextChanged = vi.fn()
  const emitSessionChanged = vi.fn()
  const emitOpenNote = vi.fn()

  let state: any = null
  const app = createApp(defineComponent({
    setup() {
      state = useSecondBrainSessionWorkflow({
        workspacePath,
        allWorkspaceFiles,
        requestedSessionId,
        requestedSessionNonce,
        requestedAlterId,
        requestedAlterNonce,
        echoesRefreshToken,
        settings,
        emitContextChanged,
        emitSessionChanged,
        emitOpenNote
      })
      return () => null
    }
  }))

  const root = document.createElement('div')
  document.body.appendChild(root)
  app.mount(root)

  if (!state) {
    throw new Error('Second Brain session workflow did not initialize.')
  }

  return {
    app,
    emitContextChanged,
    emitOpenNote,
    emitSessionChanged,
    requestedAlterId,
    requestedAlterNonce,
    requestedSessionId,
    requestedSessionNonce,
    state,
    workspacePath
  }
}

type SharedAlterCatalogWorkflowState = {
  manager: ReturnType<typeof useAlterManager>
  secondBrain: ReturnType<typeof useSecondBrainSessionWorkflow>
}

function mountSharedAlterCatalogWorkflow() {
  const workspacePath = ref('/vault')
  const allWorkspaceFiles = ref(['/vault/seed.md', '/vault/notes/a.md'])
  const requestedSessionId = ref('')
  const requestedSessionNonce = ref(0)
  const requestedAlterId = ref('')
  const requestedAlterNonce = ref(0)
  const echoesRefreshToken = ref(0)
  const settings = computed<AppSettingsAlters>(() => ({
    default_mode: 'neutral',
    show_badge_in_chat: true,
    default_influence_intensity: 'balanced'
  }))
  const emitContextChanged = vi.fn()
  const emitSessionChanged = vi.fn()
  const emitOpenNote = vi.fn()

  let state: SharedAlterCatalogWorkflowState | null = null

  const app = createApp(defineComponent({
    setup() {
      const manager = useAlterManager()
      const secondBrain = useSecondBrainSessionWorkflow({
        workspacePath,
        allWorkspaceFiles,
        requestedSessionId,
        requestedSessionNonce,
        requestedAlterId,
        requestedAlterNonce,
        echoesRefreshToken,
        settings,
        emitContextChanged,
        emitSessionChanged,
        emitOpenNote
      })
      state = { manager, secondBrain }
      return () => null
    }
  }))

  const root = document.createElement('div')
  document.body.appendChild(root)
  app.mount(root)

  if (!state) {
    throw new Error('Shared alter catalog workflow did not initialize.')
  }

  return {
    app,
    root,
    state: state as SharedAlterCatalogWorkflowState
  }
}

describe('useSecondBrainSessionWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    api.fetchSecondBrainConfigStatus.mockResolvedValue({ configured: true, error: null })
    api.fetchSecondBrainSessions.mockResolvedValue([
      {
        session_id: 's1',
        title: 'Session One',
        created_at_ms: 1,
        updated_at_ms: 2,
        context_count: 1,
        target_note_path: '',
        context_paths: ['seed.md']
      }
    ])
    api.loadDeliberationSession.mockResolvedValue({
      session_id: 's1',
      title: 'Session One',
      alter_id: 'alter-strategist',
      provider: 'openai',
      model: 'gpt-4.1',
      created_at_ms: 1,
      updated_at_ms: 2,
      target_note_path: '',
      context_items: [{ path: 'seed.md', token_estimate: 12 }],
      messages: [
        {
          id: 'm1',
          role: 'user',
          mode: 'freestyle',
          content_md: 'Hello',
          citations_json: '[]',
          attachments_json: '[]',
          created_at_ms: 1
        }
      ],
      draft_content: ''
    })
    api.createDeliberationSession.mockResolvedValue({ sessionId: 's-new', createdAtMs: 10 })
    api.removeDeliberationSession.mockResolvedValue(undefined)
    api.replaceSessionContext.mockResolvedValue(12)
    api.setDeliberationSessionAlter.mockResolvedValue('alter-strategist')
    const seededAlters: AlterPayload[] = [buildAlterRecord('alter-strategist', 'Strategist')]
    altersApi.fetchAlterList.mockImplementation(async () => seededAlters.map((record) => toAlterSummary(record)))
    altersApi.fetchAlter.mockImplementation(async (alterId: string): Promise<AlterPayload> =>
      seededAlters.find((record) => record.id === alterId) ?? seededAlters[0]!
    )
    altersApi.fetchAlterRevisions.mockResolvedValue([])
    altersApi.fetchAlterRevision.mockImplementation(async (revisionId: string): Promise<AlterRevisionPayload> => ({
      revision_id: revisionId,
      alter_id: 'alter-strategist',
      created_at_ms: 1,
      reason: null,
      alter: seededAlters[0]!
    }))
    altersApi.createWorkspaceAlter.mockImplementation(async (payload: CreateAlterPayload) => {
      const created: AlterPayload = {
        ...buildAlterRecord(`alter-${seededAlters.length + 1}`, payload.name || `Alter ${seededAlters.length + 1}`),
        description: payload.description,
        icon: payload.icon ?? null,
        color: payload.color ?? null,
        category: payload.category ?? null,
        mission: payload.mission,
        inspirations: [...payload.inspirations],
        principles: [...payload.principles],
        reflexes: [...payload.reflexes],
        values: [...payload.values],
        critiques: [...payload.critiques],
        blind_spots: [...payload.blind_spots],
        system_hints: [...payload.system_hints],
        style: { ...payload.style },
        is_favorite: payload.is_favorite
      }
      seededAlters.push(created)
      return created
    })
    altersApi.updateWorkspaceAlter.mockImplementation(async (payload: CreateAlterPayload & { id: string }) => {
      const existing = seededAlters.find((record) => record.id === payload.id)
      if (!existing) {
        throw new Error(`Missing alter ${payload.id}`)
      }
      Object.assign(existing, {
        name: payload.name,
        description: payload.description,
        icon: payload.icon ?? null,
        color: payload.color ?? null,
        category: payload.category ?? null,
        mission: payload.mission,
        inspirations: [...payload.inspirations],
        principles: [...payload.principles],
        reflexes: [...payload.reflexes],
        values: [...payload.values],
        critiques: [...payload.critiques],
        blind_spots: [...payload.blind_spots],
        system_hints: [...payload.system_hints],
        style: { ...payload.style },
        is_favorite: payload.is_favorite
      })
      return existing
    })
    altersApi.duplicateWorkspaceAlter.mockImplementation(async (alterId: string) => {
      const source = seededAlters.find((record) => record.id === alterId)
      if (!source) {
        throw new Error(`Missing alter ${alterId}`)
      }
      const clone = {
        ...buildAlterRecord(`alter-${seededAlters.length + 1}`, `${source.name} Copy`),
        description: source.description,
        icon: source.icon,
        color: source.color,
        category: source.category,
        mission: source.mission,
        inspirations: [...source.inspirations],
        principles: [...source.principles],
        reflexes: [...source.reflexes],
        values: [...source.values],
        critiques: [...source.critiques],
        blind_spots: [...source.blind_spots],
        system_hints: [...source.system_hints],
        style: { ...source.style },
        invocation_prompt: source.invocation_prompt,
        is_favorite: source.is_favorite,
        is_built_in: source.is_built_in,
        created_at_ms: source.created_at_ms,
        updated_at_ms: source.updated_at_ms + 1
      }
      seededAlters.push(clone)
      return clone
    })
    altersApi.deleteWorkspaceAlter.mockImplementation(async (alterId: string) => {
      const index = seededAlters.findIndex((record) => record.id === alterId)
      if (index >= 0) {
        seededAlters.splice(index, 1)
      }
    })
    echoesPack.useEchoesPack.mockReturnValue({
      items: ref([]),
      loading: ref(false),
      error: ref(''),
      empty: ref(true),
      refresh: vi.fn()
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('loads the requested session and restores the persisted shell state', async () => {
    const mounted = mountSessionWorkflow({
      requestedSessionId: 's1',
      requestedSessionNonce: 1
    })

    for (let i = 0; i < 4; i += 1) {
      await flushUi()
    }

    expect(api.fetchSecondBrainConfigStatus).toHaveBeenCalledTimes(1)
    expect(api.fetchSecondBrainSessions).toHaveBeenCalledWith(120)
    expect(api.loadDeliberationSession).toHaveBeenCalledWith('s1')
    expect(mounted.state.sessionId.value).toBe('s1')
    expect(mounted.state.sessionTitle.value).toBe('Session One')
    expect(mounted.state.selectedAlterId.value).toBe('alter-strategist')
    expect(mounted.state.contextPaths.value).toEqual(['/vault/seed.md'])
    expect(mounted.state.contextTokenEstimate.value['/vault/seed.md']).toBe(12)
    expect(mounted.state.messages.value).toHaveLength(1)
    expect(mounted.emitSessionChanged).toHaveBeenCalledWith('s1')
    expect(mounted.emitContextChanged).toHaveBeenCalledWith(['/vault/seed.md'])

    mounted.app.unmount()
  })

  it('rolls back the context when persistence fails', async () => {
    const mounted = mountSessionWorkflow({
      requestedSessionId: 's1',
      requestedSessionNonce: 1
    })

    for (let i = 0; i < 4; i += 1) {
      await flushUi()
    }

    api.replaceSessionContext.mockRejectedValueOnce(new Error('Denied'))

    const previous = [...mounted.state.contextPaths.value]
    const added = await mounted.state.addPathToContext('/vault/notes/a.md')

    expect(added).toBe(false)
    expect(mounted.state.contextPaths.value).toEqual(previous)
    expect(mounted.emitContextChanged).toHaveBeenLastCalledWith(previous)
    expect(mounted.state.mentionInfo.value).toContain('Could not add notes/a.md to Second Brain context: Denied')

    mounted.app.unmount()
  })

  it('creates a new session and clears the active shell state', async () => {
    const mounted = mountSessionWorkflow({
      requestedAlterId: 'alter-strategist',
      requestedAlterNonce: 1
    })

    for (let i = 0; i < 2; i += 1) {
      await flushUi()
    }

    mounted.state.selectedAlterId.value = 'alter-strategist'
    await mounted.state.onCreateSession()

    expect(api.createDeliberationSession).toHaveBeenCalledWith({
      contextPaths: [],
      title: '',
      alterId: 'alter-strategist'
    })
    expect(mounted.state.sessionId.value).toBe('s-new')
    expect(mounted.state.sessionTitle.value).toBe('Second Brain Session')
    expect(mounted.state.contextPaths.value).toEqual([])
    expect(mounted.state.messages.value).toEqual([])
    expect(mounted.emitSessionChanged).toHaveBeenCalledWith('s-new')
    expect(mounted.emitContextChanged).toHaveBeenCalledWith([])

    mounted.app.unmount()
  })

  it('refreshes the Second Brain alter list after an alter is created in the Alters manager', async () => {
    const mounted = mountSharedAlterCatalogWorkflow()

    for (let i = 0; i < 4; i += 1) {
      await flushUi()
    }

    expect(mounted.state.secondBrain.availableAlters.value).toHaveLength(1)

    mounted.state.manager.draft.value = createAlterDraft()
    mounted.state.manager.draft.value.name = 'Planner'
    mounted.state.manager.draft.value.mission = 'Keep plans honest.'
    await mounted.state.manager.saveDraft()

    for (let i = 0; i < 4; i += 1) {
      await flushUi()
    }

    expect(mounted.state.manager.list.value).toHaveLength(2)
    expect(mounted.state.secondBrain.availableAlters.value).toHaveLength(2)
    expect(mounted.state.secondBrain.availableAlters.value.map((item) => item.name)).toContain('Planner')

    mounted.app.unmount()
  })
})
