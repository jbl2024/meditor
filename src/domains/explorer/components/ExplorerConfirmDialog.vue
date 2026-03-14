<script setup lang="ts">
import UiButton from '../../../shared/components/ui/UiButton.vue'

defineProps<{
  title: string
  detail: string
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()
</script>

<template>
  <div class="explorer-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
    <div class="explorer-modal w-full max-w-sm rounded-2xl border p-4">
      <h3 class="explorer-modal-title text-sm font-semibold">{{ title }}</h3>
      <p class="explorer-modal-copy mt-1 text-xs">{{ detail }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <UiButton size="sm" variant="ghost" @click="emit('cancel')">Cancel</UiButton>
        <UiButton size="sm" variant="primary" @click="emit('confirm')">Confirm</UiButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.explorer-modal-backdrop {
  background: var(--menu-backdrop);
}

.explorer-modal {
  border-color: var(--panel-border);
  background: var(--surface-bg);
  box-shadow: var(--menu-shadow);
}

.explorer-modal-title {
  color: var(--text-main);
}

.explorer-modal-copy {
  color: var(--text-dim);
}
</style>
