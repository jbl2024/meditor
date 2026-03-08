<script setup lang="ts">
import UiButton from '../../../shared/components/ui/UiButton.vue'
import UiField from '../../../shared/components/ui/UiField.vue'
import UiInput from '../../../shared/components/ui/UiInput.vue'
import UiModalShell from '../../../shared/components/ui/UiModalShell.vue'

/**
 * Module: WorkspaceEntryModals
 *
 * Purpose:
 * - Render the shell modals used to create files, create folders, and open a
 *   specific daily note.
 */

/** Props required to render the workspace entry modals. */
defineProps<{
  newFileVisible: boolean
  newFilePathInput: string
  newFileError: string
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
    <UiField for-id="new-file-input" label="Note path" :error="newFileError">
      <template #default="{ describedBy, invalid }">
        <UiInput
          id="new-file-input"
          :model-value="newFilePathInput"
          size="sm"
          data-new-file-input="true"
          placeholder="untitled"
          :invalid="invalid"
          :aria-describedby="describedBy"
          @update:model-value="emit('updateNewFilePath', $event)"
          @keydown="emit('keydownNewFile', $event)"
        />
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
