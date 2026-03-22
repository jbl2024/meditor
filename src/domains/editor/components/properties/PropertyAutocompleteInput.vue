<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import UiFilterableDropdown, { type FilterableDropdownItem } from '../../../../shared/components/ui/UiFilterableDropdown.vue'
import UiInput, { type UiInputSize } from '../../../../shared/components/ui/UiInput.vue'

/**
 * PropertyAutocompleteInput
 *
 * Purpose:
 * - Provide a plain text input with workspace-backed autocomplete for
 *   property keys and scalar property values.
 *
 * Boundaries:
 * - Keeps editing free-form; autocomplete only suggests existing values.
 * - Does not tokenize or coerce values; callers own property typing rules.
 */
const props = withDefaults(defineProps<{
  modelValue: string
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
  size?: UiInputSize
  className?: string
  emptyLabel?: string
}>(), {
  suggestions: () => [],
  placeholder: '',
  disabled: false,
  size: 'sm',
  className: '',
  emptyLabel: 'No suggestions'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputRef = ref<{ focus?: () => void; select?: () => void } | null>(null)
const dropdownRef = ref<{ menuEl?: HTMLElement | null } | null>(null)
const dropdownOpen = ref(false)
const dropdownActiveIndex = ref(0)

const normalizedSuggestions = computed(() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const suggestion of props.suggestions ?? []) {
    const trimmed = suggestion.trim()
    if (!trimmed) continue
    const normalized = trimmed.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(trimmed)
  }
  return out
})

const filteredSuggestions = computed(() => {
  const needle = props.modelValue.trim().toLowerCase()
  if (!needle) return normalizedSuggestions.value
  return normalizedSuggestions.value.filter((suggestion) => suggestion.toLowerCase().startsWith(needle))
})

const suggestionItems = computed<FilterableDropdownItem[]>(() =>
  normalizedSuggestions.value.map((suggestion) => ({
    id: `property-autocomplete:${suggestion}`,
    label: suggestion
  }))
)

function openSuggestions() {
  if (props.disabled) return
  dropdownOpen.value = true
  dropdownActiveIndex.value = 0
}

function closeSuggestions() {
  dropdownOpen.value = false
  dropdownActiveIndex.value = 0
}

function onFocus() {
  openSuggestions()
}

function onBlur() {
  window.setTimeout(() => {
    const activeElement = document.activeElement as HTMLElement | null
    const menuEl = dropdownRef.value?.menuEl ?? null
    if (menuEl && activeElement && menuEl.contains(activeElement)) {
      return
    }
    closeSuggestions()
  }, 0)
}

function onInput(value: string) {
  emit('update:modelValue', value)
  openSuggestions()
}

function onSelect(item: FilterableDropdownItem) {
  const next = String(item.label ?? '').trim()
  if (!next) return
  emit('update:modelValue', next)
  closeSuggestions()
  void nextTick(() => {
    inputRef.value?.focus?.()
    inputRef.value?.select?.()
  })
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return

  if (event.key === 'Escape') {
    closeSuggestions()
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!dropdownOpen.value) {
      openSuggestions()
    }
    const total = filteredSuggestions.value.length
    if (!total) return
    event.preventDefault()
    if (event.key === 'ArrowDown') {
      dropdownActiveIndex.value = (dropdownActiveIndex.value + 1) % total
      return
    }
    dropdownActiveIndex.value = (dropdownActiveIndex.value - 1 + total) % total
    return
  }

  if ((event.key === 'Enter' || event.key === 'Tab') && dropdownOpen.value && filteredSuggestions.value.length) {
    event.preventDefault()
    const next = filteredSuggestions.value[dropdownActiveIndex.value] ?? filteredSuggestions.value[0]
    if (next) {
      onSelect({ id: `property-autocomplete:${next}`, label: next })
    }
  }
}

watch(
  () => props.modelValue,
  () => {
    if (dropdownOpen.value) {
      dropdownActiveIndex.value = 0
    }
  }
)
</script>

<template>
  <UiFilterableDropdown
    ref="dropdownRef"
    class="property-autocomplete-input"
    :items="suggestionItems"
    :model-value="dropdownOpen"
    :query="modelValue"
    :active-index="dropdownActiveIndex"
    :show-filter="false"
    :auto-focus-on-open="false"
    :close-on-select="false"
    menu-mode="portal"
    menu-class="property-autocomplete-input-menu"
    :matcher="(item, query) => item.label.toLowerCase().startsWith(query)"
    @open-change="dropdownOpen = $event"
    @active-index-change="dropdownActiveIndex = $event"
    @select="onSelect($event)"
  >
    <template #trigger>
      <UiInput
        ref="inputRef"
        :model-value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :size="size"
        :class-name="className"
        autocomplete="off"
        @focus="onFocus"
        @blur="onBlur"
        @update:model-value="onInput"
        @keydown="onKeydown"
      />
    </template>
    <template #item="{ item, active }">
      <span class="property-autocomplete-input-option" :class="{ 'property-autocomplete-input-option--active': active }">
        {{ item.label }}
      </span>
    </template>
    <template #empty>
      <span class="property-autocomplete-input-empty">{{ emptyLabel }}</span>
    </template>
  </UiFilterableDropdown>
</template>

<style scoped>
.property-autocomplete-input {
  position: relative;
}

.property-autocomplete-input :deep(.ui-filterable-dropdown-menu) {
  min-width: 18rem;
}

.property-autocomplete-input :deep(.ui-filterable-dropdown-option) {
  padding: 0.5rem 0.75rem;
}

.property-autocomplete-input-option {
  display: block;
  width: 100%;
}

.property-autocomplete-input-option--active {
  font-weight: 600;
}

.property-autocomplete-input-empty {
  color: var(--text-dim);
}
</style>
