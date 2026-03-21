import { computed, ref } from 'vue'
import type {
  AlterPayload,
  AlterRevisionPayload,
  AlterRevisionSummary,
  AlterStyle,
  AlterSummary,
  CreateAlterPayload,
  PreviewAlterResult,
  UpdateAlterPayload
} from '../../../shared/api/apiTypes'
import {
  createWorkspaceAlter,
  deleteWorkspaceAlter,
  duplicateWorkspaceAlter,
  fetchAlter,
  fetchAlterList,
  fetchAlterRevision,
  fetchAlterRevisions,
  generateWorkspaceAlterDraft,
  previewWorkspaceAlter,
  updateWorkspaceAlter
} from '../lib/altersApi'

/**
 * Alters manager workflow state for list/detail/wizard operations.
 */

const DEFAULT_STYLE: AlterStyle = {
  tone: 'strategic',
  verbosity: 'medium',
  temperature: 0.15,
  contradiction_level: 55,
  exploration_level: 60,
  influence_intensity: 'balanced',
  response_style: 'analytic',
  cite_hypotheses: true,
  signal_biases: true
}

export function createAlterDraft(): CreateAlterPayload {
  return {
    name: '',
    description: '',
    icon: null,
    color: '#8d6e63',
    category: '',
    mission: '',
    inspirations: [],
    principles: [],
    reflexes: [],
    values: [],
    critiques: [],
    blind_spots: [],
    system_hints: [],
    style: { ...DEFAULT_STYLE },
    is_favorite: false
  }
}

export function useAlterManager() {
  const list = ref<AlterSummary[]>([])
  const activeAlter = ref<AlterPayload | null>(null)
  const revisions = ref<AlterRevisionSummary[]>([])
  const preview = ref<PreviewAlterResult | null>(null)
  const previewRevision = ref<AlterRevisionPayload | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const generating = ref(false)
  const error = ref('')
  const wizardOpen = ref(false)
  const wizardStep = ref(0)
  const wizardMode = ref<'create' | 'edit'>('create')
  const draft = ref<CreateAlterPayload>(createAlterDraft())

  const hasActiveAlter = computed(() => Boolean(activeAlter.value))

  async function refreshList(selectId?: string) {
    loading.value = true
    error.value = ''
    try {
      list.value = await fetchAlterList()
      const nextId = selectId ?? activeAlter.value?.id ?? list.value[0]?.id ?? ''
      if (nextId) {
        await selectAlter(nextId)
      } else {
        activeAlter.value = null
        revisions.value = []
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not load Alters.'
    } finally {
      loading.value = false
    }
  }

  async function selectAlter(alterId: string) {
    if (!alterId.trim()) return
    loading.value = true
    error.value = ''
    try {
      const [alter, nextRevisions] = await Promise.all([
        fetchAlter(alterId),
        fetchAlterRevisions(alterId)
      ])
      activeAlter.value = alter
      revisions.value = nextRevisions
      previewRevision.value = null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not load Alter.'
    } finally {
      loading.value = false
    }
  }

  function openCreateWizard() {
    wizardMode.value = 'create'
    wizardStep.value = 0
    draft.value = createAlterDraft()
    preview.value = null
    wizardOpen.value = true
  }

  function openEditWizard() {
    if (!activeAlter.value) return
    wizardMode.value = 'edit'
    wizardStep.value = 0
    draft.value = {
      name: activeAlter.value.name,
      description: activeAlter.value.description,
      icon: activeAlter.value.icon,
      color: activeAlter.value.color,
      category: activeAlter.value.category ?? '',
      mission: activeAlter.value.mission,
      inspirations: activeAlter.value.inspirations,
      principles: [...activeAlter.value.principles],
      reflexes: [...activeAlter.value.reflexes],
      values: [...activeAlter.value.values],
      critiques: [...activeAlter.value.critiques],
      blind_spots: [...activeAlter.value.blind_spots],
      system_hints: [...activeAlter.value.system_hints],
      style: { ...activeAlter.value.style },
      is_favorite: activeAlter.value.is_favorite
    }
    preview.value = null
    wizardOpen.value = true
  }

  async function runPreview(prompt: string) {
    preview.value = await previewWorkspaceAlter({ draft: draft.value, prompt })
  }

  async function saveDraft() {
    saving.value = true
    error.value = ''
    try {
      let result: AlterPayload
      if (wizardMode.value === 'edit' && activeAlter.value) {
        const payload: UpdateAlterPayload = {
          id: activeAlter.value.id,
          revision_reason: 'manual_save',
          ...draft.value
        }
        result = await updateWorkspaceAlter(payload)
      } else {
        result = await createWorkspaceAlter(draft.value)
      }
      wizardOpen.value = false
      await refreshList(result.id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not save Alter.'
    } finally {
      saving.value = false
    }
  }

  async function quickStartCreate(prompt: string) {
    const normalized = prompt.trim()
    if (!normalized) {
      error.value = 'Quick start prompt is required.'
      return
    }

    generating.value = true
    error.value = ''
    try {
      const generatedDraft = await generateWorkspaceAlterDraft({ prompt: normalized })
      draft.value = generatedDraft
      const created = await createWorkspaceAlter(generatedDraft)
      wizardOpen.value = false
      await refreshList(created.id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not generate Alter.'
    } finally {
      generating.value = false
    }
  }

  async function duplicateActiveAlter() {
    if (!activeAlter.value) return
    const duplicated = await duplicateWorkspaceAlter(activeAlter.value.id)
    await refreshList(duplicated.id)
  }

  async function deleteActiveAlter() {
    if (!activeAlter.value) return
    await deleteWorkspaceAlter(activeAlter.value.id)
    await refreshList()
  }

  async function openRevision(revisionId: string) {
    previewRevision.value = await fetchAlterRevision(revisionId)
  }

  return {
    list,
    activeAlter,
    revisions,
    preview,
    previewRevision,
    loading,
    saving,
    generating,
    error,
    wizardOpen,
    wizardStep,
    wizardMode,
    draft,
    hasActiveAlter,
    refreshList,
    selectAlter,
    openCreateWizard,
    openEditWizard,
    runPreview,
    saveDraft,
    quickStartCreate,
    duplicateActiveAlter,
    deleteActiveAlter,
    openRevision
  }
}
