<script setup lang="ts">
import type { FrontmatterField } from '../../lib/frontmatter'
import type { PropertyType } from '../../lib/propertyTypes'
import PropertyAddDropdown from '../properties/PropertyAddDropdown.vue'
import PropertyTokenInput from '../properties/PropertyTokenInput.vue'

type CorePropertyOption = {
  key: string
  label?: string
  description?: string
}

const props = defineProps<{
  expanded: boolean
  mode: 'structured' | 'raw'
  canUseStructuredProperties: boolean
  structuredPropertyFields: FrontmatterField[]
  structuredPropertyKeys: string[]
  activeRawYaml: string
  activeParseErrors: Array<{ line: number; message: string }>
  corePropertyOptions: CorePropertyOption[]
  effectiveTypeForField: (field: FrontmatterField) => PropertyType
  isPropertyTypeLocked: (key: string) => boolean
}>()

const emit = defineEmits<{
  'toggle-visibility': []
  'set-mode': [mode: 'structured' | 'raw']
  'property-key-input': [payload: { index: number; value: string }]
  'property-type-change': [payload: { index: number; value: string }]
  'property-value-input': [payload: { index: number; value: string }]
  'property-checkbox-input': [payload: { index: number; checked: boolean }]
  'property-tokens-change': [payload: { index: number; tokens: string[] }]
  'remove-property': [index: number]
  'add-property': [key: string]
  'raw-yaml-input': [value: string]
}>()

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? ''
}

function selectValue(event: Event): string {
  return (event.target as HTMLSelectElement | null)?.value ?? ''
}

function checkboxValue(event: Event): boolean {
  return (event.target as HTMLInputElement | null)?.checked ?? false
}
</script>

<template>
  <section
    class="properties-panel border-b border-slate-200 dark:border-slate-800"
    :class="props.expanded ? 'px-8 py-3' : 'px-8 py-2'"
  >
    <div class="flex items-center justify-between gap-3" :class="props.expanded ? 'mb-2' : 'mb-0'">
      <button
        type="button"
        class="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100"
        @click="emit('toggle-visibility')"
      >
        <span aria-hidden="true">{{ props.expanded ? '▾' : '▸' }}</span>
        <span>Properties</span>
      </button>
      <div v-if="props.expanded" class="flex items-center gap-1.5">
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:text-slate-200"
          :class="props.mode === 'structured' ? 'bg-slate-100 dark:bg-slate-800' : ''"
          :disabled="!props.canUseStructuredProperties"
          @click="emit('set-mode', 'structured')"
        >
          Structured
        </button>
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:text-slate-200"
          :class="props.mode === 'raw' ? 'bg-slate-100 dark:bg-slate-800' : ''"
          @click="emit('set-mode', 'raw')"
        >
          Raw YAML
        </button>
      </div>
    </div>

    <div v-if="props.expanded && props.mode === 'structured'" class="space-y-2">
      <div
        v-for="(field, index) in props.structuredPropertyFields"
        :key="index"
        class="property-row grid grid-cols-[1fr_auto_2fr_auto] items-center gap-2"
      >
        <input
          :value="field.key"
          class="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          placeholder="key"
          @input="emit('property-key-input', { index, value: inputValue($event) })"
        />
        <select
          :value="props.effectiveTypeForField(field)"
          class="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          :disabled="props.isPropertyTypeLocked(field.key)"
          @change="emit('property-type-change', { index, value: selectValue($event) })"
        >
          <option value="text">Text</option>
          <option value="list">List</option>
          <option value="number">Number</option>
          <option value="checkbox">Checkbox</option>
          <option value="date">Date</option>
          <option value="tags">Tags</option>
        </select>
        <div class="min-w-0">
          <input
            v-if="props.effectiveTypeForField(field) === 'text' || props.effectiveTypeForField(field) === 'date'"
            :value="String(field.value ?? '')"
            class="w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            :placeholder="props.effectiveTypeForField(field) === 'date' ? 'YYYY-MM-DD' : 'value'"
            @input="emit('property-value-input', { index, value: inputValue($event) })"
          />
          <input
            v-else-if="props.effectiveTypeForField(field) === 'number'"
            :value="String(field.value ?? 0)"
            class="w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            type="number"
            @input="emit('property-value-input', { index, value: inputValue($event) })"
          />
          <PropertyTokenInput
            v-else-if="props.effectiveTypeForField(field) === 'list' || props.effectiveTypeForField(field) === 'tags'"
            :model-value="Array.isArray(field.value) ? field.value : []"
            :placeholder="props.effectiveTypeForField(field) === 'tags' ? 'add tag' : 'add value'"
            @update:modelValue="emit('property-tokens-change', { index, tokens: $event })"
          />
          <label v-else class="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              :checked="Boolean(field.value)"
              @change="emit('property-checkbox-input', { index, checked: checkboxValue($event) })"
            />
            true / false
          </label>
        </div>
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200"
          @click="emit('remove-property', index)"
        >
          Remove
        </button>
      </div>

      <div class="flex items-center gap-2">
        <PropertyAddDropdown
          :options="props.corePropertyOptions"
          :existing-keys="props.structuredPropertyKeys"
          @select="emit('add-property', $event)"
        />
      </div>
    </div>

    <div v-else-if="props.expanded">
      <textarea
        class="font-mono min-h-28 w-full rounded border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        :value="props.activeRawYaml"
        placeholder="title: My note"
        @input="emit('raw-yaml-input', inputValue($event))"
      ></textarea>
    </div>

    <div v-if="props.expanded && props.activeParseErrors.length" class="mt-2 text-xs text-red-600 dark:text-red-400">
      <div v-for="(error, index) in props.activeParseErrors" :key="`${error.line}-${index}`">
        Line {{ error.line }}: {{ error.message }}
      </div>
    </div>
  </section>
</template>
