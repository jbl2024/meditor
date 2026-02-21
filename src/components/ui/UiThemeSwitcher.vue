<script setup lang="ts">
import UiButton from './UiButton.vue'

type ThemePreference = 'light' | 'dark' | 'system'

defineProps<{
  modelValue: ThemePreference
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: ThemePreference): void
}>()
</script>

<template>
  <div class="flex items-center gap-1 rounded-xl border border-slate-300/90 bg-white/80 p-1 dark:border-slate-700/80 dark:bg-slate-900/70">
    <UiButton
      size="sm"
      :variant="modelValue === 'light' ? 'primary' : 'ghost'"
      @click="emit('update:modelValue', 'light')"
    >
      Light
    </UiButton>
    <UiButton
      size="sm"
      :variant="modelValue === 'dark' ? 'primary' : 'ghost'"
      @click="emit('update:modelValue', 'dark')"
    >
      Dark
    </UiButton>
    <UiButton
      size="sm"
      :variant="modelValue === 'system' ? 'primary' : 'ghost'"
      @click="emit('update:modelValue', 'system')"
    >
      System
    </UiButton>
  </div>
</template>
