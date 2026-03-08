<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: string
  invalid?: boolean
  disabled?: boolean
  className?: string
}>(), {
  invalid: false,
  disabled: false,
  className: ''
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <select
    :value="modelValue"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    :class="['ui-select h-9 w-full border px-3 text-sm outline-none transition', { 'ui-select--invalid': invalid }, className]"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <slot />
  </select>
</template>

<style scoped>
.ui-select {
  border-color: var(--input-border);
  background: var(--input-bg);
  color: var(--input-text);
  border-radius: var(--radius-md);
}

.ui-select:focus {
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 2px var(--input-focus-ring);
}

.ui-select--invalid {
  border-color: var(--field-error-border);
}
</style>
