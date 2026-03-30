import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSecondBrainSessionPort } from './useAppSecondBrainBridge'
import { useAppSecondBrainBridge } from './useAppSecondBrainBridge'

type BridgeOptions = {
  workingFolderPath?: string
  activeFilePath?: string
  toAbsoluteWorkspacePath?: (workspacePath: string, path: string) => string | null
  normalizeContextPathsForUpdate?: (workspacePath: string, paths: string[]) => string[]
  createDeliberationSession?: AppSecondBrainSessionPort['createDeliberationSession']
  loadDeliberationSession?: AppSecondBrainSessionPort['loadDeliberationSession']
  replaceSessionContext?: AppSecondBrainSessionPort['replaceSessionContext']
}

function createBridge(options: BridgeOptions = {}) {
  const workingFolderPath = ref(options.workingFolderPath ?? '/vault')
  const activeFilePath = ref(options.activeFilePath ?? '/vault/notes/a.md')
  const errorMessage = ref('')
  const notifySuccess = vi.fn()
  const createDeliberationSession = (options.createDeliberationSession ??
    vi.fn(async () => ({ sessionId: 'session-new  ' }))) as AppSecondBrainSessionPort['createDeliberationSession']
  const loadDeliberationSession = (options.loadDeliberationSession ??
    vi.fn(async (sessionId: string) => ({
      session_id: sessionId,
      context_items: [{ path: '/vault/notes/a.md' }]
    }))) as AppSecondBrainSessionPort['loadDeliberationSession']
  const replaceSessionContext = (options.replaceSessionContext ??
    vi.fn(async () => {})) as AppSecondBrainSessionPort['replaceSessionContext']
  const normalizeContextPathsForUpdate =
    options.normalizeContextPathsForUpdate ??
    vi.fn((_workspacePath: string, paths: string[]) => Array.from(new Set(paths.filter(Boolean))))
  const toAbsoluteWorkspacePath =
    options.toAbsoluteWorkspacePath ??
    vi.fn((_workspacePath: string, path: string) => path.trim() || null)

  const bridge = useAppSecondBrainBridge({
    secondBrainWorkspacePort: {
      workingFolderPath,
      activeFilePath
    },
    secondBrainContextPort: {
      storageKeyForWorkspace: (workspacePath) => `sb:${workspacePath}`,
      toAbsoluteWorkspacePath,
      normalizeContextPathsForUpdate
    },
    secondBrainSessionPort: {
      createDeliberationSession,
      loadDeliberationSession,
      replaceSessionContext
    },
    secondBrainUiEffectsPort: {
      errorMessage,
      notifySuccess
    }
  })

  return {
    workingFolderPath,
    activeFilePath,
    errorMessage,
    notifySuccess,
    toAbsoluteWorkspacePath,
    normalizeContextPathsForUpdate,
    createDeliberationSession,
    loadDeliberationSession,
    replaceSessionContext,
    bridge
  }
}

describe('useAppSecondBrainBridge', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('does not auto-request the persisted session when the workspace changes', async () => {
    window.localStorage.setItem('sb:/vault-2', 'session-2')
    const { workingFolderPath, bridge, loadDeliberationSession } = createBridge()

    workingFolderPath.value = '/vault-2'
    await nextTick()

    expect(bridge.secondBrainRequestedSessionId.value).toBe('')
    expect(bridge.secondBrainRequestedSessionNonce.value).toBe(2)
    expect(loadDeliberationSession).not.toHaveBeenCalled()
  })

  it('restores the persisted session request when explicitly primed for opening Second Brain', () => {
    window.localStorage.setItem('sb:/vault', 'session-persisted')
    const { bridge } = createBridge()

    const sessionId = bridge.primeRequestedSecondBrainSessionFromStorage()

    expect(sessionId).toBe('session-persisted')
    expect(bridge.secondBrainRequestedSessionId.value).toBe('session-persisted')
    expect(bridge.secondBrainRequestedSessionNonce.value).toBe(2)
  })

  it('adds the active note to the requested session context', async () => {
    const { bridge, replaceSessionContext, notifySuccess } = createBridge()
    bridge.setSecondBrainSessionId('session-1')

    const ok = await bridge.addActiveNoteToSecondBrain()

    expect(ok).toBe(true)
    expect(replaceSessionContext).toHaveBeenCalledWith('session-1', ['/vault/notes/a.md'])
    expect(bridge.secondBrainRequestedSessionId.value).toBe('session-1')
    expect(bridge.secondBrainRequestedSessionNonce.value).toBe(2)
    expect(notifySuccess).toHaveBeenCalledWith('Active note added to Second Brain context.')
  })

  it('reuses the persisted session for targeted add-to-second-brain actions', async () => {
    window.localStorage.setItem('sb:/vault', 'session-persisted')
    const { bridge, replaceSessionContext, loadDeliberationSession } = createBridge()

    const ok = await bridge.addActiveNoteToSecondBrain()

    expect(ok).toBe(true)
    expect(loadDeliberationSession).toHaveBeenCalledWith('session-persisted')
    expect(replaceSessionContext).toHaveBeenCalledWith('session-persisted', ['/vault/notes/a.md'])
  })

  it('persists a session id received from the surface', () => {
    const { bridge } = createBridge()

    bridge.onSecondBrainSessionChanged('session-3')

    expect(bridge.secondBrainRequestedSessionId.value).toBe('session-3')
    expect(window.localStorage.getItem('sb:/vault')).toBe('session-3')
  })

  it('trims session ids before persisting and only bumps the nonce when requested', () => {
    const { bridge } = createBridge()

    bridge.setSecondBrainSessionId('  session-5  ')
    expect(bridge.secondBrainRequestedSessionId.value).toBe('session-5')
    expect(bridge.secondBrainRequestedSessionNonce.value).toBe(1)
    expect(window.localStorage.getItem('sb:/vault')).toBe('session-5')

    bridge.setSecondBrainSessionId('  session-6  ', { bumpNonce: true })
    expect(bridge.secondBrainRequestedSessionId.value).toBe('session-6')
    expect(bridge.secondBrainRequestedSessionNonce.value).toBe(2)
    expect(window.localStorage.getItem('sb:/vault')).toBe('session-6')
  })

  it('removes the persisted key when the requested session id becomes empty', () => {
    window.localStorage.setItem('sb:/vault', 'session-1')
    const { bridge } = createBridge()

    bridge.setSecondBrainSessionId('   ')

    expect(bridge.secondBrainRequestedSessionId.value).toBe('')
    expect(window.localStorage.getItem('sb:/vault')).toBeNull()
  })

  it('keeps an existing requested session id when primed for opening Second Brain', () => {
    window.localStorage.setItem('sb:/vault', 'session-persisted')
    const { bridge } = createBridge()
    bridge.setSecondBrainSessionId('session-requested')

    const sessionId = bridge.primeRequestedSecondBrainSessionFromStorage()

    expect(sessionId).toBe('session-requested')
    expect(bridge.secondBrainRequestedSessionNonce.value).toBe(1)
    expect(window.localStorage.getItem('sb:/vault')).toBe('session-requested')
  })

  it('updates the requested prompt and bumps its nonce only when requested', () => {
    const { bridge } = createBridge()

    bridge.setSecondBrainPrompt('Prompt A')
    expect(bridge.secondBrainRequestedPrompt.value).toBe('Prompt A')
    expect(bridge.secondBrainRequestedPromptNonce.value).toBe(0)

    bridge.setSecondBrainPrompt('Prompt B', { bumpNonce: true })
    expect(bridge.secondBrainRequestedPrompt.value).toBe('Prompt B')
    expect(bridge.secondBrainRequestedPromptNonce.value).toBe(1)
  })

  it('prefers the requested session id before checking persisted state', async () => {
    window.localStorage.setItem('sb:/vault', 'session-persisted')
    const { bridge, loadDeliberationSession } = createBridge()
    bridge.setSecondBrainSessionId('session-requested')

    const sessionId = await bridge.resolveSecondBrainSessionForPath('/vault/notes/a.md')

    expect(sessionId).toBe('session-requested')
    expect(loadDeliberationSession).toHaveBeenCalledWith('session-requested')
    expect(loadDeliberationSession).not.toHaveBeenCalledWith('session-persisted')
  })

  it('creates a new session when the persisted session can no longer be loaded', async () => {
    window.localStorage.setItem('sb:/vault', 'session-missing')
    const loadDeliberationSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValue({ session_id: 'session-new', context_items: [] })
    const createDeliberationSession = vi.fn(async () => ({ sessionId: 'session-created  ' }))
    const { bridge } = createBridge({ loadDeliberationSession, createDeliberationSession })

    const sessionId = await bridge.resolveSecondBrainSessionForPath('/vault/notes/a.md')

    expect(sessionId).toBe('session-created')
    expect(createDeliberationSession).toHaveBeenCalledWith({
      contextPaths: ['/vault/notes/a.md'],
      title: ''
    })
  })

  it('fails to resolve a session when the active note path cannot be normalized', async () => {
    const { bridge } = createBridge({
      toAbsoluteWorkspacePath: vi.fn(() => null)
    })

    await expect(bridge.resolveSecondBrainSessionForPath('/vault/notes/a.md')).rejects.toThrow(
      'Could not resolve active note path for Second Brain.'
    )
  })

  it('merges session context through the normalization helper without duplicates', async () => {
    const normalizeContextPathsForUpdate = vi.fn((_workspacePath: string, paths: string[]) =>
      Array.from(new Set(paths.filter(Boolean)))
    )
    const loadDeliberationSession = vi.fn(async () => ({
      session_id: 'session-1',
      context_items: [{ path: '/vault/notes/a.md' }, { path: '/vault/notes/a.md' }, { path: undefined }]
    }))
    const replaceSessionContext = vi.fn(async () => {})
    const { bridge } = createBridge({ normalizeContextPathsForUpdate, loadDeliberationSession, replaceSessionContext })

    await bridge.ensurePathInSecondBrainSession('session-1', '/vault/notes/b.md')

    expect(normalizeContextPathsForUpdate).toHaveBeenCalledWith('/vault', [
      '/vault/notes/a.md',
      '/vault/notes/a.md',
      '',
      '/vault/notes/b.md'
    ])
    expect(replaceSessionContext).toHaveBeenCalledWith('session-1', ['/vault/notes/a.md', '/vault/notes/b.md'])
  })

  it('fails cleanly when adding to second brain without a workspace', async () => {
    const { bridge, errorMessage, notifySuccess } = createBridge({ workingFolderPath: '' })

    const ok = await bridge.addActiveNoteToSecondBrain()

    expect(ok).toBe(false)
    expect(errorMessage.value).toBe('Open a workspace first.')
    expect(notifySuccess).not.toHaveBeenCalled()
  })

  it('fails cleanly when adding to second brain without an active note', async () => {
    const { bridge, errorMessage, notifySuccess } = createBridge({ activeFilePath: '' })

    const ok = await bridge.addActiveNoteToSecondBrain()

    expect(ok).toBe(false)
    expect(errorMessage.value).toBe('No active note to add to Second Brain.')
    expect(notifySuccess).not.toHaveBeenCalled()
  })

  it('fails cleanly when the active note path cannot be resolved during add', async () => {
    const { bridge, errorMessage, notifySuccess } = createBridge({
      toAbsoluteWorkspacePath: vi.fn(() => null)
    })

    const ok = await bridge.addActiveNoteToSecondBrain()

    expect(ok).toBe(false)
    expect(errorMessage.value).toBe('Could not resolve active note path for Second Brain.')
    expect(notifySuccess).not.toHaveBeenCalled()
  })

  it('creates a fresh session when add-to-second-brain has no requested or persisted session', async () => {
    const createDeliberationSession = vi.fn(async () => ({ sessionId: 'session-created  ' }))
    const loadDeliberationSession = vi.fn(async (sessionId: string) => ({
      session_id: sessionId,
      context_items: []
    }))
    const replaceSessionContext = vi.fn(async () => {})
    const { bridge, notifySuccess } = createBridge({
      createDeliberationSession,
      loadDeliberationSession,
      replaceSessionContext
    })

    const ok = await bridge.addActiveNoteToSecondBrain()

    expect(ok).toBe(true)
    expect(createDeliberationSession).toHaveBeenCalledWith({
      contextPaths: ['/vault/notes/a.md'],
      title: ''
    })
    expect(replaceSessionContext).toHaveBeenCalledWith('session-created', ['/vault/notes/a.md'])
    expect(bridge.secondBrainRequestedSessionId.value).toBe('session-created')
    expect(bridge.secondBrainRequestedSessionNonce.value).toBe(2)
    expect(notifySuccess).toHaveBeenCalledWith('Active note added to Second Brain context.')
  })

  it('surfaces thrown errors exactly when add-to-second-brain fails inside session updates', async () => {
    const replaceSessionContext = vi.fn(async () => {
      throw new Error('replace failed')
    })
    const { bridge, errorMessage, notifySuccess } = createBridge({ replaceSessionContext })

    const ok = await bridge.addActiveNoteToSecondBrain()

    expect(ok).toBe(false)
    expect(errorMessage.value).toBe('replace failed')
    expect(notifySuccess).not.toHaveBeenCalled()
  })
})
