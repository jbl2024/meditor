<script setup lang="ts">
import { computed } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { CANONICAL_CALLOUT_KINDS, calloutKindLabel, normalizeCalloutKind } from '../../../lib/callouts'

const props = defineProps<{
  node: { attrs: { kind?: string; message?: string } }
  updateAttributes: (attrs: Record<string, unknown>) => void
  editor: { isEditable: boolean }
}>()

const kind = computed(() => normalizeCalloutKind(props.node.attrs.kind))
const message = computed(() => String(props.node.attrs.message ?? ''))

function onKindChange(event: Event) {
  const value = (event.target as HTMLSelectElement | null)?.value ?? 'NOTE'
  props.updateAttributes({ kind: normalizeCalloutKind(value) })
}

function onMessageInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement | null)?.value ?? ''
  props.updateAttributes({ message: value })
}
</script>

<template>
  <NodeViewWrapper class="meditor-callout" :data-callout-kind="kind.toLowerCase()">
    <div class="meditor-callout-header">
      <div class="meditor-callout-title">
        <span class="meditor-callout-label">{{ calloutKindLabel(kind) }}</span>
      </div>
      <select
        v-if="editor.isEditable"
        class="meditor-callout-kind"
        :value="kind"
        @change="onKindChange"
      >
        <option v-for="item in CANONICAL_CALLOUT_KINDS" :key="item" :value="item">{{ item }}</option>
      </select>
    </div>
    <textarea
      class="meditor-quote-source meditor-callout-message"
      :value="message"
      :readonly="!editor.isEditable"
      spellcheck="false"
      placeholder="Callout text"
      @input="onMessageInput"
    />
  </NodeViewWrapper>
</template>
