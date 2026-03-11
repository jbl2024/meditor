<script setup lang="ts">
import UiButton from '../../../shared/components/ui/UiButton.vue'
import UiModalShell from '../../../shared/components/ui/UiModalShell.vue'

defineProps<{
  visible: boolean
  version: string
}>()

const emit = defineEmits<{
  close: []
}>()

function handleVisibilityChange(value: boolean) {
  if (!value) {
    emit('close')
  }
}
</script>

<template>
  <UiModalShell
    :model-value="visible"
    title="About"
    description="Application identity and current version."
    labelledby="about-title"
    describedby="about-description"
    width="sm"
    panel-class="about-modal"
    @update:model-value="handleVisibilityChange"
    @close="emit('close')"
  >
    <div data-modal="about" class="sr-only" aria-hidden="true"></div>
    <div class="about-card">
      <div class="about-name">Tomosona</div>
      <div class="about-version">v{{ version }}</div>
    </div>
    <template #footer>
      <UiButton size="sm" variant="ghost" @click="emit('close')">Close</UiButton>
    </template>
  </UiModalShell>
</template>

<style scoped>
.about-modal {
  max-width: 26rem;
}

.about-card {
  display: grid;
  gap: 0.35rem;
  padding: 0.25rem 0;
}

.about-name {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--modal-title);
}

.about-version {
  font-family: var(--font-code);
  font-size: 0.875rem;
  color: var(--modal-copy);
}
</style>
