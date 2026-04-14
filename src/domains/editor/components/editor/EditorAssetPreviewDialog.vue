<script setup lang="ts">
import UiModalShell from '../../../../shared/components/ui/UiModalShell.vue'

const props = defineProps<{
  visible: boolean
  src: string
  alt: string
  title: string
  previewSrc: string | null
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <UiModalShell
    :model-value="visible"
    title="Asset preview"
    description="Preview the asset at full size."
    width="xl"
    panel-class="editor-asset-preview-panel"
    @close="emit('close')"
  >
    <div class="editor-asset-preview">
      <img
        v-if="previewSrc"
        class="editor-asset-preview-image"
        :src="previewSrc"
        :alt="alt || 'Asset preview'"
        :title="title || alt || undefined"
      >
      <div v-else class="editor-asset-preview-placeholder">
        <strong>Preview unavailable</strong>
        <span>{{ src || 'Image path required' }}</span>
      </div>
      <dl class="editor-asset-preview-meta">
        <div class="editor-asset-preview-meta-row">
          <dt>Src</dt>
          <dd>{{ src || 'Empty' }}</dd>
        </div>
        <div class="editor-asset-preview-meta-row">
          <dt>Alt</dt>
          <dd>{{ alt || 'Empty' }}</dd>
        </div>
        <div class="editor-asset-preview-meta-row">
          <dt>Title</dt>
          <dd>{{ title || 'Empty' }}</dd>
        </div>
      </dl>
    </div>
    <template #footer>
      <button
        type="button"
        class="editor-asset-preview-btn editor-asset-preview-btn--primary"
        @click="emit('close')"
      >
        Close
      </button>
    </template>
  </UiModalShell>
</template>

<style scoped>
.editor-asset-preview {
  display: grid;
  gap: 0.875rem;
}

.editor-asset-preview-image {
  display: block;
  width: 100%;
  max-height: 72vh;
  object-fit: contain;
  background: var(--surface-bg);
  border: 1px solid var(--modal-panel-border);
  border-radius: 0.75rem;
}

.editor-asset-preview-placeholder {
  align-items: center;
  border: 1px dashed var(--modal-panel-border);
  border-radius: 0.75rem;
  color: var(--modal-copy);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  justify-content: center;
  min-height: 24rem;
  padding: 1.5rem;
  text-align: center;
}

.editor-asset-preview-meta {
  display: grid;
  gap: 0.5rem;
  margin: 0;
}

.editor-asset-preview-meta-row {
  display: grid;
  gap: 0.15rem;
}

.editor-asset-preview-meta dt {
  color: var(--modal-copy);
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
}

.editor-asset-preview-meta dd {
  margin: 0;
  word-break: break-word;
}

.editor-asset-preview-btn {
  background: transparent;
  border: 1px solid var(--button-ghost-border);
  border-radius: 6px;
  color: var(--button-ghost-text);
  cursor: pointer;
  font-size: 13px;
  padding: 8px 12px;
}

.editor-asset-preview-btn:hover {
  background: var(--menu-hover-bg);
  color: var(--menu-text-strong);
}

.editor-asset-preview-btn--primary {
  border-color: var(--button-primary-border);
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
}

.editor-asset-preview-btn--primary:hover {
  background: var(--button-primary-hover);
  color: var(--button-primary-text);
}
</style>
