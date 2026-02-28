<script setup lang="ts">
import { computed, ref } from 'vue'
import UiFilterableDropdown, { type FilterableDropdownItem } from '../ui/UiFilterableDropdown.vue'

type PropertyOption = {
  key: string
  label?: string
  description?: string
}

const props = withDefaults(defineProps<{
  options: PropertyOption[]
  existingKeys: string[]
}>(), {
  options: () => [],
  existingKeys: () => []
})

const emit = defineEmits<{
  (event: 'select', key: string): void
}>()

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const customKey = ref('')

const existingSet = computed(() => new Set(props.existingKeys.map((key) => key.trim().toLowerCase())))
const availableOptions = computed<Array<FilterableDropdownItem & { key: string; description: string }>>(() =>
  props.options
    .filter((option) => !existingSet.value.has(option.key.trim().toLowerCase()))
    .map((option) => ({
      id: `property:${option.key}`,
      label: option.label || option.key,
      key: option.key,
      description: option.description ?? ''
    }))
)

function close() {
  open.value = false
  query.value = ''
  activeIndex.value = 0
}

function selectOption(key: string) {
  emit('select', key)
  customKey.value = ''
  close()
}

function submitCustomKey() {
  const next = customKey.value.trim()
  if (!next) return
  if (existingSet.value.has(next.toLowerCase())) return
  selectOption(next)
}
</script>

<template>
  <div class="property-add-dropdown">
    <UiFilterableDropdown
      :items="availableOptions"
      :model-value="open"
      :query="query"
      :active-index="activeIndex"
      filter-placeholder="Search properties..."
      :show-filter="true"
      :max-height="220"
      @open-change="open = $event"
      @query-change="query = $event"
      @active-index-change="activeIndex = $event"
      @select="selectOption(String($event.key ?? ''))"
    >
      <template #trigger="{ toggleMenu }">
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200"
          @click="toggleMenu"
        >
          Add property
        </button>
      </template>
      <template #item="{ item }">
        <div class="dropdown-item">
          <span>{{ item.label }}</span>
          <small v-if="item.description">{{ item.description }}</small>
        </div>
      </template>
      <template #footer>
        <div class="dropdown-custom-row">
          <input
            v-model="customKey"
            type="text"
            placeholder="custom key"
            class="dropdown-custom-input"
            @keydown.enter.prevent="submitCustomKey"
          />
          <button
            type="button"
            class="dropdown-custom-btn"
            @click="submitCustomKey"
          >
            Add
          </button>
        </div>
      </template>
    </UiFilterableDropdown>
  </div>
</template>

<style>
.property-add-dropdown {
  position: relative;
  display: inline-flex;
}

.property-add-dropdown .dropdown-panel {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  z-index: 30;
}

.property-add-dropdown :deep(.ui-filterable-dropdown-menu) {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  z-index: 30;
  width: 16rem;
  border: 1px solid rgb(203 213 225 / 1);
  border-radius: 0.5rem;
  background: white;
  padding: 0.375rem;
  box-shadow: 0 8px 24px rgb(15 23 42 / 0.12);
}

.dark .property-add-dropdown :deep(.ui-filterable-dropdown-menu) {
  border-color: #3e4451;
  background: #21252b;
}

.property-add-dropdown .dropdown-item {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  border: 0;
  border-radius: 0.375rem;
  padding: 0.375rem 0.5rem;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: rgb(30 41 59 / 1);
}

.property-add-dropdown .dropdown-item small {
  font-size: 0.6875rem;
  color: rgb(100 116 139 / 1);
}

.dark .property-add-dropdown .dropdown-item {
  color: #abb2bf;
}

.dark .property-add-dropdown .dropdown-item small {
  color: #8b93a3;
}

.property-add-dropdown .dropdown-custom-row {
  display: flex;
  gap: 0.375rem;
}

.property-add-dropdown .dropdown-custom-input {
  min-width: 0;
  flex: 1;
  border: 1px solid rgb(203 213 225 / 1);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1rem;
}

.dark .property-add-dropdown .dropdown-custom-input {
  border-color: #3e4451;
  background: #2c313a;
  color: #abb2bf;
}

.property-add-dropdown .dropdown-custom-btn {
  border: 1px solid rgb(203 213 225 / 1);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1rem;
  background: white;
  color: rgb(51 65 85 / 1);
  cursor: pointer;
}

.dark .property-add-dropdown .dropdown-custom-btn {
  border-color: #3e4451;
  background: #2c313a;
  color: #abb2bf;
}
</style>
