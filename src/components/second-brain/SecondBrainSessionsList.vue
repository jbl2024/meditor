<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SecondBrainSessionSummary } from '../../lib/api'

const props = defineProps<{
  sessions: SecondBrainSessionSummary[]
  activeSessionId: string
  loading: boolean
}>()

const emit = defineEmits<{
  select: [sessionId: string]
  create: []
}>()

const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.sessions
  return props.sessions.filter((item) => item.title.toLowerCase().includes(q) || item.session_id.toLowerCase().includes(q))
})

function dateLabel(ts: number): string {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <section class="sb-sessions">
    <div class="sb-sessions-head">
      <input v-model="query" class="sb-input" type="text" placeholder="Rechercher session...">
      <button type="button" class="sb-btn" @click="emit('create')">Nouveau</button>
    </div>

    <div class="sb-list">
      <p v-if="loading" class="sb-empty">Chargement sessions...</p>
      <button
        v-for="session in filtered"
        :key="session.session_id"
        type="button"
        class="sb-session-item"
        :class="{ active: session.session_id === activeSessionId }"
        @click="emit('select', session.session_id)"
      >
        <strong>{{ session.title || 'Session' }}</strong>
        <span>{{ dateLabel(session.updated_at_ms) }}</span>
      </button>
      <p v-if="!loading && !filtered.length" class="sb-empty">Aucune session</p>
    </div>
  </section>
</template>

<style scoped>
.sb-sessions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.sb-sessions-head {
  display: flex;
  gap: 6px;
}
.sb-input {
  flex: 1;
  height: 30px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
  padding: 0 8px;
}
.sb-btn {
  height: 30px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  padding: 0 10px;
  font-size: 12px;
}
.sb-list {
  overflow: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sb-session-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
  font-size: 12px;
  text-align: left;
}
.sb-session-item.active {
  border-color: #2563eb;
  background: #eff6ff;
}
.sb-empty {
  color: #64748b;
  margin: 0;
  font-size: 12px;
}
:global(.ide-root.dark) .sb-input,
:global(.ide-root.dark) .sb-btn,
:global(.ide-root.dark) .sb-session-item {
  border-color: #334155;
  background: #0f172a;
  color: #e2e8f0;
}
:global(.ide-root.dark) .sb-session-item.active {
  border-color: #38bdf8;
  background: #082f49;
}
</style>
