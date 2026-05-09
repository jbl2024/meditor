<script setup lang="ts">
import { CalendarDaysIcon } from '@heroicons/vue/24/outline'
import { computed, nextTick, ref, watch } from 'vue'
import UiButton from '../../../shared/components/ui/UiButton.vue'
import UiField from '../../../shared/components/ui/UiField.vue'
import UiFilterableDropdown, { type FilterableDropdownItem } from '../../../shared/components/ui/UiFilterableDropdown.vue'
import UiInput from '../../../shared/components/ui/UiInput.vue'
import UiModalShell from '../../../shared/components/ui/UiModalShell.vue'
import { formatIsoDate } from '../../lib/appShellPaths'
import type { NewNoteTemplateDropdownItem } from '../../lib/newNoteTemplates'

/**
 * Module: WorkspaceEntryModals
 *
 * Purpose:
 * - Render the shell modals used to create files, create folders, open a
 *   specific daily note, and pick a template for new notes.
 */

/** Props required to render the workspace entry modals. */
const props = defineProps<{
  newFileVisible: boolean
  newFilePathInput: string
  newFileError: string
  newFileTemplateItems: NewNoteTemplateDropdownItem[]
  newFileTemplatePath: string
  newFolderVisible: boolean
  newFolderPathInput: string
  newFolderError: string
  openDateVisible: boolean
  openDateInput: string
  openDateError: string
}>()

/** Events emitted by the modals so the parent shell owns validation and actions. */
const emit = defineEmits<{
  closeNewFile: []
  updateNewFilePath: [value: string]
  keydownNewFile: [event: KeyboardEvent]
  selectNewFileTemplate: [value: string]
  submitNewFile: []
  closeNewFolder: []
  updateNewFolderPath: [value: string]
  keydownNewFolder: [event: KeyboardEvent]
  submitNewFolder: []
  closeOpenDate: []
  updateOpenDate: [value: string]
  keydownOpenDate: [event: KeyboardEvent]
  submitOpenDate: []
}>()

const templateMenuOpen = ref(false)
const templateMenuQuery = ref('')
const templateMenuActiveIndex = ref(0)
const notePathInputRef = ref<{ rootEl: HTMLInputElement | null } | null>(null)
const datePrefixShortcutLabel = computed(() => {
  if (typeof navigator === 'undefined') return 'Ctrl+D'
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? 'Cmd+D' : 'Ctrl+D'
})
const todayDatePrefix = computed(() => formatIsoDate(new Date()))

const selectedTemplateLabel = computed(() => {
  if (!props.newFileTemplatePath) return 'Blank note'
  return props.newFileTemplateItems.find((item) => item.path === props.newFileTemplatePath)?.label ?? 'Template unavailable'
})

function withDatePrefix(path: string, date: string): string {
  const lastSlash = path.lastIndexOf('/')
  const directory = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : ''
  const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
  const withoutExistingDate = fileName.replace(/^\d{4}-\d{2}-\d{2}(?:[\s_-]+)?/, '').trimStart()
  return `${directory}${date}${withoutExistingDate ? ` ${withoutExistingDate}` : ''}`
}

async function prefixNewFilePathWithToday() {
  emit('updateNewFilePath', withDatePrefix(props.newFilePathInput, todayDatePrefix.value))
  await nextTick()
  const input = notePathInputRef.value?.rootEl
  if (!input) return
  input.focus()
  const length = input.value.length
  if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(length, length)
  }
}

function onNotePathKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    void prefixNewFilePathWithToday()
    return
  }
  emit('keydownNewFile', event)
}

function syncTemplateMenuState() {
  templateMenuQuery.value = ''
  templateMenuActiveIndex.value = Math.max(
    0,
    props.newFileTemplateItems.findIndex((item) => item.path === props.newFileTemplatePath)
  )
}

function onTemplateOpenChange(value: boolean) {
  templateMenuOpen.value = value
  if (!value) {
    templateMenuQuery.value = ''
    return
  }
  syncTemplateMenuState()
}

function onTemplateSelect(item: FilterableDropdownItem) {
  emit('selectNewFileTemplate', String((item as NewNoteTemplateDropdownItem).path ?? ''))
  void queueMicrotask(() => {
    const input = notePathInputRef.value?.rootEl
    if (!input) return
    input.focus()
    const length = input.value.length
    if (typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(length, length)
    }
  })
}

watch(
  () => props.newFileVisible,
  (visible) => {
    if (!visible) return
    templateMenuOpen.value = false
    templateMenuQuery.value = ''
    templateMenuActiveIndex.value = 0
  }
)

watch(
  () => props.newFileTemplateItems,
  () => {
    if (!templateMenuOpen.value) return
    syncTemplateMenuState()
  }
)

watch(
  () => props.newFileTemplatePath,
  () => {
    if (!templateMenuOpen.value) return
    syncTemplateMenuState()
  }
)
</script>

<template>
  <UiModalShell
    :model-value="newFileVisible"
    title="New Note"
    description="Enter a workspace-relative note path. `.md` is added automatically."
    labelledby="new-file-title"
    describedby="new-file-description"
    width="sm"
    panel-class="confirm-modal"
    @close="emit('closeNewFile')"
  >
    <UiField for-id="new-file-template-trigger" label="Template">
      <template #default>
        <UiFilterableDropdown
          :items="newFileTemplateItems"
          :model-value="templateMenuOpen"
          :query="templateMenuQuery"
          :active-index="templateMenuActiveIndex"
          filter-placeholder="Search templates..."
          :max-height="260"
          menu-mode="portal"
          @open-change="onTemplateOpenChange"
          @query-change="templateMenuQuery = $event"
          @active-index-change="templateMenuActiveIndex = $event"
          @select="onTemplateSelect"
        >
          <template #trigger="{ toggleMenu }">
            <UiButton
              id="new-file-template-trigger"
              type="button"
              variant="secondary"
              size="sm"
              class="new-file-template-trigger"
              @click="toggleMenu"
            >
              <span class="new-file-template-trigger__label">{{ selectedTemplateLabel }}</span>
              <span aria-hidden="true" class="new-file-template-trigger__chevron">▾</span>
            </UiButton>
          </template>
        </UiFilterableDropdown>
      </template>
    </UiField>

    <UiField for-id="new-file-input" label="Note path" :error="newFileError">
      <template #default="{ describedBy, invalid }">
        <div class="new-file-path-row">
          <UiInput
            ref="notePathInputRef"
            id="new-file-input"
            :model-value="newFilePathInput"
            size="sm"
            data-new-file-input="true"
            placeholder="untitled"
            :invalid="invalid"
            :aria-describedby="describedBy"
            @update:model-value="emit('updateNewFilePath', $event)"
            @keydown="onNotePathKeydown"
          />
          <UiButton
            type="button"
            size="sm"
            variant="secondary"
            class="new-file-date-prefix"
            :title="`Prefix with ${todayDatePrefix}`"
            :aria-label="`Prefix note path with ${todayDatePrefix}`"
            @click="prefixNewFilePathWithToday"
          >
            <CalendarDaysIcon aria-hidden="true" />
            <span>Today</span>
            <kbd>{{ datePrefixShortcutLabel }}</kbd>
          </UiButton>
        </div>
      </template>
    </UiField>
    <template #footer>
      <UiButton size="sm" variant="ghost" @click="emit('closeNewFile')">Cancel</UiButton>
      <UiButton size="sm" variant="primary" @click="emit('submitNewFile')">Create</UiButton>
    </template>
  </UiModalShell>

  <UiModalShell
    :model-value="newFolderVisible"
    title="New Folder"
    description="Enter a workspace-relative folder path."
    labelledby="new-folder-title"
    describedby="new-folder-description"
    width="sm"
    panel-class="confirm-modal"
    @close="emit('closeNewFolder')"
  >
    <UiField for-id="new-folder-input" label="Folder path" :error="newFolderError">
      <template #default="{ describedBy, invalid }">
        <UiInput
          id="new-folder-input"
          :model-value="newFolderPathInput"
          size="sm"
          data-new-folder-input="true"
          placeholder="new-folder"
          :invalid="invalid"
          :aria-describedby="describedBy"
          @update:model-value="emit('updateNewFolderPath', $event)"
          @keydown="emit('keydownNewFolder', $event)"
        />
      </template>
    </UiField>
    <template #footer>
      <UiButton size="sm" variant="ghost" @click="emit('closeNewFolder')">Cancel</UiButton>
      <UiButton size="sm" variant="primary" @click="emit('submitNewFolder')">Create</UiButton>
    </template>
  </UiModalShell>

  <UiModalShell
    :model-value="openDateVisible"
    title="Open Specific Date"
    description="Enter a date as `YYYY-MM-DD`."
    labelledby="open-date-title"
    describedby="open-date-description"
    width="sm"
    panel-class="confirm-modal"
    @close="emit('closeOpenDate')"
  >
    <UiField for-id="open-date-input" label="Date" :error="openDateError">
      <template #default="{ describedBy, invalid }">
        <UiInput
          id="open-date-input"
          :model-value="openDateInput"
          size="sm"
          data-open-date-input="true"
          placeholder="2026-02-22"
          :invalid="invalid"
          :aria-describedby="describedBy"
          @update:model-value="emit('updateOpenDate', $event)"
          @keydown="emit('keydownOpenDate', $event)"
        />
      </template>
    </UiField>
    <template #footer>
      <UiButton size="sm" variant="ghost" @click="emit('closeOpenDate')">Cancel</UiButton>
      <UiButton size="sm" variant="primary" @click="emit('submitOpenDate')">Open</UiButton>
    </template>
  </UiModalShell>
</template>

<style scoped>
.new-file-template-trigger {
  width: 100%;
  justify-content: space-between;
}

.new-file-template-trigger__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-file-template-trigger__chevron {
  flex: 0 0 auto;
  margin-left: 0.5rem;
}

.new-file-path-row {
  display: flex;
  gap: 0.5rem;
}

.new-file-path-row :deep(.ui-input) {
  min-width: 0;
}

.new-file-date-prefix {
  flex: 0 0 auto;
  gap: 0.4rem;
  padding-inline: 0.65rem;
}

.new-file-date-prefix :deep(svg) {
  width: 1rem;
  height: 1rem;
}

.new-file-date-prefix kbd {
  border: 1px solid var(--shortcuts-keys-border);
  border-radius: 0.25rem;
  background: var(--shortcuts-keys-bg);
  color: var(--shortcuts-keys-text);
  font-family: var(--font-code);
  font-size: 0.65rem;
  font-weight: 600;
  line-height: 1;
  padding: 0.16rem 0.28rem;
}

@media (max-width: 520px) {
  .new-file-path-row {
    flex-direction: column;
  }

  .new-file-date-prefix {
    width: 100%;
    justify-content: center;
  }
}
</style>
