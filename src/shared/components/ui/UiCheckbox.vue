<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: boolean
  disabled?: boolean
  label?: string
  className?: string
}>(), {
  disabled: false,
  label: '',
  className: ''
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()
</script>

<template>
  <label :class="['ui-checkbox inline-flex items-center gap-2 text-sm', className]">
    <input
      class="ui-checkbox__control"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span v-if="label || $slots.default" class="ui-checkbox__label">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<style scoped>
.ui-checkbox {
  color: var(--field-label);
}

.ui-checkbox__control {
  width: 1rem;
  height: 1rem;
  border-radius: 0.3rem;
  border: 1px solid var(--input-border);
  accent-color: var(--accent);
}

.ui-checkbox__label {
  color: var(--input-text);
}
</style>
