<script setup lang="ts">
import UiButton from './UiButton.vue'
import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/vue/24/outline'

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
      <SunIcon class="h-4 w-4" />
    </UiButton>
    <UiButton
      size="sm"
      :variant="modelValue === 'dark' ? 'primary' : 'ghost'"
      title="Dark theme"
      aria-label="Dark theme"
      @click="emit('update:modelValue', 'dark')"
    >
      <MoonIcon class="h-4 w-4" />
    </UiButton>
    <UiButton
      size="sm"
      :variant="modelValue === 'system' ? 'primary' : 'ghost'"
      title="System theme"
      aria-label="System theme"
      @click="emit('update:modelValue', 'system')"
    >
      <ComputerDesktopIcon class="h-4 w-4" />
    </UiButton>
  </div>
</template>
