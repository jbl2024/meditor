<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  label?: string
  help?: string
  error?: string
  forId?: string
  className?: string
}>(), {
  label: '',
  help: '',
  error: '',
  forId: '',
  className: ''
})

const describedBy = computed(() => {
  const value = [props.help ? `${props.forId}-help` : '', props.error ? `${props.forId}-error` : '']
    .filter(Boolean)
    .join(' ')
  return value || undefined
})
</script>

<template>
  <div :class="['ui-field flex flex-col gap-1.5', className]">
    <label v-if="label" class="ui-field__label" :for="forId">{{ label }}</label>
    <slot :described-by="describedBy" :invalid="Boolean(error)"></slot>
    <p v-if="help" :id="forId ? `${forId}-help` : undefined" class="ui-field__help">{{ help }}</p>
    <p v-if="error" :id="forId ? `${forId}-error` : undefined" class="ui-field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.ui-field__label {
  color: var(--field-label);
  font-size: 0.78rem;
  font-weight: 600;
}

.ui-field__help {
  color: var(--field-help);
  font-size: 0.76rem;
}

.ui-field__error {
  color: var(--field-error-text);
  font-size: 0.76rem;
}
</style>
