<script setup lang="ts">
import { computed, ref } from 'vue'
import UiFilterableDropdown, { type FilterableDropdownItem } from '../ui/UiFilterableDropdown.vue'
import type { SecondBrainSessionSummary } from '../../lib/api'

type SessionDropdownItem = FilterableDropdownItem & {
  sessionId: string
  title: string
  updatedAtMs: number
}

const props = defineProps<{
  sessions: SecondBrainSessionSummary[]
  activeSessionId: string
  loading: boolean
}>()

const emit = defineEmits<{
  select: [sessionId: string]
  create: []
  delete: [sessionId: string]
}>()

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)

const items = computed<SessionDropdownItem[]>(() =>
  [...props.sessions]
    .sort((left, right) => right.updated_at_ms - left.updated_at_ms)
    .map((session) => ({
      id: session.session_id,
      label: `${session.title || 'Session'} ${session.session_id}`,
      sessionId: session.session_id,
      title: session.title || 'Session',
      updatedAtMs: session.updated_at_ms
    }))
)

const activeLabel = computed(() => {
  const active = props.sessions.find((item) => item.session_id === props.activeSessionId)
  if (!active) return 'Select session'
  return active.title || 'Second Brain Session'
})

function dateLabel(ts: number): string {
  return new Date(ts).toLocaleString()
}

function onSelect(item: SessionDropdownItem) {
  emit('select', item.sessionId)
}

function onDelete(sessionId: string) {
  emit('delete', sessionId)
}

function onCreate() {
  emit('create')
  open.value = false
}
</script>

<template>
  <UiFilterableDropdown
    :items="items"
    :model-value="open"
    :query="query"
    :active-index="activeIndex"
    filter-placeholder="Search sessions..."
    :show-filter="true"
    :max-height="280"
    @open-change="open = $event"
    @query-change="query = $event"
    @active-index-change="activeIndex = $event"
    @select="onSelect($event as SessionDropdownItem)"
  >
    <template #trigger="{ toggleMenu }">
      <button
        type="button"
        class="sb-session-trigger"
        :disabled="loading"
        @click="toggleMenu"
      >
        <span class="label">{{ activeLabel }}</span>
        <span class="chevron">▾</span>
      </button>
    </template>

    <template #item="{ item }">
      <div class="sb-session-option" :data-active="item.sessionId === activeSessionId ? 'true' : 'false'">
        <div class="meta">
          <strong>{{ item.title }}</strong>
          <span>{{ dateLabel(item.updatedAtMs) }}</span>
        </div>
        <span
          class="delete"
          role="button"
          tabindex="0"
          title="Delete session"
          @mousedown.stop
          @click.stop.prevent="onDelete(item.sessionId)"
          @keydown.enter.prevent.stop="onDelete(item.sessionId)"
        >×</span>
      </div>
    </template>

    <template #empty>
      <span>{{ loading ? 'Loading sessions...' : 'No session found' }}</span>
    </template>

    <template #footer>
      <button type="button" class="sb-create-session" @click="onCreate">+ New session</button>
    </template>
  </UiFilterableDropdown>
</template>

<style scoped>
.sb-session-trigger {
  min-width: 240px;
  max-width: 420px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  padding: 6px 10px;
}

.sb-session-trigger .label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-session-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sb-session-option[data-active='true'] strong {
  color: #1d4ed8;
}

.sb-session-option .meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sb-session-option .meta strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-session-option .meta span {
  font-size: 11px;
  color: #64748b;
}

.sb-session-option .delete {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #b91c1c;
  background: #fff1f2;
  border: 1px solid #fecaca;
}

.sb-create-session {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  padding: 6px 8px;
  text-align: left;
}

:global(.ide-root.dark) .sb-session-trigger,
:global(.ide-root.dark) .sb-create-session {
  border-color: #334155;
  background: #0f172a;
  color: #e2e8f0;
}

:global(.ide-root.dark) .sb-session-option .meta span {
  color: #94a3b8;
}

:global(.ide-root.dark) .sb-session-option[data-active='true'] strong {
  color: #93c5fd;
}

:global(.ide-root.dark) .sb-session-option .delete {
  color: #fca5a5;
  background: #3f1d24;
  border-color: #7f1d1d;
}
</style>
