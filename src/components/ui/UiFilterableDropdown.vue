<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  useFilterableListbox,
  type FilterableItemBase
} from '../../composables/useFilterableListbox'

/**
 * Shared filterable dropdown shell used across editor and panel menus.
 *
 * How to use:
 * - Keep your domain model in parent code.
 * - Map domain entries to `{ id, label, ...extra }`.
 * - Use slots to customize trigger and rows while reusing keyboard/open/close behavior.
 */
/**
 * Generic dropdown row payload.
 *
 * Why:
 * - Consumers often need extra fields (icons, targets, aliases).
 * - The component only requires `id` and `label` but safely carries through
 *   additional data to `select` and item slots.
 */
export type FilterableDropdownItem = FilterableItemBase & Record<string, unknown>

const props = withDefaults(defineProps<{
  items: FilterableDropdownItem[]
  modelValue: boolean
  query: string
  activeIndex: number
  filterPlaceholder?: string
  showFilter?: boolean
  disabled?: boolean
  maxHeight?: number | string
  closeOnOutside?: boolean
  closeOnSelect?: boolean
  autoFocusOnOpen?: boolean
  matcher?: (item: FilterableDropdownItem, query: string) => boolean
}>(), {
  filterPlaceholder: 'Filter...',
  showFilter: true,
  disabled: false,
  maxHeight: 260,
  closeOnOutside: true,
  closeOnSelect: true,
  autoFocusOnOpen: true
})

const emit = defineEmits<{
  'open-change': [value: boolean]
  'query-change': [value: string]
  'active-index-change': [value: number]
  select: [item: FilterableDropdownItem]
}>()

const rootRef = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const listboxId = `meditor-filterable-listbox-${Math.random().toString(36).slice(2)}`
const itemsRef = computed(() => props.items)
const maxHeightPx = computed(() =>
  typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight
)

const api = useFilterableListbox({
  items: itemsRef,
  match: props.matcher,
  onSelect: (item) => {
    emit('select', item)
    if (props.closeOnSelect) {
      api.closeMenu()
    }
  }
})

/**
 * Initializes headless state from controlled props.
 *
 * Why:
 * - This component is intentionally controlled by parent state so existing
 *   menu contracts can stay stable during migration.
 */
function syncFromProps() {
  api.open.value = Boolean(props.modelValue)
  api.query.value = String(props.query ?? '')
  api.setActiveIndex(Number(props.activeIndex ?? 0))
}

syncFromProps()

watch(() => props.modelValue, (value) => {
  api.open.value = Boolean(value)
})

watch(() => props.query, (value) => {
  api.query.value = String(value ?? '')
})

watch(() => props.activeIndex, (value) => {
  api.setActiveIndex(Number(value ?? 0))
})

watch(() => api.open.value, (value) => {
  if (value !== props.modelValue) emit('open-change', value)
  if (!value) return
  if (!props.autoFocusOnOpen) return
  void nextTick(() => {
    if (props.showFilter) {
      inputRef.value?.focus()
      inputRef.value?.select()
      return
    }
    menuEl.value?.focus()
  })
})

watch(() => api.query.value, (value) => {
  if (value !== props.query) emit('query-change', value)
})

watch(() => api.activeIndex.value, (value) => {
  if (value !== props.activeIndex) emit('active-index-change', value)
})

watch(
  [() => api.open.value, () => api.activeIndex.value, () => api.filteredItems.value.length],
  ([open]) => {
    if (!open) return
    void nextTick(() => {
      const active = listRef.value?.querySelector<HTMLElement>('[data-active="true"]')
      if (typeof active?.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'nearest' })
      }
    })
  }
)

/**
 * Closes menu when pointer interaction happens outside this dropdown root.
 *
 * Integration note:
 * - Kept configurable because some teleported/anchored menus delegate outside
 *   click handling to parent surfaces.
 */
function closeFromOutside(event: MouseEvent) {
  if (!props.closeOnOutside) return
  if (!api.open.value) return
  const root = rootRef.value
  if (!root) return
  const target = event.target as Node | null
  if (target && root.contains(target)) return
  api.closeMenu()
}

function openMenu() {
  if (props.disabled) return
  api.openMenu()
}

function closeMenu() {
  api.closeMenu()
}

function toggleMenu() {
  if (props.disabled) return
  if (api.open.value) {
    api.closeMenu()
    return
  }
  api.openMenu()
}

function onFilterKeydown(event: KeyboardEvent) {
  api.handleKeydown(event)
}

/**
 * Handles keyboard events when no text filter input is rendered.
 *
 * Why:
 * - Keeps keyboard support available for command-style menus that rely on
 *   external query context (slash/wikilink).
 */
function onMenuKeydown(event: KeyboardEvent) {
  if (props.showFilter) return
  api.handleKeydown(event)
}

function onOptionMouseEnter(index: number) {
  api.setActiveIndex(index)
}

function onOptionClick(index: number) {
  api.selectIndex(index)
}

onMounted(() => {
  document.addEventListener('mousedown', closeFromOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', closeFromOutside)
})

defineExpose({
  // Used by menu wrappers that need direct access for positioning/hit testing.
  menuEl
})
</script>

<template>
  <div ref="rootRef" class="ui-filterable-dropdown">
    <slot
      name="trigger"
      :open="api.open.value"
      :open-menu="openMenu"
      :close-menu="closeMenu"
      :toggle-menu="toggleMenu"
      :active-item="api.activeItem.value"
      :query="api.query.value"
      :filtered-items="api.filteredItems.value"
    />

    <div
      v-if="api.open.value"
      ref="menuEl"
      class="ui-filterable-dropdown-menu"
      tabindex="-1"
      @keydown="onMenuKeydown"
    >
      <div v-if="props.showFilter" class="ui-filterable-dropdown-filter">
        <input
          ref="inputRef"
          :value="api.query.value"
          type="text"
          class="ui-filterable-dropdown-filter-input"
          :placeholder="props.filterPlaceholder"
          role="combobox"
          :aria-expanded="api.open.value ? 'true' : 'false'"
          :aria-controls="listboxId"
          :aria-activedescendant="api.activeItemId.value ?? undefined"
          @input="api.query.value = ($event.target as HTMLInputElement | null)?.value ?? ''"
          @keydown="onFilterKeydown"
        />
      </div>

      <div
        :id="listboxId"
        ref="listRef"
        class="ui-filterable-dropdown-list"
        role="listbox"
        :style="{ maxHeight: maxHeightPx }"
      >
        <template v-if="api.filteredItems.value.length">
          <button
            v-for="(item, index) in api.filteredItems.value"
            :id="item.id"
            :key="item.id"
            type="button"
            class="ui-filterable-dropdown-option"
            role="option"
            :aria-selected="api.activeIndex.value === index ? 'true' : 'false'"
            :data-active="api.activeIndex.value === index ? 'true' : 'false'"
            @mouseenter="onOptionMouseEnter(index)"
            @mousedown.prevent
            @click.stop.prevent="onOptionClick(index)"
          >
            <slot
              name="item"
              :item="item"
              :index="index"
              :active="api.activeIndex.value === index"
              :select="() => onOptionClick(index)"
            >
              <span>{{ item.label }}</span>
            </slot>
          </button>
        </template>
        <div v-else class="ui-filterable-dropdown-empty">
          <slot name="empty" :query="api.query.value">
            No matches
          </slot>
        </div>
      </div>

      <div v-if="$slots.footer" class="ui-filterable-dropdown-footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ui-filterable-dropdown {
  position: relative;
  --ui-dropdown-bg: #ffffff;
  --ui-dropdown-border: #d1d5db;
  --ui-dropdown-text: #0f172a;
  --ui-dropdown-muted: #6b7280;
  --ui-dropdown-hover: rgba(37, 99, 235, 0.08);
}

:global(.dark) .ui-filterable-dropdown {
  --ui-dropdown-bg: rgb(15 23 42);
  --ui-dropdown-border: rgb(71 85 105);
  --ui-dropdown-text: rgb(226 232 240);
  --ui-dropdown-muted: rgb(148 163 184);
  --ui-dropdown-hover: rgba(59, 130, 246, 0.22);
}

.ui-filterable-dropdown-menu {
  background: var(--ui-dropdown-bg);
  border: 1px solid var(--ui-dropdown-border);
  border-radius: 10px;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ui-filterable-dropdown-filter {
  border-bottom: 1px solid var(--ui-dropdown-border);
  padding: 8px;
}

.ui-filterable-dropdown-filter-input {
  width: 100%;
  background: var(--ui-dropdown-bg);
  border: 1px solid var(--ui-dropdown-border);
  border-radius: 8px;
  color: var(--ui-dropdown-text);
  font-size: 12px;
  line-height: 1.2;
  padding: 7px 10px;
}

.ui-filterable-dropdown-filter-input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.16);
}

.ui-filterable-dropdown-list {
  overflow-y: auto;
}

.ui-filterable-dropdown-option {
  background: transparent;
  border: none;
  color: var(--ui-dropdown-text);
  cursor: pointer;
  display: block;
  font-size: 12px;
  line-height: 1.25;
  padding: 8px 12px;
  text-align: left;
  white-space: nowrap;
  width: 100%;
}

.ui-filterable-dropdown-option:hover,
.ui-filterable-dropdown-option[data-active='true'] {
  background: var(--ui-dropdown-hover);
}

.ui-filterable-dropdown-empty {
  color: var(--ui-dropdown-muted);
  font-size: 12px;
  padding: 10px 12px;
}

.ui-filterable-dropdown-footer {
  border-top: 1px solid var(--ui-dropdown-border);
  padding: 8px;
}
</style>
