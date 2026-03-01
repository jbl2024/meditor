<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SecondBrainContextItem } from '../../lib/api'

const props = defineProps<{
  contextItems: SecondBrainContextItem[]
  allFiles: string[]
  tokenEstimate: number
}>()

const emit = defineEmits<{
  'replace-context': [paths: string[]]
}>()

const query = ref('')

const filteredCandidates = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.allFiles.slice(0, 120)
  return props.allFiles.filter((path) => path.toLowerCase().includes(q)).slice(0, 120)
})

function removePath(path: string) {
  const next = props.contextItems.map((item) => item.path).filter((item) => item !== path)
  emit('replace-context', next)
}

function addPath(path: string) {
  const set = new Set(props.contextItems.map((item) => item.path))
  set.add(path)
  emit('replace-context', Array.from(set))
}
</script>

<template>
  <section class="sb-context-panel">
    <div class="sb-context-head">
      <h3>Contexte actif</h3>
      <p>~{{ tokenEstimate }} tokens</p>
    </div>

    <input v-model="query" class="sb-input" type="text" placeholder="Ajouter une note...">

    <div class="sb-context-list">
      <div v-for="item in contextItems" :key="item.path" class="sb-context-card">
        <div class="sb-context-meta">
          <strong>{{ item.path.split('/').pop() }}</strong>
          <span>{{ item.path }}</span>
        </div>
        <button type="button" class="sb-mini-btn" @click="removePath(item.path)">Retirer</button>
      </div>
      <p v-if="!contextItems.length" class="sb-empty">Aucune note dans le contexte</p>
    </div>

    <div class="sb-candidate-list">
      <button
        v-for="path in filteredCandidates"
        :key="path"
        type="button"
        class="sb-candidate-item"
        @click="addPath(path)"
      >
        {{ path }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.sb-context-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.sb-context-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.sb-context-head h3,
.sb-context-head p {
  margin: 0;
  font-size: 12px;
}
.sb-input {
  width: 100%;
  height: 30px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
  padding: 0 8px;
}
.sb-context-list,
.sb-candidate-list {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  overflow: auto;
  min-height: 120px;
  max-height: 240px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
}
.sb-context-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.sb-context-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sb-context-meta span {
  color: #64748b;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sb-mini-btn,
.sb-candidate-item {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  font-size: 11px;
  padding: 4px 8px;
  text-align: left;
}
.sb-empty {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}
:global(.ide-root.dark) .sb-input,
:global(.ide-root.dark) .sb-context-list,
:global(.ide-root.dark) .sb-candidate-list,
:global(.ide-root.dark) .sb-context-card,
:global(.ide-root.dark) .sb-mini-btn,
:global(.ide-root.dark) .sb-candidate-item {
  border-color: #334155;
  background: #0f172a;
  color: #e2e8f0;
}
:global(.ide-root.dark) .sb-context-meta span,
:global(.ide-root.dark) .sb-empty {
  color: #94a3b8;
}
</style>
