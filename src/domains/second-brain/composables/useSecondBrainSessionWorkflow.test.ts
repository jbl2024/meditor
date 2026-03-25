import { computed, createApp, defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettingsAlters } from '../../../shared/api/apiTypes'
import { useSecondBrainSessionWorkflow } from './useSecondBrainSessionWorkflow'

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
  fetchAlterList: vi.fn()
}))

vi.mock('../../alters/lib/altersApi', () => altersApi)

const echoesPack = vi.hoisted(() => ({
  useEchoesPack: vi.fn()
}))

vi.mock('../../echoes/composables/useEchoesPack', () => echoesPack)

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
    altersApi.fetchAlterList.mockResolvedValue([
      {
        id: 'alter-strategist',
        name: 'Strategist',
        slug: 'strategist',
        description: 'Stress tests plans.',
        icon: null,
        color: null,
        category: 'Strategy',
        mission: 'Challenge plans.',
        is_favorite: true,
        is_built_in: false,
        revision_count: 1,
        updated_at_ms: 1
      }
    ])
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
})
