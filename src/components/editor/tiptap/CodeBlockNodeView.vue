<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3'
import { common } from 'lowlight'

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
const languageQueryInput = ref<HTMLInputElement | null>(null)
const languageListRef = ref<HTMLElement | null>(null)
const activeLanguageIndex = ref(0)

const currentLanguage = computed(() => props.node.attrs.language ?? '')
const codeClass = computed(() => ({
  hljs: true,
  [`language-${currentLanguage.value}`]: Boolean(currentLanguage.value)
}))
const languageOptions = computed(() => {
  const options = new Set<string>(['', ...languages])
  const current = currentLanguage.value.trim()
  if (current) options.add(current)
  return Array.from(options)
})
const languageSearchTokens = computed(() =>
  new Map(
    languageOptions.value.map((lang) => {
      const label = lang || 'plain text'
      const aliases = lang ? (LANGUAGE_ALIASES[lang] ?? []) : ['plaintext', 'plain', 'text', 'txt', 'none']
      const tokens = [label.toLowerCase(), ...aliases.map((token) => token.toLowerCase())]
      return [lang, tokens] as const
    })
  )
)
const filteredLanguageOptions = computed(() => {
  const query = languageQuery.value.trim().toLowerCase()
  if (!query) return languageOptions.value
  return languageOptions.value.filter((lang) => {
    const tokens = languageSearchTokens.value.get(lang) ?? []
    return tokens.some((token) => token.includes(query))
  })
})
const highlightedLanguage = computed(() => filteredLanguageOptions.value[activeLanguageIndex.value] ?? '')

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
  showLangMenu.value = false
  languageQuery.value = ''
}

function closeLanguageMenu() {
  showLangMenu.value = false
  languageQuery.value = ''
}

function selectHighlightedLanguage() {
  if (!filteredLanguageOptions.value.length) return
  setLanguage(highlightedLanguage.value)
}

function onLanguageFilterKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    if (!filteredLanguageOptions.value.length) return
    activeLanguageIndex.value = (activeLanguageIndex.value + 1) % filteredLanguageOptions.value.length
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    if (!filteredLanguageOptions.value.length) return
    activeLanguageIndex.value = activeLanguageIndex.value <= 0
      ? filteredLanguageOptions.value.length - 1
      : activeLanguageIndex.value - 1
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    selectHighlightedLanguage()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeLanguageMenu()
  }
}

function toggleLanguageMenu() {
  showLangMenu.value = !showLangMenu.value
  if (!showLangMenu.value) {
    languageQuery.value = ''
    activeLanguageIndex.value = 0
    return
  }
  languageQuery.value = ''
  activeLanguageIndex.value = 0
  void nextTick(() => {
    languageQueryInput.value?.focus()
    languageQueryInput.value?.select()
  })
}

async function copyCode() {
  const value = String(props.node.textContent ?? '')
  await navigator.clipboard.writeText(value)
}

const preClass = computed(() => ({ 'meditor-code-wrap-enabled': wrapEnabled.value }))

function closeLangMenu(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.meditor-code-lang-select')) {
    closeLanguageMenu()
  }
}

watch(filteredLanguageOptions, (options) => {
  if (!options.length) {
    activeLanguageIndex.value = 0
    return
  }
  if (activeLanguageIndex.value >= options.length) {
    activeLanguageIndex.value = options.length - 1
  }
  if (activeLanguageIndex.value < 0) {
    activeLanguageIndex.value = 0
  }
}, { immediate: true })

watch(languageQuery, () => {
  activeLanguageIndex.value = 0
})

watch(activeLanguageIndex, () => {
  if (!showLangMenu.value) return
  void nextTick(() => {
    const active = languageListRef.value?.querySelector('button.highlighted')
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: 'nearest' })
    }
  })
})

onMounted(() => {
  syncWrapFromStorage()
  window.addEventListener(WRAP_EVENT, onWrapChanged as EventListener)
  document.addEventListener('click', closeLangMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener(WRAP_EVENT, onWrapChanged as EventListener)
  document.removeEventListener('click', closeLangMenu)
})
</script>

<template>
  <NodeViewWrapper class="meditor-code-node">
    <div class="meditor-code-node-actions" contenteditable="false">
      <div class="meditor-code-lang-select">
        <button
          type="button"
          class="meditor-code-lang-btn"
          @click.stop="toggleLanguageMenu"
          @mousedown.prevent
        >
          {{ currentLanguage || 'plain text' }}
        </button>
        <div v-if="showLangMenu" class="meditor-code-lang-menu" @mousedown.stop>
          <div class="meditor-code-lang-filter">
            <input
              ref="languageQueryInput"
              v-model="languageQuery"
              type="text"
              placeholder="Filter language..."
              class="meditor-code-lang-filter-input"
              @keydown="onLanguageFilterKeydown"
            />
          </div>
          <div ref="languageListRef" class="meditor-code-lang-list">
            <button
              v-for="lang in filteredLanguageOptions"
              :key="lang"
              type="button"
              :class="{ active: currentLanguage === lang, highlighted: highlightedLanguage === lang }"
              @click="setLanguage(lang)"
            >
              {{ lang || 'plain text' }}
            </button>
            <div v-if="!filteredLanguageOptions.length" class="meditor-code-lang-empty">
              No matching language
            </div>
          </div>
        </div>
      </div>
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

.meditor-code-lang-menu {
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 10px;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.2);
  display: flex;
  flex-direction: column;
  min-width: 220px;
  max-width: 280px;
  max-height: 260px;
  overflow: hidden;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 40;
}

.meditor-code-lang-filter {
  border-bottom: 1px solid var(--color-border, #d1d5db);
  padding: 8px;
}

.meditor-code-lang-filter-input {
  width: 100%;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 8px;
  color: var(--color-text, #0f172a);
  font-size: 12px;
  line-height: 1.2;
  padding: 7px 10px;
}

.meditor-code-lang-filter-input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.16);
}

.meditor-code-lang-list {
  overflow-y: auto;
}

.meditor-code-lang-menu button {
  background: transparent;
  border: none;
  color: var(--color-text, #0f172a);
  cursor: pointer;
  display: block;
  font-size: 12px;
  line-height: 1.25;
  padding: 8px 12px;
  text-align: left;
  white-space: nowrap;
  width: 100%;
}

.meditor-code-lang-menu button:hover {
  background: rgba(37, 99, 235, 0.08);
}

.meditor-code-lang-menu button.highlighted {
  background: rgba(37, 99, 235, 0.12);
}

.meditor-code-lang-menu button.active {
  background: #2563eb;
  color: white;
}

.meditor-code-lang-empty {
  color: var(--color-text-muted, #6b7280);
  font-size: 12px;
  padding: 10px 12px;
}
</style>
