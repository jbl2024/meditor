<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiButton from '../../../shared/components/ui/UiButton.vue'
import UiModalShell from '../../../shared/components/ui/UiModalShell.vue'
import { openAppSupportDir, openExternalWebUrl, readAboutMetadata } from '../../../shared/api/appApi'
import type { AboutMetadata } from '../../../shared/api/apiTypes'

const props = defineProps<{
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

const metadata = ref<AboutMetadata | null>(null)
const metadataLoading = ref(false)
const metadataError = ref('')
const supportDirOpening = ref(false)

const displayVersion = computed(() => metadata.value?.version ?? props.version)

const aboutLinks = [
  { label: 'Changelog', url: 'https://github.com/jbl2024/tomosona/blob/main/CHANGELOG.md' },
  { label: 'Report a bug', url: 'https://github.com/jbl2024/tomosona/issues' },
  { label: 'Repository', url: 'https://github.com/jbl2024/tomosona' },
  { label: 'License', url: 'https://github.com/jbl2024/tomosona/blob/main/LICENSE' }
] as const

async function ensureMetadataLoaded() {
  if (metadataLoading.value || metadata.value) return
  metadataLoading.value = true
  metadataError.value = ''
  try {
    metadata.value = await readAboutMetadata()
  } catch {
    metadataError.value = 'Unable to load support details.'
  } finally {
    metadataLoading.value = false
  }
}

async function handleOpenSupportDir() {
  supportDirOpening.value = true
  metadataError.value = ''
  try {
    await openAppSupportDir()
  } catch {
    metadataError.value = 'Unable to open the application data folder.'
  } finally {
    supportDirOpening.value = false
  }
}

async function handleOpenExternalUrl(url: string) {
  metadataError.value = ''
  try {
    await openExternalWebUrl(url)
  } catch {
    metadataError.value = 'Unable to open that link.'
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void ensureMetadataLoaded()
    }
  },
  { immediate: true }
)
</script>

<template>
  <UiModalShell
    :model-value="visible"
    title="About"
    description="Application identity, version, and support details."
    labelledby="about-title"
    describedby="about-description"
    width="md"
    panel-class="about-modal"
    @update:model-value="handleVisibilityChange"
    @close="emit('close')"
  >
    <div data-modal="about" class="sr-only" aria-hidden="true"></div>
    <div class="about-card">
      <div class="about-name">Tomosona</div>
      <div class="about-version">v{{ displayVersion }}</div>
      <div class="about-tagline">Local-first markdown editor</div>
    </div>
    <div v-if="metadata" class="about-grid" aria-label="Support details">
      <div class="about-row">
        <span class="about-label">Build</span>
        <span class="about-value">{{ metadata.build_commit ? `${metadata.build_commit} (${metadata.build_channel})` : metadata.build_channel }}</span>
      </div>
      <div class="about-row">
        <span class="about-label">Platform</span>
        <span class="about-value">{{ metadata.platform_label }}</span>
      </div>
      <div class="about-row" v-if="metadata.tauri_version">
        <span class="about-label">Tauri</span>
        <span class="about-value">{{ metadata.tauri_version }}</span>
      </div>
      <div class="about-row about-row--stack">
        <span class="about-label">Data folder</span>
        <code class="about-path">{{ metadata.app_support_dir }}</code>
      </div>
    </div>
    <p v-else-if="metadataLoading" class="about-status">Loading support details...</p>
    <p v-if="metadataError" class="about-error" role="status">{{ metadataError }}</p>
    <div class="about-primary-actions">
      <UiButton
        size="sm"
        variant="secondary"
        class-name="about-primary-button"
        :loading="supportDirOpening"
        @click="void handleOpenSupportDir()"
      >
        Open Data Folder
      </UiButton>
    </div>
    <div class="about-link-grid">
      <UiButton
        v-for="link in aboutLinks"
        :key="link.label"
        size="sm"
        variant="ghost"
        class-name="about-link-button"
        @click="void handleOpenExternalUrl(link.url)"
      >
        {{ link.label }}
      </UiButton>
    </div>
    <p class="about-meta">Copyright (c) 2026 Jérôme Blondon</p>
    <p class="about-meta">Built for local-first note taking and knowledge work.</p>
    <p class="about-meta about-meta--muted">Support requests are easier with the build, platform, and data-folder details above.</p>
    <div v-if="!metadata && !metadataLoading" class="about-spacer"></div>
    <template #footer>
      <UiButton size="sm" variant="ghost" @click="emit('close')">Close</UiButton>
    </template>
  </UiModalShell>
</template>

<style scoped>
.about-modal {
  max-width: 36rem;
}

.about-card {
  display: grid;
  gap: 0.35rem;
  padding: 0.25rem 0 0.5rem;
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

.about-tagline {
  font-size: 0.875rem;
  color: var(--modal-copy);
}

.about-grid {
  display: grid;
  gap: 0.625rem;
  padding: 0.25rem 0 0.75rem;
}

.about-row {
  display: grid;
  grid-template-columns: minmax(5.5rem, auto) 1fr;
  gap: 0.75rem;
  align-items: start;
}

.about-row--stack {
  grid-template-columns: 1fr;
  gap: 0.35rem;
}

.about-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--modal-copy);
}

.about-value {
  font-size: 0.875rem;
  color: var(--modal-title);
}

.about-path {
  display: block;
  overflow-wrap: anywhere;
  font-family: var(--font-code);
  font-size: 0.8rem;
  color: var(--modal-title);
}

.about-primary-actions {
  display: flex;
  padding: 0.25rem 0 0.5rem;
}

.about-link-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  padding: 0 0 0.75rem;
}

.about-primary-button {
  justify-content: center;
  min-width: 11rem;
}

.about-link-button {
  justify-content: flex-start;
  white-space: nowrap;
  border-color: var(--modal-panel-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-muted) 72%, transparent);
}

.about-link-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--surface-muted) 92%, transparent);
}

.about-status,
.about-meta {
  margin: 0;
  font-size: 0.8rem;
  color: var(--modal-copy);
}

.about-meta--muted {
  opacity: 0.8;
}

.about-error {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  color: var(--field-error-text);
}

.about-spacer {
  height: 0.25rem;
}

@media (max-width: 560px) {
  .about-link-grid {
    grid-template-columns: 1fr;
  }
}
</style>
