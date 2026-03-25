import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { FilterableDropdownItem } from '../../../shared/components/ui/UiFilterableDropdown.vue'
import type { AlterSummary, AppSettingsAlters, PulseActionId, SecondBrainMessage, SecondBrainSessionSummary } from '../../../shared/api/apiTypes'
import { writeClipboardText } from '../../../shared/api/clipboardApi'
import { readTextFile } from '../../../shared/api/workspaceApi'
import { fetchAlterList } from '../../alters/lib/altersApi'
import { useEchoesPack } from '../../echoes/composables/useEchoesPack'
import type { EchoesItem } from '../../echoes/lib/echoes'
import { PULSE_ACTIONS_BY_SOURCE, getPulseDropdownItems } from '../../pulse/lib/pulse'
import {
  cancelDeliberationStream,
  createDeliberationSession,
  fetchSecondBrainConfigStatus,
  fetchSecondBrainSessions,
  loadDeliberationSession,
  removeDeliberationSession,
  replaceSessionContext,
  runDeliberation,
  setDeliberationSessionAlter,
  subscribeSecondBrainStream
} from '../lib/secondBrainApi'
import { normalizeContextPathsForUpdate, toAbsoluteWorkspacePath } from '../lib/secondBrainContextPaths'
import { renderSecondBrainMarkdownPreview } from '../lib/secondBrainMarkdownPreview'
import { useSecondBrainAtMentions, type SecondBrainAtMentionItem } from './useSecondBrainAtMentions'

/**
 * Owns the user-visible Second Brain session workflow:
 * session loading, explicit context, assistant streaming, copy/export helpers,
 * Pulse presets, and mention-driven context updates.
 *
 * `SecondBrainView.vue` remains the render shell. This composable owns the
 * domain orchestration so the component does not talk directly to backend APIs.
 */

const DEFAULT_ALTER_SETTINGS: AppSettingsAlters = {
  default_mode: 'neutral',
  show_badge_in_chat: true,
  default_influence_intensity: 'balanced'
}

export type UseSecondBrainViewStateOptions = {
  workspacePath: Ref<string>
  allWorkspaceFiles: Ref<string[]>
  requestedSessionId: Ref<string>
  requestedSessionNonce: Ref<number>
  requestedPrompt: Ref<string>
  requestedPromptNonce: Ref<number>
  requestedAlterId: Ref<string>
  requestedAlterNonce: Ref<number>
  echoesRefreshToken: Ref<number>
  settings: ComputedRef<AppSettingsAlters>
  emitContextChanged: (paths: string[]) => void
  emitSessionChanged: (sessionId: string) => void
  emitOpenNote: (path: string) => void
}

type CopyToast = {
  visible: boolean
  kind: 'success' | 'error'
  message: string
}

export function useSecondBrainViewState(options: UseSecondBrainViewStateOptions) {
  const configError = ref('')
  const loading = ref(false)
  const sessionId = ref('')
  const sessionTitle = ref('Second Brain Session')
  const contextPaths = ref<string[]>([])
  const contextTokenEstimate = ref<Record<string, number>>({})
  const inputMessage = ref('')
  const messages = ref<SecondBrainMessage[]>([])
  const streamByMessage = ref<Record<string, string>>({})
  const copiedByMessageId = ref<Record<string, boolean>>({})
  const sending = ref(false)
  const requestInFlight = ref(false)
  const sendError = ref('')
  const suppressCancellationError = ref(false)
  const creatingSession = ref(false)
  const sessionsIndex = ref<SecondBrainSessionSummary[]>([])
  const mentionInfo = ref('')
  const copyToast = ref<CopyToast>({
    visible: false,
    kind: 'success',
    message: ''
  })
  const composerContextPaths = ref<string[]>([])
  const selectedEchoesContextPath = ref('')
  const composerRef = ref<HTMLTextAreaElement | null>(null)
  const threadRef = ref<HTMLElement | null>(null)
  const threadAutoScrollEnabled = ref(true)
  const threadBottomSentinel = ref<HTMLElement | null>(null)
  const activeAssistantStreamMessageId = ref<string | null>(null)
  const pulseActionId = ref<PulseActionId>('synthesize')
  const pulseDropdownOpen = ref(false)
  const pulseDropdownQuery = ref('')
  const pulseDropdownActiveIndex = ref(0)
  const availableAlters = ref<AlterSummary[]>([])
  const selectedAlterId = ref('')

  const streamUnsubscribers: Array<() => void> = []
  const ignoredAssistantMessageIds = new Set<string>()
  let copyToastTimer: ReturnType<typeof setTimeout> | null = null
  const copyFeedbackTimers: Record<string, ReturnType<typeof setTimeout>> = {}
  const COPY_FEEDBACK_MS = 1300
  const COPY_TOAST_MS = 2000
  let threadBottomObserver: IntersectionObserver | null = null

  const mentions = useSecondBrainAtMentions({
    workspacePath: options.workspacePath,
    allWorkspaceFiles: options.allWorkspaceFiles
  })

  const alterSettings = computed<AppSettingsAlters>(() => options.settings.value ?? DEFAULT_ALTER_SETTINGS)

  function toRelativePath(path: string): string {
    const value = path.replace(/\\/g, '/')
    const root = options.workspacePath.value.replace(/\\/g, '/').replace(/\/+$/, '')
    if (!root) return value
    if (value === root) return '.'
    if (value.startsWith(`${root}/`)) return value.slice(root.length + 1)
    return value
  }

  function canonicalWorkspaceDocumentKey(path: string): string {
    const absolute = toAbsoluteWorkspacePath(options.workspacePath.value, path)
    const relative = toRelativePath(absolute)
    return relative
      .normalize('NFC')
      .replace(/\\/g, '/')
      .replace(/^\.?\//, '')
      .replace(/\/+/g, '/')
      .trim()
      .toLocaleLowerCase()
  }

  const contextCards = computed(() =>
    contextPaths.value.map((path) => {
      const relativePath = toRelativePath(path)
      const parts = relativePath.split('/')
      return {
        path,
        name: parts[parts.length - 1],
        parent: parts.slice(0, -1).join('/') || '.'
      }
    })
  )
  const contextPathSet = computed(() => new Set(
    contextPaths.value
      .map((path) => canonicalWorkspaceDocumentKey(path))
      .filter(Boolean)
  ))
  const echoesAnchorPath = computed(() => {
    const selectedPath = selectedEchoesContextPath.value.trim()
    if (selectedPath && contextPathSet.value.has(canonicalWorkspaceDocumentKey(selectedPath))) return selectedPath
    return ''
  })
  const showEchoesPanel = computed(() => echoesAnchorPath.value.trim().length > 0)
  const echoes = useEchoesPack(echoesAnchorPath, {
    limit: 5,
    refreshKey: () => options.echoesRefreshToken.value
  })
  const pulseActions = computed(() => PULSE_ACTIONS_BY_SOURCE.second_brain_context)
  const pulseDropdownItems = computed(() => getPulseDropdownItems('second_brain_context', { grouped: true }))
  const activePulseAction = computed(
    () => pulseActions.value.find((item) => item.id === pulseActionId.value) ?? pulseActions.value[0]
  )
  const echoesItems = computed<EchoesItem[]>(() => {
    const deduped: EchoesItem[] = []
    const seen = new Set<string>()

    for (const item of echoes.items.value) {
      const normalizedPath = toAbsoluteWorkspacePath(options.workspacePath.value, item.path)
      const identityKey = canonicalWorkspaceDocumentKey(item.path)
      if (!normalizedPath || !identityKey || seen.has(identityKey)) continue
      seen.add(identityKey)
      deduped.push({
        ...item,
        path: normalizedPath
      })
    }

    return deduped
  })
  const activeAlterLabel = computed(() => {
    if (!selectedAlterId.value) return 'Neutral'
    return availableAlters.value.find((item) => item.id === selectedAlterId.value)?.name ?? 'Neutral'
  })
  const canCopyConversation = computed(() =>
    Boolean(sessionId.value && !requestInFlight.value && (contextPaths.value.length > 0 || messages.value.length > 0))
  )

  function isPathInContext(path: string): boolean {
    return contextPathSet.value.has(canonicalWorkspaceDocumentKey(path))
  }

  function mergeContextPaths(nextPaths: string[]): string[] {
    const merged = new Set(contextPaths.value)
    for (const path of nextPaths) {
      merged.add(path)
    }
    return Array.from(merged)
  }

  function addComposerContextPath(path: string) {
    if (!path.trim()) return
    const merged = new Set(composerContextPaths.value)
    merged.add(path)
    composerContextPaths.value = Array.from(merged)
  }

  async function syncContextWithBackend(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!sessionId.value) return { ok: true }
    try {
      const normalized = normalizeContextPathsForUpdate(options.workspacePath.value, contextPaths.value)
      await replaceSessionContext(sessionId.value, normalized)
      contextPaths.value = normalized
      const next: Record<string, number> = {}
      for (const path of normalized) {
        next[path] = contextTokenEstimate.value[path] ?? 0
      }
      contextTokenEstimate.value = next
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update context.'
      sendError.value = message
      return { ok: false, error: message }
    }
  }

  async function removeContextPath(path: string) {
    const previousContextPaths = [...contextPaths.value]
    const previousComposerPaths = [...composerContextPaths.value]
    contextPaths.value = contextPaths.value.filter((item) => item !== path)
    composerContextPaths.value = composerContextPaths.value.filter((item) => item !== path)
    options.emitContextChanged(contextPaths.value)

    const sync = await syncContextWithBackend()
    if (!sync.ok) {
      contextPaths.value = previousContextPaths
      composerContextPaths.value = previousComposerPaths
      options.emitContextChanged(contextPaths.value)
      mentionInfo.value = `Could not remove ${toRelativePath(path)} from Second Brain context: ${sync.error}`
      return
    }

    mentionInfo.value = ''
  }

  async function addPathToContext(path: string): Promise<boolean> {
    if (!path.trim()) return false
    const previousContextPaths = [...contextPaths.value]
    contextPaths.value = mergeContextPaths([path])
    options.emitContextChanged(contextPaths.value)

    const sync = await syncContextWithBackend()
    if (!sync.ok) {
      contextPaths.value = previousContextPaths
      options.emitContextChanged(contextPaths.value)
      mentionInfo.value = `Could not add ${toRelativePath(path)} to Second Brain context: ${sync.error}`
      return false
    }

    mentionInfo.value = ''
    return true
  }

  function asAbsolute(pathRelativeOrAbs: string): string {
    if (!pathRelativeOrAbs) return ''
    if (pathRelativeOrAbs.startsWith('/')) return pathRelativeOrAbs
    if (!options.workspacePath.value) return pathRelativeOrAbs
    return `${options.workspacePath.value}/${pathRelativeOrAbs}`
  }

  function resetActiveSession(config: { emitSessionChange?: boolean } = {}) {
    sessionId.value = ''
    if (config.emitSessionChange ?? true) {
      options.emitSessionChanged('')
    }
    sessionTitle.value = 'Second Brain Session'
    contextPaths.value = []
    contextTokenEstimate.value = {}
    messages.value = []
    streamByMessage.value = {}
    composerContextPaths.value = []
    selectedAlterId.value = alterSettings.value.default_mode === 'last_used' ? selectedAlterId.value : ''
    mentionInfo.value = ''
    options.emitContextChanged([])
  }

  async function scrollThreadToBottom(config: { force?: boolean } = {}) {
    await nextTick()
    const thread = threadRef.value
    if (!thread) return
    if (!config.force && !threadAutoScrollEnabled.value) return
    const sentinel = threadBottomSentinel.value
    if (sentinel && typeof sentinel.scrollIntoView === 'function') {
      sentinel.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' })
    } else {
      thread.scrollTop = thread.scrollHeight
    }
    threadAutoScrollEnabled.value = true
  }

  async function loadSession(nextSessionId: string) {
    if (!nextSessionId.trim()) return
    loading.value = true
    sendError.value = ''
    mentionInfo.value = ''
    composerContextPaths.value = []
    try {
      const payload = await loadDeliberationSession(nextSessionId.trim())
      sessionId.value = payload.session_id
      options.emitSessionChanged(sessionId.value)
      sessionTitle.value = payload.title || 'Second Brain Session'
      selectedAlterId.value = payload.alter_id || ''
      contextPaths.value = payload.context_items.map((item) => asAbsolute(item.path))

      const nextTokens: Record<string, number> = {}
      for (const item of payload.context_items) {
        nextTokens[asAbsolute(item.path)] = item.token_estimate
      }
      contextTokenEstimate.value = nextTokens

      messages.value = payload.messages
      options.emitContextChanged(contextPaths.value)
      await scrollThreadToBottom({ force: true })
    } catch (err) {
      sendError.value = err instanceof Error ? err.message : 'Could not load session.'
    } finally {
      loading.value = false
    }
  }

  async function refreshSessionsIndex() {
    try {
      sessionsIndex.value = await fetchSecondBrainSessions(120)
    } catch {
      sessionsIndex.value = []
    }
  }

  async function refreshAlterList() {
    try {
      availableAlters.value = await fetchAlterList()
    } catch {
      availableAlters.value = []
    }
  }

  async function applySelectedAlter(alterId: string) {
    const normalized = (alterId ?? '').trim()
    selectedAlterId.value = normalized
    if (!sessionId.value) return
    try {
      await setDeliberationSessionAlter(sessionId.value, normalized || null)
    } catch (err) {
      sendError.value = err instanceof Error ? err.message : 'Could not update Alter.'
    }
  }

  async function onCreateSession() {
    if (creatingSession.value) return
    creatingSession.value = true
    try {
      const created = await createDeliberationSession(
        selectedAlterId.value
          ? { contextPaths: [], title: '', alterId: selectedAlterId.value }
          : { contextPaths: [], title: '' }
      )
      sessionId.value = created.sessionId
      options.emitSessionChanged(sessionId.value)
      sessionTitle.value = 'Second Brain Session'
      contextPaths.value = []
      contextTokenEstimate.value = {}
      messages.value = []
      streamByMessage.value = {}
      composerContextPaths.value = []
      mentionInfo.value = ''
      options.emitContextChanged(contextPaths.value)
      await scrollThreadToBottom({ force: true })
      await refreshSessionsIndex()
    } finally {
      creatingSession.value = false
    }
  }

  async function onDeleteSession(sessionToDelete: string) {
    if (!sessionToDelete.trim()) return
    await removeDeliberationSession(sessionToDelete)
    await refreshSessionsIndex()

    if (sessionId.value !== sessionToDelete) return

    resetActiveSession()
  }

  async function initializeSessionOnFirstOpen() {
    if (sessionId.value) return

    void refreshAlterList()
    await refreshSessionsIndex()
    if (sessionId.value) return

    if (options.requestedSessionId.value.trim()) {
      await loadSession(options.requestedSessionId.value.trim())
    } else {
      selectedAlterId.value = alterSettings.value.default_mode === 'last_used'
        ? options.requestedAlterId.value.trim()
        : ''
      resetActiveSession({ emitSessionChange: false })
    }
  }

  function displayMessage(message: SecondBrainMessage): string {
    if (message.role === 'assistant') {
      return streamByMessage.value[message.id] ?? message.content_md
    }
    return message.content_md
  }

  function renderAssistantMarkdown(message: SecondBrainMessage): string {
    return renderSecondBrainMarkdownPreview(displayMessage(message))
  }

  function showCopyToast(kind: 'success' | 'error', message: string, durationMs = COPY_TOAST_MS) {
    if (copyToastTimer) clearTimeout(copyToastTimer)
    copyToast.value = {
      visible: true,
      kind,
      message
    }
    copyToastTimer = setTimeout(() => {
      copyToast.value.visible = false
      copyToastTimer = null
    }, durationMs)
  }

  function buildConversationMarkdown(contextEntries: Array<{ path: string; content: string }>): string {
    const lines: string[] = [`# ${sessionTitle.value || 'Second Brain Session'}`, '', '## Context', '']

    for (const entry of contextEntries) {
      lines.push(`### ${toRelativePath(entry.path)}`, '', entry.content.trimEnd(), '')
    }

    lines.push('## Conversation', '')
    for (const message of messages.value) {
      lines.push(`### ${message.role === 'assistant' ? 'Assistant' : 'You'}`, '')
      lines.push(displayMessage(message).trimEnd(), '')
    }

    return lines.join('\n').trim()
  }

  async function writeTextToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
    } catch {
      // Fall through to the native Tauri fallback used by desktop webviews without Clipboard API access.
    }
    await writeClipboardText(text)
  }

  async function onCopyConversation() {
    if (!canCopyConversation.value) return

    try {
      const contextEntries = await Promise.all(contextPaths.value.map(async (path) => ({
        path,
        content: await readTextFile(path)
      })))
      const markdown = buildConversationMarkdown(contextEntries)
      await writeTextToClipboard(markdown)
      showCopyToast('success', 'Conversation copied to clipboard.')
    } catch (err) {
      showCopyToast(
        'error',
        err instanceof Error ? err.message : 'Could not copy conversation.',
        COPY_TOAST_MS + 700
      )
    }
  }

  async function applyMentionSuggestion(item: SecondBrainAtMentionItem) {
    const trigger = mentions.trigger.value
    const previousComposerPaths = [...composerContextPaths.value]
    if (trigger) {
      inputMessage.value = `${inputMessage.value.slice(0, trigger.start)}${inputMessage.value.slice(trigger.end)}`
    }
    addComposerContextPath(item.absolutePath)
    const added = await addPathToContext(item.absolutePath)
    if (!added) {
      composerContextPaths.value = previousComposerPaths
      return
    }

    mentionInfo.value = ''
    mentions.close()

    void nextTick(() => {
      composerRef.value?.focus()
      const caret = trigger?.start ?? composerRef.value?.value.length ?? 0
      composerRef.value?.setSelectionRange(caret, caret)
    })
  }

  function updateMentionTriggerFromComposer() {
    mentions.updateTrigger(inputMessage.value, composerRef.value?.selectionStart ?? null)
  }

  function onComposerInput(event: Event) {
    inputMessage.value = (event.target as HTMLTextAreaElement).value
    updateMentionTriggerFromComposer()
  }

  function onComposerKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void onSendMessage()
      return
    }

    if (!mentions.isOpen.value) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      mentions.moveActive(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      mentions.moveActive(-1)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const next = mentions.suggestions.value[mentions.activeIndex.value]
      if (next) {
        void applyMentionSuggestion(next)
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      mentions.close()
    }
  }

  function isThreadNearBottom(thread: HTMLElement): boolean {
    const remaining = thread.scrollHeight - thread.scrollTop - thread.clientHeight
    return remaining <= 8
  }

  function onThreadScroll() {
    const thread = threadRef.value
    if (!thread) return
    if (threadBottomObserver) return
    threadAutoScrollEnabled.value = isThreadNearBottom(thread)
  }

  function setupThreadBottomObserver() {
    if (typeof IntersectionObserver === 'undefined') return
    const thread = threadRef.value
    const sentinel = threadBottomSentinel.value
    if (!thread || !sentinel) return

    threadBottomObserver?.disconnect()
    threadBottomObserver = new IntersectionObserver(([entry]) => {
      threadAutoScrollEnabled.value = Boolean(entry?.isIntersecting)
    }, {
      root: thread,
      threshold: 1
    })
    threadBottomObserver.observe(sentinel)
  }

  async function onSendMessage() {
    if (!sessionId.value || !inputMessage.value.trim() || requestInFlight.value) return
    requestInFlight.value = true
    sending.value = true
    sendError.value = ''
    mentionInfo.value = ''
    activeAssistantStreamMessageId.value = null
    const outgoing = inputMessage.value.trim()

    const mentionResolution = mentions.resolveMentionedPaths(outgoing)
    const mergedMentionPaths = Array.from(new Set([
      ...composerContextPaths.value,
      ...mentionResolution.resolvedPaths
    ]))

    if (mergedMentionPaths.length > 0) {
      contextPaths.value = mergeContextPaths(mergedMentionPaths)
      options.emitContextChanged(contextPaths.value)
      const sync = await syncContextWithBackend()
      if (!sync.ok) {
        mentionInfo.value = `Could not update Second Brain context: ${sync.error}`
      }
    }
    if (mentionResolution.unresolved.length > 0) {
      mentionInfo.value = `Ignored unresolved mentions: ${mentionResolution.unresolved.map((item) => `@${item}`).join(', ')}`
    }

    const tempUserId = `temp-user-${Date.now()}`
    inputMessage.value = ''
    composerContextPaths.value = []
    mentions.close()

    messages.value = [...messages.value, {
      id: tempUserId,
      role: 'user',
      mode: 'freestyle',
      content_md: outgoing,
      citations_json: '[]',
      attachments_json: '[]',
      created_at_ms: Date.now()
    }]
    void scrollThreadToBottom({ force: true })

    try {
      const result = await runDeliberation(
        selectedAlterId.value
          ? {
              sessionId: sessionId.value,
              mode: 'freestyle',
              message: outgoing,
              alterId: selectedAlterId.value
            }
          : {
              sessionId: sessionId.value,
              mode: 'freestyle',
              message: outgoing
            }
      )

      messages.value = messages.value.map((message) =>
        message.id === tempUserId ? { ...message, id: result.userMessageId } : message
      )

      if (!messages.value.some((message) => message.id === result.assistantMessageId)) {
        messages.value = [...messages.value, {
          id: result.assistantMessageId,
          role: 'assistant',
          mode: 'freestyle',
          content_md: streamByMessage.value[result.assistantMessageId] ?? '',
          citations_json: JSON.stringify(contextPaths.value.map((path) => path.replace(`${options.workspacePath.value}/`, ''))),
          attachments_json: '[]',
          created_at_ms: Date.now()
        }]
        void scrollThreadToBottom({ force: true })
      }

      await refreshSessionsIndex()
      const updated = sessionsIndex.value.find((item) => item.session_id === sessionId.value)
      if (updated?.title) {
        sessionTitle.value = updated.title
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send message.'
      if (suppressCancellationError.value && /cancel/i.test(message)) {
        sendError.value = ''
      } else {
        sendError.value = message
      }
    } finally {
      sending.value = false
      requestInFlight.value = false
      activeAssistantStreamMessageId.value = null
      suppressCancellationError.value = false
    }
  }

  async function onStopStreaming() {
    if (!requestInFlight.value || !sending.value) return
    sending.value = false
    suppressCancellationError.value = true
    const activeId = activeAssistantStreamMessageId.value
    if (activeId) {
      ignoredAssistantMessageIds.add(activeId)
    }
    if (!sessionId.value) return
    try {
      await cancelDeliberationStream({
        sessionId: sessionId.value,
        messageId: activeId
      })
    } catch (err) {
      suppressCancellationError.value = false
      sendError.value = err instanceof Error ? err.message : 'Could not stop generation.'
    }
  }

  async function runPulseFromSecondBrain() {
    if (!contextPaths.value.length) {
      mentionInfo.value = 'Add note context before using Pulse.'
      return
    }
    const nextInstruction = inputMessage.value.trim()
    const pulsePrompts: Partial<Record<PulseActionId, string>> = {
      rewrite: 'Rewrite the current context into a clearer version while preserving meaning.',
      condense: 'Condense the current context into a shorter version that keeps the key information.',
      expand: 'Expand the current context into a fuller draft with clearer structure and supporting detail.',
      change_tone: 'Rewrite the current context in a different tone while keeping the substance intact.',
      synthesize: 'Synthesize the current context into a concise, structured summary. Highlight key themes and uncertainties.',
      outline: 'Turn the current context into a clear outline with sections and logical progression.',
      brief: 'Draft a working brief from the current context, including objective, key points, and open questions.',
      extract_themes: 'Extract the dominant themes from the current context and explain how they relate.',
      identify_tensions: 'Identify tensions, contradictions, or open questions in the current context.'
    }
    const basePrompt = pulsePrompts[pulseActionId.value] ?? 'Transform the current context into a useful written output.'
    inputMessage.value = nextInstruction ? `${basePrompt}\n\nAdditional guidance: ${nextInstruction}` : basePrompt
    void nextTick(() => composerRef.value?.focus())
  }

  async function onPulseAction(actionId: PulseActionId) {
    pulseActionId.value = actionId
    await runPulseFromSecondBrain()
  }

  function pulseDropdownMatcher(item: FilterableDropdownItem, query: string): boolean {
    const aliases = Array.isArray(item.aliases) ? item.aliases.map((entry) => String(entry).toLowerCase()) : []
    return aliases.some((token) => token.includes(query))
  }

  function onPulseDropdownSelect(item: FilterableDropdownItem) {
    void onPulseAction(item.id as PulseActionId)
  }

  async function onCopyAssistantMessage(message: SecondBrainMessage) {
    if (message.role !== 'assistant') return
    const content = displayMessage(message).trim()
    if (!content) return

    try {
      await writeTextToClipboard(content)
      copiedByMessageId.value = {
        ...copiedByMessageId.value,
        [message.id]: true
      }
      if (copyFeedbackTimers[message.id]) {
        clearTimeout(copyFeedbackTimers[message.id])
      }
      copyFeedbackTimers[message.id] = setTimeout(() => {
        const next = { ...copiedByMessageId.value }
        delete next[message.id]
        copiedByMessageId.value = next
        delete copyFeedbackTimers[message.id]
      }, COPY_FEEDBACK_MS)
      showCopyToast('success', 'Copied to clipboard.')
    } catch (err) {
      showCopyToast(
        'error',
        err instanceof Error ? err.message : 'Could not copy assistant response.',
        COPY_TOAST_MS + 700
      )
    }
  }

  function openContextNote(path: string) {
    options.emitOpenNote(path)
  }

  function toggleEchoesAnchor(path: string) {
    if (selectedEchoesContextPath.value === path) {
      selectedEchoesContextPath.value = ''
      return
    }

    selectedEchoesContextPath.value = path
  }

  async function addEchoesSuggestion(path: string) {
    await addPathToContext(path)
  }

  onMounted(async () => {
    await refreshAlterList()
    try {
      const status = await fetchSecondBrainConfigStatus()
      if (!status.configured) {
        configError.value = status.error || 'Second Brain config is missing.'
      }
    } catch (err) {
      configError.value = err instanceof Error ? err.message : 'Could not read config status.'
    }

    await initializeSessionOnFirstOpen()
    await nextTick()
    setupThreadBottomObserver()

    streamUnsubscribers.push(await subscribeSecondBrainStream('second-brain://assistant-start', (payload) => {
      if (payload.session_id !== sessionId.value) return
      activeAssistantStreamMessageId.value = payload.message_id
      if (ignoredAssistantMessageIds.has(payload.message_id)) return
      streamByMessage.value = {
        ...streamByMessage.value,
        [payload.message_id]: ''
      }
      if (!messages.value.some((message) => message.id === payload.message_id)) {
        messages.value = [...messages.value, {
          id: payload.message_id,
          role: 'assistant',
          mode: 'freestyle',
          content_md: '',
          citations_json: JSON.stringify(contextPaths.value.map((path) => path.replace(`${options.workspacePath.value}/`, ''))),
          attachments_json: '[]',
          created_at_ms: Date.now()
        }]
        void scrollThreadToBottom()
      }
    }))

    streamUnsubscribers.push(await subscribeSecondBrainStream('second-brain://assistant-delta', (payload) => {
      if (payload.session_id !== sessionId.value) return
      if (ignoredAssistantMessageIds.has(payload.message_id)) return
      const current = streamByMessage.value[payload.message_id] ?? ''
      streamByMessage.value = {
        ...streamByMessage.value,
        [payload.message_id]: `${current}${payload.chunk}`
      }
      if (!messages.value.some((message) => message.id === payload.message_id)) {
        messages.value = [...messages.value, {
          id: payload.message_id,
          role: 'assistant',
          mode: 'freestyle',
          content_md: '',
          citations_json: JSON.stringify(contextPaths.value.map((path) => path.replace(`${options.workspacePath.value}/`, ''))),
          attachments_json: '[]',
          created_at_ms: Date.now()
        }]
      }
      void scrollThreadToBottom()
    }))

    streamUnsubscribers.push(await subscribeSecondBrainStream('second-brain://assistant-complete', (payload) => {
      if (payload.session_id !== sessionId.value) return
      if (ignoredAssistantMessageIds.has(payload.message_id)) {
        ignoredAssistantMessageIds.delete(payload.message_id)
        if (activeAssistantStreamMessageId.value === payload.message_id) {
          activeAssistantStreamMessageId.value = null
        }
        return
      }
      streamByMessage.value = {
        ...streamByMessage.value,
        [payload.message_id]: payload.chunk
      }
      if (activeAssistantStreamMessageId.value === payload.message_id) {
        activeAssistantStreamMessageId.value = null
      }
      sending.value = false
    }))

    streamUnsubscribers.push(await subscribeSecondBrainStream('second-brain://assistant-error', (payload) => {
      if (payload.session_id !== sessionId.value) return
      if (ignoredAssistantMessageIds.has(payload.message_id)) {
        ignoredAssistantMessageIds.delete(payload.message_id)
        if (activeAssistantStreamMessageId.value === payload.message_id) {
          activeAssistantStreamMessageId.value = null
        }
        return
      }
      if (activeAssistantStreamMessageId.value === payload.message_id) {
        activeAssistantStreamMessageId.value = null
      }
      sending.value = false
      sendError.value = payload.error || 'Assistant stream failed.'
    }))
  })

  onBeforeUnmount(() => {
    if (copyToastTimer) {
      clearTimeout(copyToastTimer)
      copyToastTimer = null
    }
    threadBottomObserver?.disconnect()
    threadBottomObserver = null
    for (const timer of Object.values(copyFeedbackTimers)) {
      clearTimeout(timer)
    }
    for (const unsubscribe of streamUnsubscribers) {
      unsubscribe()
    }
  })

  watch(
    () => `${options.requestedSessionId.value}::${options.requestedSessionNonce.value}`,
    (value) => {
      const [id] = value.split('::')
      if (!id.trim()) return
      void loadSession(id)
    }
  )

  watch(
    () => `${options.requestedPromptNonce.value}::${options.requestedPrompt.value}`,
    (value) => {
      const [nonce] = value.split('::')
      if (!nonce.trim()) return
      inputMessage.value = options.requestedPrompt.value
      void nextTick(() => composerRef.value?.focus())
    },
    { immediate: true }
  )

  watch(
    () => `${options.requestedAlterNonce.value}::${options.requestedAlterId.value}`,
    (value) => {
      const [nonce] = value.split('::')
      if (!nonce.trim()) return
      void applySelectedAlter(options.requestedAlterId.value)
    },
    { immediate: true }
  )

  watch(contextPaths, (paths) => {
    if (!selectedEchoesContextPath.value) return
    if (!paths.includes(selectedEchoesContextPath.value)) {
      selectedEchoesContextPath.value = ''
    }
  })

  return {
    activeAlterLabel,
    activePulseAction,
    addEchoesSuggestion,
    alterSettings,
    applyMentionSuggestion,
    applySelectedAlter,
    availableAlters,
    canCopyConversation,
    composerRef,
    configError,
    contextCards,
    contextPaths,
    copiedByMessageId,
    copyToast,
    creatingSession,
    displayMessage,
    echoes,
    echoesItems,
    inputMessage,
    isPathInContext,
    loadSession,
    loading,
    mentionInfo,
    mentions,
    messages,
    onComposerInput,
    onComposerKeydown,
    onCopyAssistantMessage,
    onCopyConversation,
    onCreateSession,
    onDeleteSession,
    onPulseDropdownSelect,
    onSendMessage,
    onStopStreaming,
    onThreadScroll,
    openContextNote,
    pulseDropdownActiveIndex,
    pulseDropdownItems,
    pulseDropdownMatcher,
    pulseDropdownOpen,
    pulseDropdownQuery,
    removeContextPath,
    renderAssistantMarkdown,
    requestInFlight,
    selectedAlterId,
    selectedEchoesContextPath,
    sendError,
    sending,
    sessionId,
    sessionTitle,
    sessionsIndex,
    showEchoesPanel,
    threadBottomSentinel,
    threadRef,
    toRelativePath,
    toggleEchoesAnchor,
    updateMentionTriggerFromComposer
  }
}
