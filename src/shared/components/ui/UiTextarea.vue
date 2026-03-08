<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  invalid?: boolean
  className?: string
  rows?: number
}>(), {
  placeholder: '',
  invalid: false,
  className: '',
  rows: 4
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <textarea
    :value="props.modelValue"
    :placeholder="placeholder"
    :rows="rows"
    :aria-invalid="invalid ? 'true' : undefined"
    :class="[
      'ui-textarea min-h-28 w-full border px-3 py-2 text-sm outline-none transition',
      { 'ui-textarea--invalid': invalid },
      className
    ]"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  ></textarea>
</template>

<style scoped>
.ui-textarea {
  border-color: var(--input-border);
  background: var(--input-bg);
  color: var(--input-text);
  border-radius: var(--radius-md);
}

.ui-textarea::placeholder {
  color: var(--input-placeholder);
}

.ui-textarea:focus {
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 2px var(--input-focus-ring);
}

.ui-textarea--invalid {
  border-color: var(--field-error-border);
}
</style>
