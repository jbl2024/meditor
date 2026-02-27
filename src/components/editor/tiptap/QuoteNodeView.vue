<script setup lang="ts">
import { computed } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'

const props = defineProps<{
  node: { attrs: { text?: string } }
  updateAttributes: (attrs: Record<string, unknown>) => void
  editor: { isEditable: boolean }
}>()

const text = computed(() => String(props.node.attrs.text ?? ''))

function onInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement | null)?.value ?? ''
  props.updateAttributes({ text: value })
}
</script>

<template>
  <NodeViewWrapper class="meditor-quote is-editing">
    <div class="meditor-quote-preview">
      <blockquote class="meditor-quote-preview-content">
        <p class="meditor-quote-paragraph" v-for="(line, idx) in text.split('\n')" :key="idx">{{ line }}</p>
      </blockquote>
    </div>
    <textarea
      class="meditor-quote-source"
      :value="text"
      :readonly="!editor.isEditable"
      spellcheck="false"
      placeholder="Quote text"
      @input="onInput"
    />
  </NodeViewWrapper>
</template>
