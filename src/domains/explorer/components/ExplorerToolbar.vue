<script setup lang="ts">
import {
  ArrowPathIcon,
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
  DocumentPlusIcon,
  FolderPlusIcon,
  MagnifyingGlassIcon
} from '@heroicons/vue/24/outline'

defineProps<{
  disabled: boolean
  searchOpen?: boolean
}>()

const emit = defineEmits<{
  createFile: []
  createFolder: []
  expandAll: []
  collapseAll: []
  refresh: []
  toggleSearch: []
}>()
</script>

<template>
  <div class="explorer-toolbar flex flex-wrap items-center gap-1 border-b pb-1">
    <button
      type="button"
      class="explorer-toolbar-btn inline-flex h-6.5 w-6.5 items-center justify-center rounded-md border border-transparent transition disabled:opacity-40 disabled:hover:bg-transparent"
      title="New note"
      aria-label="New note"
      :disabled="disabled"
      @click="emit('createFile')"
    >
      <DocumentPlusIcon class="h-4 w-4" />
    </button>
    <button
      type="button"
      class="explorer-toolbar-btn inline-flex h-6.5 w-6.5 items-center justify-center rounded-md border border-transparent transition disabled:opacity-40 disabled:hover:bg-transparent"
      title="New folder"
      aria-label="New folder"
      :disabled="disabled"
      @click="emit('createFolder')"
    >
      <FolderPlusIcon class="h-4 w-4" />
    </button>
    <button
      type="button"
      class="explorer-toolbar-btn inline-flex h-6.5 w-6.5 items-center justify-center rounded-md border border-transparent transition disabled:opacity-40 disabled:hover:bg-transparent"
      title="Expand all folders"
      aria-label="Expand all folders"
      :disabled="disabled"
      @click="emit('expandAll')"
    >
      <ChevronDoubleDownIcon class="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      class="explorer-toolbar-btn inline-flex h-6.5 w-6.5 items-center justify-center rounded-md border border-transparent transition disabled:opacity-40 disabled:hover:bg-transparent"
      title="Collapse all folders"
      aria-label="Collapse all folders"
      :disabled="disabled"
      @click="emit('collapseAll')"
    >
      <ChevronDoubleUpIcon class="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      class="explorer-toolbar-btn inline-flex h-6.5 w-6.5 items-center justify-center rounded-md border border-transparent transition disabled:opacity-40 disabled:hover:bg-transparent"
      title="Refresh explorer"
      aria-label="Refresh explorer"
      :disabled="disabled"
      @click="emit('refresh')"
    >
      <ArrowPathIcon class="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      class="explorer-toolbar-btn inline-flex h-6.5 w-6.5 items-center justify-center rounded-md border border-transparent transition disabled:opacity-40 disabled:hover:bg-transparent"
      :class="{ 'explorer-toolbar-btn--active': searchOpen }"
      title="Toggle filter"
      aria-label="Toggle filter"
      :disabled="disabled"
      @click="emit('toggleSearch')"
    >
      <MagnifyingGlassIcon class="h-3.5 w-3.5" />
    </button>
  </div>
</template>

<style scoped>
.explorer-toolbar {
  border-color: color-mix(in srgb, var(--border-strong) 72%, transparent);
}

.explorer-toolbar-btn {
  color: var(--text-soft);
}

.explorer-toolbar-btn:hover:not(:disabled) {
  background: var(--explorer-toolbar-hover-bg);
  color: var(--menu-text-strong);
}

.explorer-toolbar-btn--active {
  background: var(--explorer-toolbar-hover-bg);
  color: var(--menu-text-strong);
}
</style>
