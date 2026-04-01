<script setup lang="ts">
import { ArrowTopRightOnSquareIcon } from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import { readPdfDataUrl } from '../../../shared/api/workspaceApi'
import UiButton from '../../../shared/components/ui/UiButton.vue'

const props = defineProps<{
  path: string
  openExternally?: () => Promise<void> | void
}>()

const fileName = computed(() => {
  const normalized = props.path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || props.path
})

const fileExtension = computed(() => {
  const match = /\.([^.\\/]+)$/.exec(fileName.value)
  return match?.[1]?.toLowerCase() ?? ''
})

const isPdfPreview = computed(() => fileExtension.value === 'pdf')
const pdfPreviewSrc = ref('')
const pdfPreviewLoading = ref(false)
const pdfPreviewError = ref('')

function openNative() {
  void props.openExternally?.()
}

async function loadPdfPreview(path: string) {
  if (!path || !isPdfPreview.value) {
    pdfPreviewSrc.value = ''
    pdfPreviewError.value = ''
    pdfPreviewLoading.value = false
    return
  }

  pdfPreviewLoading.value = true
  pdfPreviewError.value = ''
  try {
    pdfPreviewSrc.value = await readPdfDataUrl(path)
  } catch {
    pdfPreviewSrc.value = ''
    pdfPreviewError.value = 'Could not load PDF preview.'
  } finally {
    pdfPreviewLoading.value = false
  }
}

watch(
  () => props.path,
  (path) => {
    void loadPdfPreview(path)
  },
  { immediate: true }
)
</script>

<template>
  <section class="file-inspector">
    <header class="file-inspector-toolbar" aria-label="File toolbar">
      <div class="file-inspector-actions" role="toolbar" aria-label="File actions">
        <UiButton
          size="sm"
          variant="secondary"
          :disabled="!openExternally"
          @click="openNative"
        >
          <ArrowTopRightOnSquareIcon class="file-inspector-action-icon" />
          Open natively
        </UiButton>
      </div>
    </header>

    <div class="file-inspector-preview-panel">
      <div v-if="pdfPreviewLoading" class="file-inspector-preview-status">Loading PDF preview...</div>
      <div v-else-if="pdfPreviewError" class="file-inspector-preview-status file-inspector-preview-status--error">
        {{ pdfPreviewError }}
      </div>
      <iframe
        v-else-if="isPdfPreview && pdfPreviewSrc"
        class="file-inspector-preview-frame"
        :src="pdfPreviewSrc"
        :title="`Preview for ${fileName}`"
      />
      <div v-else class="file-inspector-preview-stage">
        <div class="file-inspector-preview-emblem">{{ fileExtension || 'file' }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.file-inspector {
  height: 100%;
  padding: 0.25rem 0.35rem 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  overflow: auto;
  background: var(--surface-bg);
}

.file-inspector-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0;
}

.file-inspector-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
}

.file-inspector-action-icon {
  width: 0.95rem;
  height: 0.95rem;
}

.file-inspector-preview-panel {
  display: grid;
  min-height: 0;
  flex: 1;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.file-inspector-preview-status {
  padding: 0.8rem 0.95rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-soft);
  font-size: 0.88rem;
}

.file-inspector-preview-status--error {
  color: var(--danger, #b54747);
}

.file-inspector-preview-frame {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
  background: var(--surface-bg);
}

@media (max-width: 900px) {
  .file-inspector-toolbar {
    justify-content: flex-end;
  }

  .file-inspector-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
