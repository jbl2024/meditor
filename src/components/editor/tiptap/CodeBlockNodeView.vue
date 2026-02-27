<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3'

const WRAP_STORAGE_KEY = 'meditor:editor:code-wrap'
const WRAP_EVENT = 'meditor:code-wrap-changed'

const props = defineProps<{
  node: { textContent?: string }
}>()

const wrapEnabled = ref(true)

function syncWrapFromStorage() {
  wrapEnabled.value = window.localStorage.getItem(WRAP_STORAGE_KEY) !== '0'
}

function onWrapChanged(event: Event) {
  const custom = event as CustomEvent<{ enabled?: boolean }>
  const enabled = custom.detail?.enabled
  if (typeof enabled === 'boolean') {
    wrapEnabled.value = enabled
    return
  }
  syncWrapFromStorage()
}

function setWrapEnabled(next: boolean) {
  wrapEnabled.value = next
  window.localStorage.setItem(WRAP_STORAGE_KEY, next ? '1' : '0')
  window.dispatchEvent(new CustomEvent(WRAP_EVENT, { detail: { enabled: next } }))
}

async function copyCode() {
  const value = String(props.node.textContent ?? '')
  await navigator.clipboard.writeText(value)
}

const preClass = computed(() => ({ 'meditor-code-wrap-enabled': wrapEnabled.value }))

onMounted(() => {
  syncWrapFromStorage()
  window.addEventListener(WRAP_EVENT, onWrapChanged as EventListener)
})

onBeforeUnmount(() => {
  window.removeEventListener(WRAP_EVENT, onWrapChanged as EventListener)
})
</script>

<template>
  <NodeViewWrapper class="meditor-code-node">
    <div class="meditor-code-node-actions" contenteditable="false">
      <button
        type="button"
        class="meditor-code-wrap-btn"
        @mousedown.prevent
        @click="setWrapEnabled(!wrapEnabled)"
      >
        {{ wrapEnabled ? 'Unwrap' : 'Wrap' }}
      </button>
      <button
        type="button"
        class="meditor-code-copy-btn"
        @mousedown.prevent
        @click="void copyCode()"
      >
        Copy
      </button>
    </div>

    <pre :class="preClass"><NodeViewContent as="code" /></pre>
  </NodeViewWrapper>
</template>
