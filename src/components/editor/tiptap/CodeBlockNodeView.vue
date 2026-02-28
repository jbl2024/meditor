<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3'
import { common } from 'lowlight'
import UiFilterableDropdown, { type FilterableDropdownItem } from '../../ui/UiFilterableDropdown.vue'

const WRAP_STORAGE_KEY = 'meditor:editor:code-wrap'
const WRAP_EVENT = 'meditor:code-wrap-changed'

const languages = Object.keys(common).sort()
const LANGUAGE_ALIASES: Record<string, string[]> = {
  javascript: ['js', 'node', 'ecmascript'],
  typescript: ['ts'],
  python: ['py'],
  shell: ['sh', 'zsh'],
  cpp: ['c++'],
  csharp: ['c#', 'cs'],
  yaml: ['yml'],
  markdown: ['md'],
  plaintext: ['plain', 'plain text', 'text', 'txt', 'none']
}

const props = defineProps<{
  node: { textContent?: string; attrs: { language?: string } }
  updateAttributes: (attrs: Record<string, unknown>) => void
}>()

const wrapEnabled = ref(true)
const showLangMenu = ref(false)
const languageQuery = ref('')
const activeLanguageIndex = ref(0)

const currentLanguage = computed(() => props.node.attrs.language ?? '')
const codeClass = computed(() => ({
  hljs: true,
  [`language-${currentLanguage.value}`]: Boolean(currentLanguage.value)
}))
const languageItems = computed<Array<FilterableDropdownItem & { value: string; aliases: string[] }>>(() => {
  const options = new Set<string>(['', ...languages])
  const current = currentLanguage.value.trim()
  if (current) options.add(current)
  return Array.from(options).map((value) => ({
    id: `lang:${value || 'plain-text'}`,
    label: value || 'plain text',
    value,
    aliases: value ? (LANGUAGE_ALIASES[value] ?? []) : ['plaintext', 'plain', 'text', 'txt', 'none']
  }))
})

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

function setLanguage(lang: string) {
  const next = (() => {
    const normalized = lang.trim().toLowerCase()
    if (!normalized) return ''
    if (languages.includes(normalized)) return normalized
    const aliasMatch = Object.entries(LANGUAGE_ALIASES)
      .find(([, aliases]) => aliases.includes(normalized))
    return aliasMatch?.[0] ?? ''
  })()
  props.updateAttributes({ language: next })
}

function onLanguageSelect(item: FilterableDropdownItem) {
  const value = String(item.value ?? '')
  setLanguage(value)
}

function languageMatcher(item: FilterableDropdownItem, query: string): boolean {
  const aliases = Array.isArray(item.aliases) ? item.aliases.map((entry) => String(entry)) : []
  return [String(item.label), ...aliases].some((token) => token.toLowerCase().includes(query))
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
      <UiFilterableDropdown
        class="meditor-code-lang-select"
        :items="languageItems"
        :model-value="showLangMenu"
        :query="languageQuery"
        :active-index="activeLanguageIndex"
        :matcher="languageMatcher"
        filter-placeholder="Filter language..."
        :show-filter="true"
        :max-height="260"
        @open-change="showLangMenu = $event"
        @query-change="languageQuery = $event"
        @active-index-change="activeLanguageIndex = $event"
        @select="onLanguageSelect($event)"
      >
        <template #trigger="{ toggleMenu }">
          <button
            type="button"
            class="meditor-code-lang-btn"
            @click.stop="toggleMenu"
            @mousedown.prevent
          >
            {{ currentLanguage || 'plain text' }}
          </button>
        </template>
        <template #item="{ item, active }">
          <span :class="{ 'meditor-code-lang-active': active, 'meditor-code-lang-selected': currentLanguage === item.value }">
            {{ item.label }}
          </span>
        </template>
      </UiFilterableDropdown>
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

    <pre :class="preClass"><NodeViewContent as="code" :class="codeClass" /></pre>
  </NodeViewWrapper>
</template>

<style scoped>
.meditor-code-node pre,
.meditor-code-node code {
  font-family: var(--font-mono);
}

.meditor-code-node code.hljs {
  color: #0f172a;
}

.meditor-code-node code :deep(.hljs-comment),
.meditor-code-node code :deep(.hljs-quote) {
  color: #64748b;
}

.meditor-code-node code :deep(.hljs-keyword),
.meditor-code-node code :deep(.hljs-selector-tag),
.meditor-code-node code :deep(.hljs-literal),
.meditor-code-node code :deep(.hljs-title) {
  color: #7c3aed;
}

.meditor-code-node code :deep(.hljs-string),
.meditor-code-node code :deep(.hljs-attr) {
  color: #0f766e;
}

.meditor-code-node code :deep(.hljs-number),
.meditor-code-node code :deep(.hljs-built_in),
.meditor-code-node code :deep(.hljs-variable) {
  color: #b45309;
}

.meditor-code-node code :deep(.hljs-function),
.meditor-code-node code :deep(.hljs-class),
.meditor-code-node code :deep(.hljs-type) {
  color: #1d4ed8;
}

.dark .meditor-code-node code.hljs {
  color: #e2e8f0;
}

.dark .meditor-code-node code :deep(.hljs-comment),
.dark .meditor-code-node code :deep(.hljs-quote) {
  color: #94a3b8;
}

.dark .meditor-code-node code :deep(.hljs-keyword),
.dark .meditor-code-node code :deep(.hljs-selector-tag),
.dark .meditor-code-node code :deep(.hljs-literal),
.dark .meditor-code-node code :deep(.hljs-title) {
  color: #c084fc;
}

.dark .meditor-code-node code :deep(.hljs-string),
.dark .meditor-code-node code :deep(.hljs-attr) {
  color: #34d399;
}

.dark .meditor-code-node code :deep(.hljs-number),
.dark .meditor-code-node code :deep(.hljs-built_in),
.dark .meditor-code-node code :deep(.hljs-variable) {
  color: #f59e0b;
}

.dark .meditor-code-node code :deep(.hljs-function),
.dark .meditor-code-node code :deep(.hljs-class),
.dark .meditor-code-node code :deep(.hljs-type) {
  color: #60a5fa;
}

.meditor-code-lang-select {
  position: relative;
}

.meditor-code-lang-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
}

.meditor-code-lang-btn:hover {
  background: var(--color-bg-hover);
}

.meditor-code-lang-select :deep(.ui-filterable-dropdown-menu) {
  min-width: 220px;
  max-width: 280px;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 40;
}

.meditor-code-lang-select :deep(.ui-filterable-dropdown-option) {
  font-size: 12px;
}

.meditor-code-lang-active {
  font-weight: 600;
}

.meditor-code-lang-selected {
  text-decoration: underline;
}
</style>
