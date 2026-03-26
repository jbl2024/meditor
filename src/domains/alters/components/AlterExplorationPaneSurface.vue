<script setup lang="ts">
/**
 * Pane-level adapter for the Alter Exploration shell surface.
 *
 * This surface owns only the shell-facing wiring: it fetches the available
 * Alters, forwards workspace context into the exploration controller, and
 * renders the structured roundtable panel inside a dedicated tab.
 */
import { computed, onMounted } from 'vue'
import { useAlterManager } from '../composables/useAlterManager'
import AlterExplorationPanel from './AlterExplorationPanel.vue'

const props = defineProps<{
  workspacePath: string
  allWorkspaceFiles: string[]
  activeNotePath: string
}>()

const emit = defineEmits<{
  'open-note': [path: string]
}>()

const manager = useAlterManager()

const availableAlters = computed(() => manager.list.value)

onMounted(() => {
  void manager.refreshList()
})
</script>

<template>
  <div class="alter-exploration-pane-surface">
    <AlterExplorationPanel
      :workspace-path="props.workspacePath"
      :all-workspace-files="props.allWorkspaceFiles"
      :active-note-path="props.activeNotePath"
      :available-alters="availableAlters"
      @open-note="emit('open-note', $event)"
    />
  </div>
</template>

<style scoped>
.alter-exploration-pane-surface {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
</style>
