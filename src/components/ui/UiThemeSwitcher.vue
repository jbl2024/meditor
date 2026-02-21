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
      title="Light theme"
      aria-label="Light theme"
      @click="emit('update:modelValue', 'light')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1.5M12 19.5V21M5.636 5.636l1.06 1.06M17.303 17.303l1.06 1.06M3 12h1.5M19.5 12H21M5.636 18.364l1.06-1.06M17.303 6.697l1.06-1.06M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    </UiButton>
    <UiButton
      size="sm"
      :variant="modelValue === 'dark' ? 'primary' : 'ghost'"
      title="Dark theme"
      aria-label="Dark theme"
      @click="emit('update:modelValue', 'dark')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3a7.5 7.5 0 0 0 9.79 9.79Z" />
      </svg>
    </UiButton>
    <UiButton
      size="sm"
      :variant="modelValue === 'system' ? 'primary' : 'ghost'"
      title="System theme"
      aria-label="System theme"
      @click="emit('update:modelValue', 'system')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 5.25A2.25 2.25 0 0 1 6 3h12a2.25 2.25 0 0 1 2.25 2.25V15A2.25 2.25 0 0 1 18 17.25H6A2.25 2.25 0 0 1 3.75 15V5.25Z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 21h6M12 17.25V21" />
      </svg>
    </UiButton>
  </div>
</template>
