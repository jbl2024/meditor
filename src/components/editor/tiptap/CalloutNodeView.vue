<script setup lang="ts">
import { computed, ref } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import UiFilterableDropdown, { type FilterableDropdownItem } from '../../ui/UiFilterableDropdown.vue'
import { CANONICAL_CALLOUT_KINDS, calloutKindLabel, normalizeCalloutKind } from '../../../lib/callouts'

const props = defineProps<{
  node: { attrs: { kind?: string; message?: string } }
  updateAttributes: (attrs: Record<string, unknown>) => void
  editor: { isEditable: boolean }
}>()

const kind = computed(() => normalizeCalloutKind(props.node.attrs.kind))
const message = computed(() => String(props.node.attrs.message ?? ''))
const showKindMenu = ref(false)
const kindQuery = ref('')
const activeKindIndex = ref(0)
const kindItems = computed<Array<FilterableDropdownItem & { value: string; aliases: string[] }>>(() =>
  CANONICAL_CALLOUT_KINDS.map((item) => ({
    id: `callout-kind:${item}`,
    label: calloutKindLabel(item),
    value: item,
    aliases: [item.toLowerCase(), calloutKindLabel(item).toLowerCase()]
  }))
)

function kindMatcher(item: FilterableDropdownItem, query: string): boolean {
  const aliases = Array.isArray(item.aliases) ? item.aliases.map((entry) => String(entry)) : []
  return [String(item.label), ...aliases].some((token) => token.toLowerCase().includes(query))
}

function onKindSelect(item: FilterableDropdownItem) {
  const next = normalizeCalloutKind(String(item.value ?? 'NOTE'))
  props.updateAttributes({ kind: next })
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
      <UiFilterableDropdown
        v-if="editor.isEditable"
        class="meditor-callout-kind-select"
        :items="kindItems"
        :model-value="showKindMenu"
        :query="kindQuery"
        :active-index="activeKindIndex"
        :matcher="kindMatcher"
        filter-placeholder="Filter callout kind..."
        :show-filter="true"
        :max-height="220"
        @open-change="showKindMenu = $event"
        @query-change="kindQuery = $event"
        @active-index-change="activeKindIndex = $event"
        @select="onKindSelect($event)"
      >
        <template #trigger="{ toggleMenu }">
          <button
            type="button"
            class="meditor-callout-kind"
            @mousedown.prevent
            @click.stop="toggleMenu"
          >
            {{ kind }}
          </button>
        </template>
        <template #item="{ item, active }">
          <span :class="{ 'meditor-callout-kind-active': active, 'meditor-callout-kind-selected': item.value === kind }">
            {{ item.label }}
          </span>
        </template>
      </UiFilterableDropdown>
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

<style scoped>
.meditor-callout-kind-select {
  position: relative;
}

.meditor-callout-kind-select :deep(.ui-filterable-dropdown-menu) {
  min-width: 240px;
  max-width: 300px;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 40;
}

.meditor-callout-kind-active {
  font-weight: 600;
}

.meditor-callout-kind-selected {
  text-decoration: underline;
}
</style>
