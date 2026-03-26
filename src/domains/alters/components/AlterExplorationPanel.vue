<script setup lang="ts">
/**
 * Structured Alter Exploration surface.
 *
 * This panel owns the setup form, the round-by-round exploration timeline, and
 * the final synthesis actions. It intentionally renders structured output
 * instead of a free-form chat log.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowPathIcon, DocumentTextIcon, PencilSquareIcon, PlayIcon } from '@heroicons/vue/24/outline'
import UiBadge from '../../../shared/components/ui/UiBadge.vue'
import UiButton from '../../../shared/components/ui/UiButton.vue'
import UiField from '../../../shared/components/ui/UiField.vue'
import UiPanel from '../../../shared/components/ui/UiPanel.vue'
import UiSelect from '../../../shared/components/ui/UiSelect.vue'
import SecondBrainAtMentionsMenu from '../../second-brain/components/SecondBrainAtMentionsMenu.vue'
import { useSecondBrainAtMentions } from '../../second-brain/composables/useSecondBrainAtMentions'
import type { AlterExplorationRoundResult, AlterSummary } from '../../../shared/api/apiTypes'
import { useAlterExploration } from '../composables/useAlterExploration'

const props = defineProps<{
  workspacePath: string
  allWorkspaceFiles: string[]
  activeNotePath: string
  availableAlters: AlterSummary[]
  initialSubject?: string
}>()

const emit = defineEmits<{
  'open-note': [path: string]
}>()

const exploration = useAlterExploration({
  workspacePath: computed(() => props.workspacePath),
  availableAlters: computed(() => props.availableAlters),
  allWorkspaceFiles: computed(() => props.allWorkspaceFiles),
  activeNotePath: computed(() => props.activeNotePath)
})

const {
  subjectText,
  subjectType,
  mode,
  rounds,
  outputFormat,
  selectedAlterIds,
  selectedAlters,
  selectedCountLabel,
  selectionLimitReached,
  hasMinimumAlters,
  canStart,
  session,
  sessions,
  loadingSessions,
  running,
  saving,
  error,
  notice,
  roundGroups,
  resolveAlterName,
  toggleAlterSelection,
  resetSession,
  refreshSessions,
  showSession,
  startExploration,
  cancelExploration,
  saveSynthesisAsNote,
  insertSynthesisIntoActiveNote,
  promoteSynthesisToDraft,
  convertSynthesisToPlan
} = exploration

const roundNumbers = computed<number[]>(() => roundGroups.value.map((group) => group.roundNumber))
const sessionLabel = computed(() => session.value?.id ?? 'No exploration yet')
const subjectTextareaRef = ref<HTMLTextAreaElement | null>(null)
const mentions = useSecondBrainAtMentions({
  workspacePath: computed(() => props.workspacePath),
  allWorkspaceFiles: computed(() => props.allWorkspaceFiles)
})

function splitRoundResults(roundNumber: number): AlterExplorationRoundResult[] {
  return roundGroups.value.find((group) => group.roundNumber === roundNumber)?.results ?? []
}

watch(
  () => props.availableAlters,
  (alters) => {
    if (!selectedAlterIds.value.length && alters.length) {
      selectedAlterIds.value = alters.slice(0, 3).map((item) => item.id)
    }
  },
  { immediate: true, deep: true }
)

watch(
  () => props.initialSubject,
  (next) => {
    const value = next?.trim()
    if (value) {
      subjectText.value = value
      queueMentionUpdate()
    }
  },
  { immediate: true }
)

onMounted(() => {
  void refreshSessions()
})

function queueMentionUpdate() {
  mentions.updateTrigger(subjectText.value, subjectTextareaRef.value?.selectionStart ?? null)
}

function applyMention(item: Parameters<typeof mentions.applySuggestion>[1]) {
  const applied = mentions.applySuggestion(subjectText.value, item)
  subjectText.value = applied.text
  queueMentionUpdate()
  requestAnimationFrame(() => {
    if (!subjectTextareaRef.value) return
    subjectTextareaRef.value.selectionStart = applied.caret
    subjectTextareaRef.value.selectionEnd = applied.caret
    subjectTextareaRef.value.focus()
  })
}

function onSubjectKeydown(event: KeyboardEvent) {
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
  if (event.key === 'Enter' && !event.shiftKey) {
    const next = mentions.suggestions.value[mentions.activeIndex.value]
    if (next) {
      event.preventDefault()
      applyMention(next)
    }
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    mentions.close()
  }
}

function resetSetupAndSession() {
  subjectText.value = ''
  subjectType.value = 'prompt'
  mode.value = 'challenge'
  rounds.value = 2
  outputFormat.value = 'summary'
  selectedAlterIds.value = []
  mentions.close()
  resetSession()
}

function rerunWithDifferentAlters() {
  selectedAlterIds.value = []
  resetSession()
}

async function saveArtifactAndOpen(action: () => Promise<string | null>) {
  const path = await action()
  if (path) {
    emit('open-note', path)
  }
}

const modeOptions = [
  { value: 'challenge', label: 'Challenge' },
  { value: 'explore', label: 'Explore' },
  { value: 'decide', label: 'Decide' },
  { value: 'refine', label: 'Refine' }
] as const

const formatOptions = [
  { value: 'summary', label: 'Summary' },
  { value: 'tension_map', label: 'Tension map' },
  { value: 'decision_brief', label: 'Decision brief' },
  { value: 'refined_proposal', label: 'Refined proposal' }
] as const
</script>

<template>
  <section class="alter-exploration">
    <UiPanel tone="raised" class-name="alter-exploration__panel">
      <div class="alter-exploration__header">
        <div>
          <p class="alter-exploration__kicker">Alter Exploration</p>
          <h3 class="alter-exploration__title">Structured roundtable</h3>
          <p class="alter-exploration__copy">
            Multiple Alters examine the same subject through bounded rounds, cross-reference each other, and converge on a sharper artifact.
          </p>
        </div>
        <div class="alter-exploration__header-actions">
          <UiBadge tone="neutral" size="sm">{{ sessionLabel }}</UiBadge>
          <UiButton size="sm" variant="secondary" :disabled="running" @click="resetSetupAndSession()">
            <template #leading>
              <ArrowPathIcon class="alter-exploration__icon" />
            </template>
            Reset setup
          </UiButton>
        </div>
      </div>

      <div v-if="error" class="alter-exploration__error">
        {{ error }}
      </div>

      <div v-if="notice" class="alter-exploration__notice">
        {{ notice }}
      </div>

      <div class="alter-exploration__setup">
        <UiField label="Subject" for-id="alter-exploration-subject">
          <template #default="{ describedBy }">
            <div class="alter-exploration__subject-input-wrap">
              <textarea
                id="alter-exploration-subject"
                ref="subjectTextareaRef"
                v-model="subjectText"
                :aria-describedby="describedBy"
                :rows="4"
                class="alter-exploration__subject-input"
                placeholder="Should Tomosona support executable runtime note blocks? Type @ to add workspace notes."
                @input="queueMentionUpdate"
                @keyup="queueMentionUpdate"
                @click="queueMentionUpdate"
                @keydown="onSubjectKeydown"
              ></textarea>
              <SecondBrainAtMentionsMenu
                :open="mentions.isOpen.value"
                :suggestions="mentions.suggestions.value"
                :active-index="mentions.activeIndex.value"
                @select="applyMention($event)"
                @update:active-index="mentions.setActiveIndex"
              />
            </div>
          </template>
        </UiField>

        <UiField label="Subject source" for-id="alter-exploration-source">
          <template #default="{ describedBy }">
            <UiSelect id="alter-exploration-source" v-model="subjectType" :aria-describedby="describedBy">
              <option value="prompt">Prompt</option>
              <option value="note">Note</option>
              <option value="selection">Selection</option>
              <option value="response">Response</option>
            </UiSelect>
          </template>
        </UiField>

        <div class="alter-exploration__hint alter-exploration__hint--subject">
          Type `@` to add notes from the workspace. Selected notes are injected into the exploration prompt as context.
        </div>

        <UiField label="Selected Alters" for-id="alter-exploration-alters">
          <template #default>
            <div class="alter-exploration__alters">
              <button
                v-for="item in props.availableAlters"
                :key="item.id"
                type="button"
                class="alter-exploration__alter-chip"
                :class="{ 'alter-exploration__alter-chip--active': selectedAlterIds.includes(item.id) }"
                @click="toggleAlterSelection(item.id)"
              >
                <span>{{ item.name }}</span>
                <small>{{ item.mission }}</small>
              </button>
            </div>
            <p class="alter-exploration__hint">{{ selectedCountLabel }}</p>
            <p v-if="selectionLimitReached" class="alter-exploration__hint">
              Selection limit reached.
            </p>
            <p v-else-if="hasMinimumAlters" class="alter-exploration__hint">
              Ready to start.
            </p>
          </template>
        </UiField>

        <div class="alter-exploration__grid">
          <UiField label="Mode" for-id="alter-exploration-mode">
            <template #default>
              <UiSelect id="alter-exploration-mode" v-model="mode">
                <option v-for="option in modeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </UiSelect>
            </template>
          </UiField>

          <UiField label="Rounds" for-id="alter-exploration-rounds">
            <template #default>
              <UiSelect
                id="alter-exploration-rounds"
                :model-value="String(rounds)"
                @update:modelValue="rounds = Number.parseInt($event, 10) || 2"
              >
                <option value="2">2 rounds</option>
                <option value="3">3 rounds</option>
              </UiSelect>
            </template>
          </UiField>

          <UiField label="Output format" for-id="alter-exploration-format">
            <template #default>
              <UiSelect id="alter-exploration-format" v-model="outputFormat">
                <option v-for="option in formatOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </UiSelect>
            </template>
          </UiField>
        </div>

        <div class="alter-exploration__actions">
          <UiButton
            size="sm"
            variant="primary"
            :disabled="!canStart || running"
            :loading="running"
            @click="void startExploration()"
          >
            <template #leading>
              <PlayIcon class="alter-exploration__icon" />
            </template>
            Start exploration
          </UiButton>
          <UiButton
            size="sm"
            variant="secondary"
            :disabled="!session"
            @click="void cancelExploration()"
          >
            Cancel
          </UiButton>
        </div>
      </div>
    </UiPanel>

    <UiPanel tone="default" class-name="alter-exploration__panel">
      <div class="alter-exploration__header">
        <div>
          <p class="alter-exploration__kicker">Timeline</p>
          <h3 class="alter-exploration__title">Round-by-round output</h3>
        </div>
        <UiBadge tone="neutral" size="sm">
          {{ session?.state ?? 'draft' }}
        </UiBadge>
      </div>

      <div v-if="!session" class="alter-exploration__empty">
        Start an exploration to see the structured rounds and synthesis here.
      </div>

      <template v-else>
        <section class="alter-exploration__subject">
          <p class="alter-exploration__kicker">Subject</p>
          <h4>{{ session.subject.text }}</h4>
          <p class="alter-exploration__copy">
            {{ session.subject.subject_type }} · {{ session.mode }} · {{ session.rounds }} rounds · {{ session.output_format }}
          </p>
          <p v-if="session.subject.source_id?.trim()" class="alter-exploration__hint">
            Context notes:
            <span
              v-for="note in session.subject.source_id.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)"
              :key="note"
              class="alter-exploration__context-note"
            >
              {{ note }}
            </span>
          </p>
          <div class="alter-exploration__subject-meta">
            <UiBadge v-for="item in selectedAlters" :key="item.id" tone="neutral" size="xs">
              {{ item.name }}
            </UiBadge>
          </div>
        </section>

        <section v-for="roundNumber in roundNumbers" :key="roundNumber" class="alter-exploration__round">
          <div class="alter-exploration__round-header">
            <h4>Round {{ roundNumber }}</h4>
            <span>{{ splitRoundResults(roundNumber).length }} responses</span>
          </div>
          <div class="alter-exploration__round-grid">
            <article
              v-for="result in splitRoundResults(roundNumber)"
              :key="`${result.round_number}-${result.alter_id}`"
              class="alter-exploration__result-card"
            >
              <div class="alter-exploration__result-head">
                <strong>{{ result.alter_name ?? resolveAlterName(result.alter_id) }}</strong>
                <UiBadge tone="neutral" size="xs">
                  {{ result.references_alter_ids.length ? result.references_alter_ids.map(resolveAlterName).join(', ') : 'open' }}
                </UiBadge>
              </div>
              <p class="alter-exploration__result-copy">{{ result.content }}</p>
            </article>
          </div>
        </section>

        <section class="alter-exploration__final">
          <div class="alter-exploration__round-header">
            <h4>Final synthesis</h4>
            <UiBadge tone="accent" size="sm">{{ session.output_format }}</UiBadge>
          </div>
          <pre class="alter-exploration__synthesis">{{ session.final_synthesis || 'No synthesis available yet.' }}</pre>

          <div class="alter-exploration__final-actions">
            <UiButton
              size="sm"
              variant="secondary"
              :disabled="saving || !session?.final_synthesis"
              :loading="saving"
              @click="void saveArtifactAndOpen(saveSynthesisAsNote)"
            >
              <template #leading>
                <DocumentTextIcon class="alter-exploration__icon" />
              </template>
              Save as note
            </UiButton>
            <UiButton
              size="sm"
              variant="secondary"
              :disabled="saving || !session?.final_synthesis || !props.activeNotePath.trim()"
              :loading="saving"
              @click="void insertSynthesisIntoActiveNote()"
            >
              Insert into active note
            </UiButton>
            <UiButton
              size="sm"
              variant="secondary"
              :disabled="saving || !session?.final_synthesis"
              :loading="saving"
              @click="void saveArtifactAndOpen(convertSynthesisToPlan)"
            >
              Convert to plan
            </UiButton>
            <UiButton
              size="sm"
              variant="secondary"
              :disabled="saving || !session?.final_synthesis"
              :loading="saving"
              @click="void saveArtifactAndOpen(promoteSynthesisToDraft)"
            >
              Promote to draft
            </UiButton>
            <UiButton size="sm" variant="ghost" :disabled="running" @click="rerunWithDifferentAlters()">
              <template #leading>
                <PencilSquareIcon class="alter-exploration__icon" />
              </template>
              Rerun with different Alters
            </UiButton>
          </div>
        </section>
      </template>
    </UiPanel>

    <UiPanel tone="default" class-name="alter-exploration__panel">
      <div class="alter-exploration__header">
        <div>
          <p class="alter-exploration__kicker">History</p>
          <h3 class="alter-exploration__title">Recent sessions</h3>
        </div>
        <UiButton size="sm" variant="ghost" :disabled="loadingSessions" @click="void refreshSessions()">Refresh</UiButton>
      </div>

      <div v-if="loadingSessions" class="alter-exploration__empty">
        Loading sessions...
      </div>
      <div v-else-if="!sessions.length" class="alter-exploration__empty">
        No exploration sessions yet.
      </div>
      <div v-else class="alter-exploration__history">
        <button
          v-for="item in sessions"
          :key="item.id"
          type="button"
          class="alter-exploration__history-row"
          @click="void showSession(item.id)"
        >
          <strong>{{ item.subject_preview }}</strong>
          <span>{{ item.mode }} · {{ item.alter_count }} Alters · {{ item.state }}</span>
        </button>
      </div>
    </UiPanel>
  </section>
</template>

<style scoped>
.alter-exploration {
  display: grid;
  gap: 1rem;
}

.alter-exploration__panel {
  display: grid;
  gap: 1rem;
}

.alter-exploration__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.alter-exploration__header-actions,
.alter-exploration__actions,
.alter-exploration__final-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: flex-end;
}

.alter-exploration__kicker {
  margin: 0 0 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  opacity: 0.7;
}

.alter-exploration__title {
  margin: 0;
}

.alter-exploration__copy,
.alter-exploration__hint,
.alter-exploration__empty {
  margin: 0;
  opacity: 0.82;
}

.alter-exploration__notice {
  padding: 0.75rem 0.9rem;
  border-radius: 0.75rem;
  background: rgba(58, 115, 84, 0.12);
}

.alter-exploration__error {
  padding: 0.75rem 0.9rem;
  border-radius: 0.75rem;
  background: rgba(180, 60, 60, 0.12);
}

.alter-exploration__setup {
  display: grid;
  gap: 1rem;
}

.alter-exploration__subject-input-wrap {
  position: relative;
}

.alter-exploration__subject-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 0.75rem;
  padding: 0.75rem 0.85rem;
  background: transparent;
  color: inherit;
  resize: vertical;
  min-height: 8rem;
}

.alter-exploration__subject-input:focus {
  outline: none;
  border-color: color-mix(in srgb, currentColor 45%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 12%, transparent);
}

.alter-exploration__subject-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.alter-exploration__hint--subject {
  margin-top: -0.25rem;
}

.alter-exploration__context-note {
  display: inline-flex;
  align-items: center;
  margin-left: 0.5rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  font-size: 0.8rem;
}

.alter-exploration__alters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.alter-exploration__alter-chip {
  display: grid;
  gap: 0.2rem;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 0.9rem;
  padding: 0.75rem 0.85rem;
  background: transparent;
  text-align: left;
  min-width: 11rem;
}

.alter-exploration__alter-chip--active {
  border-color: color-mix(in srgb, currentColor 45%, transparent);
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.alter-exploration__alter-chip small {
  opacity: 0.7;
}

.alter-exploration__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.alter-exploration__round,
.alter-exploration__final {
  display: grid;
  gap: 0.75rem;
}

.alter-exploration__round-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}

.alter-exploration__round-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 0.75rem;
}

.alter-exploration__result-card {
  border-radius: 1rem;
  padding: 0.85rem;
  background: color-mix(in srgb, currentColor 4%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}

.alter-exploration__result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.alter-exploration__result-copy {
  margin: 0;
  white-space: pre-wrap;
}

.alter-exploration__synthesis {
  margin: 0;
  white-space: pre-wrap;
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  background: color-mix(in srgb, currentColor 4%, transparent);
}

.alter-exploration__history {
  display: grid;
  gap: 0.5rem;
}

.alter-exploration__history-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0.9rem;
  border-radius: 0.85rem;
  border: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  background: transparent;
  text-align: left;
}

.alter-exploration__icon {
  width: 1rem;
  height: 1rem;
}
</style>
