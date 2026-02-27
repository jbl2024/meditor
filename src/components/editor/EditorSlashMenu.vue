<script setup lang="ts">
type SlashCommand = {
  id: string
  label: string
  type: string
  data: Record<string, unknown>
}

const props = defineProps<{
  open: boolean
  index: number
  left: number
  top: number
  commands: SlashCommand[]
}>()

const emit = defineEmits<{
  'update:index': [value: number]
  select: [command: SlashCommand]
}>()
</script>

<template>
  <div
    v-if="props.open"
    class="absolute z-20 w-52 rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900"
    :style="{ left: `${props.left}px`, top: `${props.top}px` }"
  >
    <button
      v-for="(command, idx) in props.commands"
      :key="command.id"
      type="button"
      class="block w-full rounded px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      :class="idx === props.index ? 'bg-slate-100 dark:bg-slate-800' : ''"
      @mousedown.prevent="emit('update:index', idx)"
      @click.stop.prevent="emit('select', command)"
    >
      {{ command.label }}
    </button>
  </div>
</template>
