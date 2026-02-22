<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

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
const customKey = ref('')
const rootRef = ref<HTMLElement | null>(null)

const existingSet = computed(() => new Set(props.existingKeys.map((key) => key.trim().toLowerCase())))
const availableOptions = computed(() =>
  props.options.filter((option) => !existingSet.value.has(option.key.trim().toLowerCase()))
)

function toggleOpen() {
  open.value = !open.value
}

function close() {
  open.value = false
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

function onDocumentMousedown(event: MouseEvent) {
  const root = rootRef.value
  if (!root) return
  const target = event.target as Node | null
  if (target && root.contains(target)) return
  close()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMousedown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMousedown)
})
</script>

<template>
  <div ref="rootRef" class="property-add-dropdown">
    <button
      type="button"
      class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200"
      @click="toggleOpen"
    >
      Add property
    </button>

    <div
      v-if="open"
      class="dropdown-panel"
    >
      <button
        v-for="option in availableOptions"
        :key="option.key"
        type="button"
        class="dropdown-item"
        @click="selectOption(option.key)"
      >
        <span>{{ option.label || option.key }}</span>
        <small v-if="option.description">{{ option.description }}</small>
      </button>

      <div class="dropdown-divider"></div>
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
    </div>
  </div>
</template>

<style scoped>
.property-add-dropdown {
  position: relative;
  display: inline-flex;
}

.dropdown-panel {
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

:global(.dark) .dropdown-panel {
  border-color: rgb(51 65 85 / 1);
  background: rgb(15 23 42 / 1);
}

.dropdown-item {
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

.dropdown-item:hover {
  background: rgb(241 245 249 / 1);
}

.dropdown-item small {
  font-size: 0.6875rem;
  color: rgb(100 116 139 / 1);
}

:global(.dark) .dropdown-item {
  color: rgb(226 232 240 / 1);
}

:global(.dark) .dropdown-item:hover {
  background: rgb(30 41 59 / 1);
}

:global(.dark) .dropdown-item small {
  color: rgb(148 163 184 / 1);
}

.dropdown-divider {
  margin: 0.25rem 0;
  border-top: 1px solid rgb(226 232 240 / 1);
}

:global(.dark) .dropdown-divider {
  border-top-color: rgb(51 65 85 / 1);
}

.dropdown-custom-row {
  display: flex;
  gap: 0.375rem;
}

.dropdown-custom-input {
  min-width: 0;
  flex: 1;
  border: 1px solid rgb(203 213 225 / 1);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1rem;
}

:global(.dark) .dropdown-custom-input {
  border-color: rgb(51 65 85 / 1);
  background: rgb(15 23 42 / 1);
  color: rgb(226 232 240 / 1);
}

.dropdown-custom-btn {
  border: 1px solid rgb(203 213 225 / 1);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  line-height: 1rem;
  background: white;
  color: rgb(51 65 85 / 1);
  cursor: pointer;
}

:global(.dark) .dropdown-custom-btn {
  border-color: rgb(51 65 85 / 1);
  background: rgb(30 41 59 / 1);
  color: rgb(226 232 240 / 1);
}
</style>
