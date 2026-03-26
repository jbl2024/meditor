<script setup lang="ts">
import { BookOpenIcon, PlusIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { computed, nextTick, ref, watch } from 'vue'
import UiButton from '../../../shared/components/ui/UiButton.vue'
import UiField from '../../../shared/components/ui/UiField.vue'
import UiInput from '../../../shared/components/ui/UiInput.vue'
import UiModalShell from '../../../shared/components/ui/UiModalShell.vue'
import { useWorkspaceSpellcheckDictionary } from '../../../domains/editor/composables/useWorkspaceSpellcheckDictionary'

/**
 * WorkspaceSpellcheckDictionaryModal
 *
 * Purpose:
 * - Show and manage the workspace-scoped spellcheck personal dictionary.
 *
 * Boundary:
 * - The shell owns modal visibility and focus restoration.
 * - The modal owns the lightweight add/remove/clear workflow for the current workspace.
 */

const props = defineProps<{
  visible: boolean
  workspacePath: string
  workspaceLabel: string
}>()

const emit = defineEmits<{
  close: []
}>()

const addWordInput = ref('')
const filterQuery = ref('')
const addWordInputRef = ref<{ focus: () => void; select: () => void } | null>(null)

const workspacePathRef = computed(() => props.workspacePath)
const workspaceSpellcheck = useWorkspaceSpellcheckDictionary({ workspacePath: workspacePathRef })

const spellcheckWords = computed(() =>
  [...workspaceSpellcheck.ignoredWords.value].sort((a, b) => a.localeCompare(b))
)

const filteredWords = computed(() => {
  const query = filterQuery.value.trim().toLowerCase()
  if (!query) return spellcheckWords.value
  return spellcheckWords.value.filter((word) => word.includes(query))
})

const wordCount = computed(() => workspaceSpellcheck.ignoredWords.value.length)
const hasWorkspace = computed(() => Boolean(props.workspacePath.trim()))

function focusAddInput() {
  addWordInputRef.value?.focus()
  addWordInputRef.value?.select()
}

function resetForm() {
  addWordInput.value = ''
  filterQuery.value = ''
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    workspaceSpellcheck.syncIgnoredWords()
    resetForm()
    await nextTick()
    focusAddInput()
  },
  { immediate: true }
)

function submitAddWord() {
  if (!hasWorkspace.value) return
  const value = addWordInput.value.trim()
  if (!value) return
  workspaceSpellcheck.addIgnoredWord(value)
  addWordInput.value = ''
  void nextTick(() => focusAddInput())
}

function removeWord(word: string) {
  if (!hasWorkspace.value) return
  workspaceSpellcheck.removeIgnoredWord(word)
}

function clearWords() {
  if (!hasWorkspace.value) return
  workspaceSpellcheck.clearIgnoredWords()
}
</script>

<template>
  <div v-if="visible" data-modal="spellcheck-dictionary">
    <UiModalShell
      :model-value="visible"
      title="Spellcheck Dictionary"
      description="Manage workspace-scoped personal dictionary entries used by the native spellcheck."
      labelledby="spellcheck-dictionary-title"
      describedby="spellcheck-dictionary-description"
      width="lg"
      panel-class="confirm-modal spellcheck-dictionary-modal"
      @close="emit('close')"
    >
      <template #header>
        <span class="spellcheck-dictionary-badge">
          <BookOpenIcon class="spellcheck-dictionary-badge-icon" aria-hidden="true" />
          Workspace scope
        </span>
      </template>

      <section class="spellcheck-dictionary-hero-grid" aria-label="Dictionary summary">
      <article class="spellcheck-dictionary-hero-card">
        <div class="spellcheck-dictionary-hero-top">
          <span class="spellcheck-dictionary-hero-icon" aria-hidden="true">
            <BookOpenIcon />
          </span>
          <p class="spellcheck-dictionary-hero-label">Entries</p>
        </div>
        <div class="spellcheck-dictionary-hero-value">{{ wordCount }}</div>
        <p class="spellcheck-dictionary-hero-detail">
          {{ wordCount > 0 ? 'Added words are ignored for this workspace only.' : 'No workspace words added yet.' }}
        </p>
      </article>

      <article class="spellcheck-dictionary-hero-card">
        <div class="spellcheck-dictionary-hero-top">
          <span class="spellcheck-dictionary-hero-icon" aria-hidden="true">
            <BookOpenIcon />
          </span>
          <p class="spellcheck-dictionary-hero-label">Workspace</p>
        </div>
        <div class="spellcheck-dictionary-hero-value spellcheck-dictionary-hero-value--workspace">
          {{ workspaceLabel || 'No workspace' }}
        </div>
        <p class="spellcheck-dictionary-hero-detail">
          Stored in browser localStorage and shared across this workspace.
        </p>
      </article>
      </section>

      <section class="spellcheck-dictionary-controls">
        <UiField for-id="spellcheck-dictionary-add-input" label="Add word" help="Words are normalized to lowercase before storage.">
          <template #default="{ describedBy, invalid }">
            <div class="spellcheck-dictionary-add-row">
              <UiInput
                id="spellcheck-dictionary-add-input"
                ref="addWordInputRef"
                :model-value="addWordInput"
                size="sm"
                placeholder="orthographe"
                :invalid="invalid"
                :aria-describedby="describedBy"
                @update:model-value="addWordInput = $event"
                @keydown.enter.prevent="submitAddWord()"
              />
              <UiButton size="sm" variant="primary" :disabled="!hasWorkspace" @click="submitAddWord">
                <template #leading>
                  <PlusIcon class="spellcheck-dictionary-button-icon" aria-hidden="true" />
                </template>
                Add
              </UiButton>
            </div>
          </template>
        </UiField>

        <UiField for-id="spellcheck-dictionary-filter-input" label="Filter words" help="Useful when the workspace dictionary gets longer.">
          <template #default="{ describedBy, invalid }">
            <UiInput
              id="spellcheck-dictionary-filter-input"
              :model-value="filterQuery"
              size="sm"
              placeholder="Search words..."
              :invalid="invalid"
              :aria-describedby="describedBy"
              @update:model-value="filterQuery = $event"
            />
          </template>
        </UiField>
      </section>

      <section class="spellcheck-dictionary-list-section" aria-label="Dictionary entries">
        <div class="spellcheck-dictionary-list-head">
          <p class="spellcheck-dictionary-list-title">Words</p>
          <p class="spellcheck-dictionary-list-meta">{{ filteredWords.length }} shown</p>
        </div>

        <p v-if="!hasWorkspace" class="spellcheck-dictionary-empty-state">
          Open a workspace to manage its spellcheck dictionary.
        </p>
        <p v-else-if="!spellcheckWords.length" class="spellcheck-dictionary-empty-state">
          No words have been added yet.
        </p>
        <p v-else-if="!filteredWords.length" class="spellcheck-dictionary-empty-state">
          No words match the current filter.
        </p>
        <div v-else class="spellcheck-dictionary-list" role="list">
          <article v-for="word in filteredWords" :key="word" class="spellcheck-dictionary-row" role="listitem">
            <span class="spellcheck-dictionary-row-word">{{ word }}</span>
            <UiButton
              size="sm"
              variant="ghost"
              class-name="spellcheck-dictionary-row-remove"
              :disabled="!hasWorkspace"
              :aria-label="`Remove ${word}`"
              @click="removeWord(word)"
            >
              <template #leading>
                <XMarkIcon class="spellcheck-dictionary-button-icon" aria-hidden="true" />
              </template>
              Remove
            </UiButton>
          </article>
        </div>
      </section>

      <template #footer>
        <UiButton size="sm" variant="ghost" @click="emit('close')">Close</UiButton>
        <UiButton size="sm" variant="danger" :disabled="!hasWorkspace || !wordCount" @click="clearWords">
          <template #leading>
            <XMarkIcon class="spellcheck-dictionary-button-icon" aria-hidden="true" />
          </template>
          Clear all
        </UiButton>
      </template>
    </UiModalShell>
  </div>
</template>

<style scoped>
.spellcheck-dictionary-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  padding: 0.32rem 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-soft);
  background: color-mix(in srgb, var(--surface-muted) 78%, transparent);
}

.spellcheck-dictionary-badge-icon {
  width: 0.9rem;
  height: 0.9rem;
}

.spellcheck-dictionary-hero-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.spellcheck-dictionary-hero-card {
  min-height: 104px;
  border-radius: 16px;
  padding: 0.8rem 0.9rem 0.85rem;
  display: grid;
  grid-template-rows: auto auto 1fr;
  align-content: start;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--index-card-bg) 92%, white 8%), var(--index-card-bg)),
    var(--index-card-bg);
  border: 1px solid color-mix(in srgb, var(--index-card-border) 72%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent),
    0 10px 24px color-mix(in srgb, #000 4%, transparent);
}

.spellcheck-dictionary-hero-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.spellcheck-dictionary-hero-icon {
  width: 1rem;
  height: 1rem;
  color: var(--text-soft);
  flex: 0 0 auto;
}

.spellcheck-dictionary-hero-label {
  margin: 0;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.075em;
  text-transform: uppercase;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spellcheck-dictionary-hero-value {
  margin-top: 0.65rem;
  font-size: 1.15rem;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text-main);
}

.spellcheck-dictionary-hero-value--workspace {
  font-family: var(--font-code);
  font-size: 0.95rem;
  line-height: 1.3;
  word-break: break-word;
}

.spellcheck-dictionary-hero-detail {
  margin: 0.5rem 0 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--text-dim);
  align-self: end;
}

.spellcheck-dictionary-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.85rem;
}

.spellcheck-dictionary-add-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem;
  align-items: center;
}

.spellcheck-dictionary-button-icon {
  width: 0.85rem;
  height: 0.85rem;
}

.spellcheck-dictionary-list-section {
  padding-top: 0.75rem;
  border-top: 1px solid color-mix(in srgb, var(--panel-border) 54%, transparent);
}

.spellcheck-dictionary-list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.spellcheck-dictionary-list-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-main);
}

.spellcheck-dictionary-list-meta {
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-dim);
}

.spellcheck-dictionary-empty-state {
  margin: 0.85rem 0 0;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.spellcheck-dictionary-list {
  margin-top: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 16rem;
  overflow: auto;
}

.spellcheck-dictionary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0.55rem;
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--surface-muted) 72%, transparent);
}

.spellcheck-dictionary-row-word {
  min-width: 0;
  font-family: var(--font-code);
  font-size: 0.86rem;
  color: var(--text-main);
  word-break: break-word;
}

.spellcheck-dictionary-row-remove {
  white-space: nowrap;
}

@media (max-width: 720px) {
  .spellcheck-dictionary-hero-grid,
  .spellcheck-dictionary-add-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
