<script setup lang="ts">
export type MenuAction =
  | 'open'
  | 'open-external'
  | 'reveal'
  | 'rename'
  | 'delete'
  | 'duplicate'
  | 'new-file'
  | 'new-folder'
  | 'cut'
  | 'copy'
  | 'paste'

const props = defineProps<{
  x: number
  y: number
  canOpen: boolean
  canPaste: boolean
  canRename: boolean
  canDelete: boolean
}>()

const emit = defineEmits<{
  action: [action: MenuAction]
}>()

const items: Array<{ id: MenuAction; label: string; enabled?: boolean }> = [
  { id: 'open', label: 'Open' },
  { id: 'open-external', label: 'Open externally' },
  { id: 'reveal', label: 'Reveal in file manager' },
  { id: 'rename', label: 'Rename' },
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'delete', label: 'Delete' },
  { id: 'new-file', label: 'New file' },
  { id: 'new-folder', label: 'New folder' },
  { id: 'cut', label: 'Cut' },
  { id: 'copy', label: 'Copy' },
  { id: 'paste', label: 'Paste' }
]

function isDisabled(id: MenuAction): boolean {
  if (id === 'open' || id === 'open-external' || id === 'reveal') return !props.canOpen
  if (id === 'rename') return !props.canRename
  if (id === 'delete') return !props.canDelete
  if (id === 'paste') return !props.canPaste
  return false
}

function onAction(id: MenuAction) {
  if (isDisabled(id)) return
  emit('action', id)
}
</script>

<template>
  <div
    class="fixed z-50 min-w-[230px] rounded-xl border border-slate-300/90 bg-white p-1 shadow-xl dark:border-slate-700/80 dark:bg-slate-900"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @click.stop
  >
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="w-full rounded-lg px-3 py-2 text-left text-xs"
      :class="isDisabled(item.id) ? 'cursor-not-allowed opacity-45' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
      :disabled="isDisabled(item.id)"
      @click="onAction(item.id)"
    >
      {{ item.label }}
    </button>
  </div>
</template>
