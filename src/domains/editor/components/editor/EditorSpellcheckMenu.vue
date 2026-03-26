<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue'
import UiFilterableDropdown, { type FilterableDropdownItem } from '../../../../shared/components/ui/UiFilterableDropdown.vue'
import UiMenu from '../../../../shared/components/ui/UiMenu.vue'
import {
  rankSpellcheckSuggestions,
  type SpellcheckSuggestionRank
} from '../../lib/tiptap/extensions/Spellcheck'

const props = defineProps<{
  open: boolean
  left: number
  top: number
  mode: 'single' | 'list'
  word: string
  primarySuggestion: string
  suggestions: string[]
  loading: boolean
}>()

const emit = defineEmits<{
  select: [suggestion: string]
  ignore: []
  'add-to-dictionary': []
  close: []
  'menu-el': [element: HTMLDivElement | null]
}>()

const rootEl = ref<HTMLDivElement | null>(null)
const dropdownRef = ref<{ menuEl: HTMLDivElement | null } | null>(null)
const listActiveIndex = ref(0)
const spellcheckFilterQuery = ref('')
let suppressNextClick = false

const rankedSuggestions = computed<SpellcheckSuggestionRank[]>(() =>
  rankSpellcheckSuggestions(props.word, props.suggestions)
)

const dropdownItems = computed<Array<FilterableDropdownItem>>(() =>
  rankedSuggestions.value.map((item, index) => ({
    id: `${item.suggestion}:${index}`,
    label: item.suggestion
  }))
)

function syncMenuEl() {
  if (props.mode === 'list') {
    emit('menu-el', dropdownRef.value?.menuEl ?? rootEl.value)
    return
  }
  emit('menu-el', rootEl.value)
}

function focusFirstAction() {
  const focusTarget = rootEl.value?.querySelector<HTMLButtonElement>('button:not([disabled])')
  focusTarget?.focus()
}

function focusNextAction(direction: 1 | -1) {
  const actions = Array.from(rootEl.value?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])
  if (!actions.length) return
  const activeElement = document.activeElement
  const activeIndex = actions.findIndex((button) => button === activeElement || button.contains(activeElement))
  const nextIndex = activeIndex >= 0 ? activeIndex + direction : direction > 0 ? 0 : actions.length - 1
  const normalizedIndex = ((nextIndex % actions.length) + actions.length) % actions.length
  actions[normalizedIndex]?.focus()
}

function suppressNextMouseClick() {
  suppressNextClick = true
  window.setTimeout(() => {
    suppressNextClick = false
  }, 0)
}

function onSelectPointerDown(suggestion: string) {
  suppressNextMouseClick()
  emit('select', suggestion)
}

function onSelectClick(suggestion: string) {
  if (suppressNextClick) return
  emit('select', suggestion)
}

function onIgnorePointerDown() {
  suppressNextMouseClick()
  emit('ignore')
}

function onIgnoreClick() {
  if (suppressNextClick) return
  emit('ignore')
}

function onAddToDictionaryPointerDown() {
  suppressNextMouseClick()
  emit('add-to-dictionary')
}

function onAddToDictionaryClick() {
  if (suppressNextClick) return
  emit('add-to-dictionary')
}

function onSingleRootKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault()
    event.stopPropagation()
    focusNextAction(1)
    return
  }

  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault()
    event.stopPropagation()
    focusNextAction(-1)
  }
}

function onListOpenChange(value: boolean) {
  if (!value) emit('close')
}

function onListActiveIndexChange(value: number) {
  listActiveIndex.value = value
}

watch(
  () => props.open,
  async (open) => {
    spellcheckFilterQuery.value = ''
    if (!open) return
    listActiveIndex.value = 0
    await nextTick()
    if (props.mode === 'single') {
      focusFirstAction()
    }
  },
  { immediate: true, flush: 'post' }
)

onMounted(syncMenuEl)
onUpdated(syncMenuEl)
onBeforeUnmount(() => {
  emit('menu-el', null)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="rootEl"
      class="tomosona-spellcheck-menu"
      :style="{ position: 'fixed', left: `${left}px`, top: `${top}px`, zIndex: 60 }"
      tabindex="-1"
      @keydown="mode === 'single' ? onSingleRootKeydown($event) : undefined"
      @mousedown.stop
      @click.stop
    >
      <UiMenu
        v-if="mode === 'single'"
        class="tomosona-spellcheck-menu__surface tomosona-spellcheck-menu__surface--single"
      >
        <button
          type="button"
          class="tomosona-spellcheck-menu__primary-action"
          @pointerdown.prevent.stop="onSelectPointerDown(primarySuggestion)"
          @click="onSelectClick(primarySuggestion)"
        >
          <span class="tomosona-spellcheck-menu__primary-icon" aria-hidden="true">⚡</span>
          <span class="tomosona-spellcheck-menu__primary-label">{{ primarySuggestion }}</span>
          <span class="tomosona-spellcheck-menu__primary-shortcut" aria-hidden="true">↵</span>
        </button>
        <div class="tomosona-spellcheck-menu__secondary-row">
          <button
            type="button"
            class="tomosona-spellcheck-menu__secondary-action"
            @pointerdown.prevent.stop="onIgnorePointerDown"
            @click="onIgnoreClick"
          >
            Ignore
          </button>
          <button
            type="button"
            class="tomosona-spellcheck-menu__secondary-action"
            @pointerdown.prevent.stop="onAddToDictionaryPointerDown"
            @click="onAddToDictionaryClick"
          >
            Add to dictionary
          </button>
        </div>
      </UiMenu>

      <UiFilterableDropdown
        v-else
        ref="dropdownRef"
        class="tomosona-spellcheck-menu__dropdown"
        :items="dropdownItems"
        :model-value="open"
        :query="spellcheckFilterQuery"
        :active-index="listActiveIndex"
        filter-placeholder="Search suggestions..."
        :show-filter="true"
        :auto-focus-on-open="true"
        :close-on-outside="false"
        :close-on-select="false"
        menu-mode="inline"
        :menu-class="'tomosona-spellcheck-menu__dropdown-menu'"
        :max-height="284"
        @open-change="onListOpenChange"
        @query-change="spellcheckFilterQuery = $event"
        @active-index-change="onListActiveIndexChange"
        @select="onSelectClick($event.label)"
      >
        <template #footer>
          <div class="tomosona-spellcheck-menu__secondary-row tomosona-spellcheck-menu__secondary-row--footer">
            <button
              type="button"
              class="tomosona-spellcheck-menu__secondary-action"
              @pointerdown.prevent.stop="onIgnorePointerDown"
              @click="onIgnoreClick"
            >
              Ignore
            </button>
            <button
              type="button"
              class="tomosona-spellcheck-menu__secondary-action"
              @pointerdown.prevent.stop="onAddToDictionaryPointerDown"
              @click="onAddToDictionaryClick"
            >
              Add to dictionary
            </button>
          </div>
        </template>
      </UiFilterableDropdown>
    </div>
  </Teleport>
</template>

<style scoped>
.tomosona-spellcheck-menu {
  font-size: 0.875rem;
  outline: none;
}

.tomosona-spellcheck-menu__surface {
  min-width: 220px;
  max-width: 320px;
}

.tomosona-spellcheck-menu__surface--single {
  gap: 0.375rem;
  padding: 0.375rem;
}

.tomosona-spellcheck-menu__primary-action {
  width: 100%;
  border: 0;
  border-radius: var(--border-radius-md, var(--radius-md));
  background: var(--color-background-info, var(--toast-info-bg));
  color: var(--color-text-info, var(--toast-info-text));
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.7rem;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.2;
  text-align: left;
  transition: filter 120ms ease, transform 120ms ease;
}

.tomosona-spellcheck-menu__primary-action:hover:not(:disabled) {
  filter: brightness(0.96);
}

.tomosona-spellcheck-menu__primary-action:focus-visible,
.tomosona-spellcheck-menu__secondary-action:focus-visible,
.tomosona-spellcheck-menu__footer-action:focus-visible,
.tomosona-spellcheck-menu__dropdown-option:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-text-info, var(--toast-info-text)) 35%, transparent);
  outline-offset: 2px;
}

.tomosona-spellcheck-menu__primary-icon,
.tomosona-spellcheck-menu__primary-shortcut {
  flex: 0 0 auto;
  font-size: 14px;
  line-height: 1;
}

.tomosona-spellcheck-menu__primary-shortcut {
  margin-left: auto;
  opacity: 0.8;
}

.tomosona-spellcheck-menu__secondary-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0;
  border-top: 0.5px solid var(--color-border-tertiary, var(--menu-divider));
  padding-top: 0.375rem;
}

.tomosona-spellcheck-menu__secondary-row--footer {
  padding-bottom: 0.3rem;
}

.tomosona-spellcheck-menu__secondary-action {
  border: 0;
  border-radius: var(--border-radius-md, var(--radius-md));
  background: transparent;
  color: var(--color-text-secondary, var(--menu-text));
  padding: 0.45rem 0.625rem;
  font-size: 0.875rem;
  line-height: 1.2;
  text-align: left;
  transition: background-color 120ms ease;
}

.tomosona-spellcheck-menu__secondary-action:hover:not(:disabled) {
  background: var(--color-background-secondary, var(--menu-hover-bg));
}

.tomosona-spellcheck-menu__dropdown {
  min-width: min(21rem, calc(100vw - 24px));
}

.tomosona-spellcheck-menu__dropdown :deep(.ui-filterable-dropdown-menu) {
  width: min(21rem, calc(100vw - 24px));
  min-width: min(21rem, calc(100vw - 24px));
  max-width: min(21rem, calc(100vw - 24px));
  border-radius: var(--border-radius-lg, 14px);
  overflow: hidden;
}

.tomosona-spellcheck-menu__dropdown :deep(.ui-filterable-dropdown-filter) {
  border-bottom-color: var(--editor-menu-border, var(--color-border-tertiary, var(--menu-divider)));
  padding: 0.35rem;
}

.tomosona-spellcheck-menu__dropdown :deep(.ui-filterable-dropdown-filter-input) {
  background: var(--editor-menu-bg, var(--color-background-main, var(--surface-bg)));
  border-color: var(--editor-menu-border, var(--color-border-tertiary, var(--menu-divider)));
  color: var(--editor-menu-text, var(--color-text-main, var(--menu-text)));
  font-size: 0.875rem;
  padding: 0.45rem 0.6rem;
}

.tomosona-spellcheck-menu__dropdown :deep(.ui-filterable-dropdown-filter-input::placeholder) {
  color: var(--editor-menu-muted, var(--color-text-secondary, var(--menu-muted)));
}

.tomosona-spellcheck-menu__dropdown :deep(.ui-filterable-dropdown-list) {
  max-height: 284px;
  padding: 0.125rem 0;
}

.tomosona-spellcheck-menu__dropdown :deep(.ui-filterable-dropdown-option) {
  font-size: 0.875rem;
  padding: 0.5rem 0.625rem;
  white-space: normal;
}

.tomosona-spellcheck-menu__dropdown :deep(.ui-filterable-dropdown-option:hover),
.tomosona-spellcheck-menu__dropdown :deep(.ui-filterable-dropdown-option[data-active='true']) {
  background: var(--editor-menu-hover-bg, var(--color-background-secondary, var(--menu-hover-bg)));
}
</style>
