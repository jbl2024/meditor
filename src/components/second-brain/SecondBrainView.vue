<script setup lang="ts">
import { computed, onMounted } from 'vue'
import SecondBrainContextPanel from './SecondBrainContextPanel.vue'
import SecondBrainDeliberationPanel from './SecondBrainDeliberationPanel.vue'
import SecondBrainOutputsPanel from './SecondBrainOutputsPanel.vue'
import SecondBrainSessionsList from './SecondBrainSessionsList.vue'
import { useSecondBrainState } from '../../composables/useSecondBrainState'

const props = defineProps<{
  workspacePath: string
  allWorkspaceFiles: string[]
  openFile: (path: string) => Promise<string>
  saveFile: (path: string, text: string, options: { explicit: boolean }) => Promise<{ persisted: boolean }>
  renameFileFromTitle: (path: string, title: string) => Promise<{ path: string; title: string }>
  loadLinkTargets: () => Promise<string[]>
  loadLinkHeadings: (target: string) => Promise<string[]>
  loadPropertyTypeSchema: () => Promise<Record<string, string>>
  savePropertyTypeSchema: (schema: Record<string, string>) => Promise<void>
  openLinkTarget: (target: string) => Promise<boolean>
}>()

const emit = defineEmits<{
  'open-note': [path: string]
}>()

const sb = useSecondBrainState()

const draftPath = computed(() => {
  if (!props.workspacePath || !sb.activeSessionId.value) return ''
  return `${props.workspacePath}/.tomosona/second-brain/drafts/${sb.activeSessionId.value}.md`
})

const allMarkdownFiles = computed(() => props.allWorkspaceFiles.filter((path) => /\.(md|markdown)$/i.test(path)))

async function ensureSession() {
  if (sb.activeSessionId.value) return
  const initialPath = allMarkdownFiles.value.slice(0, 1)
  if (!initialPath.length) return
  await sb.createSessionFromPaths(initialPath, 'Second Brain Session')
}

async function onCreateSession() {
  const seedPaths = allMarkdownFiles.value.slice(0, 1)
  await sb.createSessionFromPaths(seedPaths, 'Second Brain Session')
}

async function onSelectSession(sessionId: string) {
  await sb.loadSession(sessionId)
}

async function onReplaceContext(paths: string[]) {
  await sb.replaceContext(paths)
}

async function onSend() {
  await sb.sendCurrentMessage()
  await sb.refreshSessionList()
}

async function onAppendToDraft(messageId: string) {
  if (!sb.activeSessionId.value) return
  await sb.draft.appendMessage(sb.activeSessionId.value, messageId)
}

async function onPublishNew(payload: { targetDir: string; fileName: string }) {
  if (!sb.activeSessionId.value) return
  await sb.draft.publishToNewNote({
    sessionId: sb.activeSessionId.value,
    targetDir: payload.targetDir,
    fileName: payload.fileName,
    sources: sb.contextItems.value.map((item) => item.path)
  })
  await sb.refreshSessionList()
}

async function onPublishExisting(targetPath: string) {
  if (!sb.activeSessionId.value) return
  await sb.draft.publishToExistingNote(sb.activeSessionId.value, targetPath)
  await sb.refreshSessionList()
}

function onOpenCitation(path: string) {
  emit('open-note', `${props.workspacePath}/${path}`)
}

onMounted(async () => {
  if (!props.workspacePath) return
  await sb.refreshConfigStatus()
  await sb.refreshSessionList()
  await sb.deliberation.bindStreamEvents()
  await ensureSession()
})
</script>

<template>
  <div class="sb-root">
    <aside class="sb-col sb-col-left">
      <SecondBrainContextPanel
        :context-items="sb.contextItems.value"
        :all-files="allMarkdownFiles"
        :token-estimate="sb.tokenEstimate.value"
        @replace-context="onReplaceContext"
      />
      <SecondBrainSessionsList
        :sessions="sb.sessions.sessions.value"
        :active-session-id="sb.activeSessionId.value"
        :loading="sb.sessions.loadingSessions.value"
        @create="onCreateSession"
        @select="onSelectSession"
      />
    </aside>

    <section class="sb-col sb-col-center">
      <div class="sb-headline">
        <h2>{{ sb.activeSessionTitle.value || 'Second Brain' }}</h2>
        <p v-if="sb.configStatus.value && !sb.configStatus.value.configured" class="sb-config-warning">
          {{ sb.configStatus.value.error || 'Configuration manquante.' }}
        </p>
      </div>
      <SecondBrainDeliberationPanel
        :messages="sb.messages.value"
        :mode="sb.selectedMode.value"
        :message-input="sb.inputMessage.value"
        :modes="sb.modes"
        :sending="sb.deliberation.sending.value"
        :send-error="sb.deliberation.sendError.value"
        :resolve-message-content="sb.getMessageContent"
        :citations-by-message-id="sb.citationsByMessageId.value"
        @update:mode="sb.selectedMode.value = $event"
        @update:message-input="sb.inputMessage.value = $event"
        @send="onSend"
        @append-to-draft="onAppendToDraft"
        @open-citation="onOpenCitation"
      />
    </section>

    <aside class="sb-col sb-col-right">
      <SecondBrainOutputsPanel
        v-if="draftPath"
        :draft-path="draftPath"
        :open-paths="[draftPath]"
        :open-file="props.openFile"
        :save-file="props.saveFile"
        :rename-file-from-title="props.renameFileFromTitle"
        :load-link-targets="props.loadLinkTargets"
        :load-link-headings="props.loadLinkHeadings"
        :load-property-type-schema="props.loadPropertyTypeSchema"
        :save-property-type-schema="props.savePropertyTypeSchema"
        :open-link-target="props.openLinkTarget"
        :saving-draft="sb.draft.draftSaving.value"
        :draft-error="sb.draft.draftError.value"
        @publish-new="onPublishNew"
        @publish-existing="onPublishExisting"
      />
      <p v-else class="sb-config-warning">Selectionnez un workspace et une session pour ouvrir le brouillon.</p>
    </aside>
  </div>
</template>

<style scoped>
.sb-root {
  display: grid;
  grid-template-columns: 290px 1fr 420px;
  gap: 10px;
  height: 100%;
  min-height: 0;
  padding: 8px;
  background: linear-gradient(135deg, #f8fafc, #eef2ff 40%, #f1f5f9);
}
.sb-col {
  min-height: 0;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: rgb(255 255 255 / 90%);
  padding: 8px;
  overflow: hidden;
}
.sb-col-center {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 8px;
}
.sb-headline h2 {
  margin: 0;
  font-size: 14px;
}
.sb-config-warning {
  margin: 4px 0 0;
  color: #b91c1c;
  font-size: 12px;
}
@media (max-width: 1280px) {
  .sb-root {
    grid-template-columns: 250px 1fr;
    grid-template-rows: 1fr 320px;
  }
  .sb-col-right {
    grid-column: 1 / span 2;
  }
}
:global(.ide-root.dark) .sb-root {
  background: linear-gradient(140deg, #020617, #0f172a 35%, #082f49 100%);
}
:global(.ide-root.dark) .sb-col {
  border-color: #334155;
  background: rgb(2 6 23 / 88%);
  color: #e2e8f0;
}
</style>
