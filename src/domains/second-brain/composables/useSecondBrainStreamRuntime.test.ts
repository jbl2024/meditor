import { createApp, defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecondBrainMessage } from '../../../shared/api/apiTypes'
import { useSecondBrainStreamRuntime } from './useSecondBrainStreamRuntime'

const api = vi.hoisted(() => ({
  cancelDeliberationStream: vi.fn(),
  subscribeSecondBrainStream: vi.fn()
}))

vi.mock('../lib/secondBrainApi', () => api)

const markdownPreview = vi.hoisted(() => ({
  renderSecondBrainMarkdownPreview: vi.fn((content: string) => `<p>${content}</p>`)
}))

vi.mock('../lib/secondBrainMarkdownPreview', () => markdownPreview)

function flushUi() {
  return nextTick().then(() => Promise.resolve()).then(() => nextTick())
}

function mountStreamRuntime(options: {
  sessionId?: string
  contextPaths?: string[]
  scrollRequestNonce?: number
} = {}) {
  const workspacePath = ref('/vault')
  const contextPaths = ref(options.contextPaths ?? ['/vault/seed.md'])
  const messages = ref<SecondBrainMessage[]>([])
  const streamByMessage = ref<Record<string, string>>({})
  const sessionId = ref(options.sessionId ?? 's1')
  const scrollRequestNonce = ref(options.scrollRequestNonce ?? 0)

  let state: any = null
  const app = createApp(defineComponent({
    setup() {
      state = useSecondBrainStreamRuntime({
        workspacePath,
        contextPaths,
        messages,
        streamByMessage,
        sessionId,
        scrollRequestNonce
      })
      return () => null
    }
  }))

  const root = document.createElement('div')
  document.body.appendChild(root)
  app.mount(root)

  if (!state) {
    throw new Error('Second Brain stream runtime did not initialize.')
  }

  return {
    app,
    contextPaths,
    messages,
    scrollRequestNonce,
    sessionId,
    state,
    streamByMessage,
    workspacePath
  }
}

describe('useSecondBrainStreamRuntime', () => {
  const handlers: Record<string, (payload: any) => void> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(handlers)) {
      delete handlers[key]
    }
    api.cancelDeliberationStream.mockResolvedValue(undefined)
    api.subscribeSecondBrainStream.mockImplementation(async (eventName: string, handler: (payload: any) => void) => {
      handlers[eventName] = handler
      return () => {
        delete handlers[eventName]
      }
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('tracks assistant stream events and keeps the live text visible', async () => {
    const mounted = mountStreamRuntime()

    for (let i = 0; i < 3; i += 1) {
      await flushUi()
    }

    handlers['second-brain://assistant-start']?.({
      session_id: 's1',
      message_id: 'assistant-1'
    })
    await flushUi()

    expect(mounted.messages.value).toHaveLength(1)
    expect(mounted.messages.value[0]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content_md: ''
    })
    expect(mounted.streamByMessage.value['assistant-1']).toBe('')
    expect(mounted.state.activeAssistantStreamMessageId.value).toBe('assistant-1')

    handlers['second-brain://assistant-delta']?.({
      session_id: 's1',
      message_id: 'assistant-1',
      chunk: 'Hello'
    })
    await flushUi()

    expect(mounted.streamByMessage.value['assistant-1']).toBe('Hello')
    expect(mounted.state.displayMessage(mounted.messages.value[0])).toBe('Hello')
    expect(mounted.state.renderAssistantMarkdown(mounted.messages.value[0])).toBe('<p>Hello</p>')

    handlers['second-brain://assistant-complete']?.({
      session_id: 's1',
      message_id: 'assistant-1',
      chunk: 'Hello world'
    })
    await flushUi()

    expect(mounted.streamByMessage.value['assistant-1']).toBe('Hello world')
    expect(mounted.state.activeAssistantStreamMessageId.value).toBeNull()
    expect(mounted.state.sending.value).toBe(false)

    mounted.app.unmount()
  })

  it('cancels the active stream and ignores late completion events', async () => {
    const mounted = mountStreamRuntime()

    for (let i = 0; i < 3; i += 1) {
      await flushUi()
    }

    mounted.state.requestInFlight.value = true
    mounted.state.sending.value = true
    mounted.state.activeAssistantStreamMessageId.value = 'assistant-2'

    await mounted.state.onStopStreaming()

    expect(api.cancelDeliberationStream).toHaveBeenCalledWith({
      sessionId: 's1',
      messageId: 'assistant-2'
    })
    expect(mounted.state.sending.value).toBe(false)
    expect(mounted.state.suppressCancellationError.value).toBe(true)

    handlers['second-brain://assistant-complete']?.({
      session_id: 's1',
      message_id: 'assistant-2',
      chunk: 'Cancelled response'
    })
    await flushUi()

    expect(mounted.state.activeAssistantStreamMessageId.value).toBeNull()
    expect(mounted.state.sendError.value).toBe('')
    expect(mounted.streamByMessage.value['assistant-2']).toBeUndefined()

    mounted.app.unmount()
  })

  it('stores workspace-relative citations when the workspace root casing differs', async () => {
    const mounted = mountStreamRuntime({
      contextPaths: ['D:/vault/notes/a.md']
    })

    mounted.workspacePath.value = 'd:/vault'

    for (let i = 0; i < 3; i += 1) {
      await flushUi()
    }

    handlers['second-brain://assistant-start']?.({
      session_id: 's1',
      message_id: 'assistant-3'
    })
    await flushUi()

    expect(mounted.messages.value[0]).toMatchObject({
      id: 'assistant-3',
      citations_json: JSON.stringify(['notes/a.md'])
    })

    mounted.app.unmount()
  })
})
