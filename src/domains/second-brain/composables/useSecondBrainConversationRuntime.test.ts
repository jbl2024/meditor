import { createApp, defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecondBrainMessage, SecondBrainSessionSummary } from '../../../shared/api/apiTypes'
import { useSecondBrainConversationRuntime } from './useSecondBrainConversationRuntime'

const api = vi.hoisted(() => ({
  runDeliberation: vi.fn()
}))

vi.mock('../lib/secondBrainApi', () => api)

function flushUi() {
  return nextTick().then(() => Promise.resolve()).then(() => nextTick())
}

function mountConversationRuntime(options: {
  workspacePath?: string
  contextPaths?: string[]
} = {}) {
  const workspacePath = ref(options.workspacePath ?? '/vault')
  const allWorkspaceFiles = ref<string[]>([])
  const contextPaths = ref(options.contextPaths ?? ['/vault/seed.md'])
  const messages = ref<SecondBrainMessage[]>([])
  const mentionInfo = ref('')
  const composerContextPaths = ref<string[]>([])
  const sessionId = ref('s1')
  const sessionTitle = ref('Second Brain Session')
  const selectedAlterId = ref('')
  const sessionsIndex = ref<SecondBrainSessionSummary[]>([])
  const requestInFlight = ref(false)
  const sending = ref(false)
  const sendError = ref('')
  const activeAssistantStreamMessageId = ref<string | null>(null)
  const suppressCancellationError = ref(false)
  const requestedPrompt = ref('')
  const requestedPromptNonce = ref(0)

  let state: any = null
  const app = createApp(defineComponent({
    setup() {
      state = useSecondBrainConversationRuntime({
        workspacePath,
        allWorkspaceFiles,
        contextPaths,
        messages,
        mentionInfo,
        composerContextPaths,
        sessionId,
        sessionTitle,
        selectedAlterId,
        sessionsIndex,
        requestInFlight,
        sending,
        sendError,
        activeAssistantStreamMessageId,
        suppressCancellationError,
        displayMessage: (message) => message.content_md,
        scrollThreadToBottom: vi.fn(async () => {}),
        mergeContextPaths: (nextPaths) => Array.from(new Set([...contextPaths.value, ...nextPaths])),
        replaceContextPaths: vi.fn(async (nextPaths: string[]) => {
          contextPaths.value = nextPaths
          return { ok: true as const }
        }),
        refreshSessionsIndex: vi.fn(async () => {}),
        requestedPrompt,
        requestedPromptNonce
      })
      return () => null
    }
  }))

  const root = document.createElement('div')
  document.body.appendChild(root)
  app.mount(root)

  if (!state) {
    throw new Error('Second Brain conversation runtime did not initialize.')
  }

  return {
    app,
    contextPaths,
    messages,
    requestInFlight,
    sendError,
    sessionId,
    sending,
    state,
    workspacePath
  }
}

describe('useSecondBrainConversationRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.runDeliberation.mockResolvedValue({
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1'
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('serializes assistant citations as workspace-relative paths even when the workspace root casing differs', async () => {
    const mounted = mountConversationRuntime({
      workspacePath: 'd:/vault',
      contextPaths: ['D:/vault/notes/a.md']
    })

    mounted.state.inputMessage.value = 'Explain this note'
    await mounted.state.onSendMessage()
    await flushUi()

    expect(api.runDeliberation).toHaveBeenCalledWith({
      sessionId: 's1',
      mode: 'freestyle',
      message: 'Explain this note'
    })
    expect(mounted.messages.value).toContainEqual(expect.objectContaining({
      id: 'assistant-1',
      citations_json: JSON.stringify(['notes/a.md'])
    }))

    mounted.app.unmount()
  })
})
