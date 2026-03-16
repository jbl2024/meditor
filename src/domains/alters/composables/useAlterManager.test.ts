import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createAlterDraft, useAlterManager } from './useAlterManager'
import * as altersApi from '../lib/altersApi'

vi.mock('../lib/altersApi', () => ({
  fetchAlterList: vi.fn(),
  fetchAlter: vi.fn(),
  fetchAlterRevisions: vi.fn(),
  fetchAlterRevision: vi.fn(),
  createWorkspaceAlter: vi.fn(),
  updateWorkspaceAlter: vi.fn(),
  deleteWorkspaceAlter: vi.fn(),
  duplicateWorkspaceAlter: vi.fn(),
  generateWorkspaceAlterDraft: vi.fn(),
  previewWorkspaceAlter: vi.fn()
}))

describe('useAlterManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createAlterDraft', () => {
    it('creates a draft with empty blind_spots array', () => {
      const draft = createAlterDraft()
      expect(draft.blind_spots).toEqual([])
    })

    it('creates a draft with empty system_hints array', () => {
      const draft = createAlterDraft()
      expect(draft.system_hints).toEqual([])
    })

    it('creates a draft with all required fields', () => {
      const draft = createAlterDraft()
      expect(draft.name).toBe('')
      expect(draft.description).toBe('')
      expect(draft.mission).toBe('')
      expect(draft.principles).toEqual([])
      expect(draft.reflexes).toEqual([])
      expect(draft.values).toEqual([])
      expect(draft.critiques).toEqual([])
      expect(draft.blind_spots).toEqual([])
      expect(draft.system_hints).toEqual([])
      expect(draft.style).toBeDefined()
      expect(draft.is_favorite).toBe(false)
    })
  })

  describe('openEditWizard', () => {
    it('copies blind_spots from activeAlter to draft', () => {
      const manager = useAlterManager()
      const testBlindSpots = ['May over-optimize', 'Underplays exploratory design']
      manager.activeAlter.value = {
        id: 'test-id',
        name: 'Test Alter',
        slug: 'test-alter',
        description: 'Test description',
        icon: null,
        color: null,
        category: null,
        mission: 'Test mission',
        inspirations: [],
        principles: [],
        reflexes: [],
        values: [],
        critiques: [],
        blind_spots: testBlindSpots,
        system_hints: [],
        style: {
          tone: 'neutral',
          verbosity: 'medium',
          contradiction_level: 50,
          exploration_level: 50,
          influence_intensity: 'balanced',
          response_style: 'analytic',
          cite_hypotheses: true,
          signal_biases: true
        },
        invocation_prompt: '',
        is_favorite: false,
        is_built_in: false,
        created_at_ms: Date.now(),
        updated_at_ms: Date.now()
      }
      manager.openEditWizard()
      expect(manager.draft.value.blind_spots).toEqual(testBlindSpots)
    })

    it('copies system_hints from activeAlter to draft', () => {
      const manager = useAlterManager()
      const testSystemHints = ['Keep it Tomosona-native', 'Avoid direct imitation']
      manager.activeAlter.value = {
        id: 'test-id',
        name: 'Test Alter',
        slug: 'test-alter',
        description: 'Test description',
        icon: null,
        color: null,
        category: null,
        mission: 'Test mission',
        inspirations: [],
        principles: [],
        reflexes: [],
        values: [],
        critiques: [],
        blind_spots: [],
        system_hints: testSystemHints,
        style: {
          tone: 'neutral',
          verbosity: 'medium',
          contradiction_level: 50,
          exploration_level: 50,
          influence_intensity: 'balanced',
          response_style: 'analytic',
          cite_hypotheses: true,
          signal_biases: true
        },
        invocation_prompt: '',
        is_favorite: false,
        is_built_in: false,
        created_at_ms: Date.now(),
        updated_at_ms: Date.now()
      }
      manager.openEditWizard()
      expect(manager.draft.value.system_hints).toEqual(testSystemHints)
    })

    it('creates a new array reference for blind_spots', () => {
      const manager = useAlterManager()
      const originalBlindSpots = ['Original blind spot']
      manager.activeAlter.value = {
        id: 'test-id',
        name: 'Test Alter',
        slug: 'test-alter',
        description: 'Test description',
        icon: null,
        color: null,
        category: null,
        mission: 'Test mission',
        inspirations: [],
        principles: [],
        reflexes: [],
        values: [],
        critiques: [],
        blind_spots: originalBlindSpots,
        system_hints: [],
        style: {
          tone: 'neutral',
          verbosity: 'medium',
          contradiction_level: 50,
          exploration_level: 50,
          influence_intensity: 'balanced',
          response_style: 'analytic',
          cite_hypotheses: true,
          signal_biases: true
        },
        invocation_prompt: '',
        is_favorite: false,
        is_built_in: false,
        created_at_ms: Date.now(),
        updated_at_ms: Date.now()
      }
      manager.openEditWizard()
      expect(manager.draft.value.blind_spots).not.toBe(originalBlindSpots)
      expect(manager.draft.value.blind_spots).toEqual(originalBlindSpots)
    })

    it('creates a new array reference for system_hints', () => {
      const manager = useAlterManager()
      const originalSystemHints = ['Original hint']
      manager.activeAlter.value = {
        id: 'test-id',
        name: 'Test Alter',
        slug: 'test-alter',
        description: 'Test description',
        icon: null,
        color: null,
        category: null,
        mission: 'Test mission',
        inspirations: [],
        principles: [],
        reflexes: [],
        values: [],
        critiques: [],
        blind_spots: [],
        system_hints: originalSystemHints,
        style: {
          tone: 'neutral',
          verbosity: 'medium',
          contradiction_level: 50,
          exploration_level: 50,
          influence_intensity: 'balanced',
          response_style: 'analytic',
          cite_hypotheses: true,
          signal_biases: true
        },
        invocation_prompt: '',
        is_favorite: false,
        is_built_in: false,
        created_at_ms: Date.now(),
        updated_at_ms: Date.now()
      }
      manager.openEditWizard()
      expect(manager.draft.value.system_hints).not.toBe(originalSystemHints)
      expect(manager.draft.value.system_hints).toEqual(originalSystemHints)
    })
  })

  describe('saveDraft', () => {
    it('includes blind_spots and system_hints in update payload', async () => {
      const mockUpdate = vi.mocked(altersApi.updateWorkspaceAlter).mockResolvedValue({
        id: 'test-id',
        name: 'Updated Alter',
        slug: 'updated-alter',
        description: 'Updated description',
        icon: null,
        color: null,
        category: null,
        mission: 'Updated mission',
        inspirations: [],
        principles: [],
        reflexes: [],
        values: [],
        critiques: [],
        blind_spots: ['Test blind spot'],
        system_hints: ['Test hint'],
        style: {
          tone: 'neutral',
          verbosity: 'medium',
          contradiction_level: 50,
          exploration_level: 50,
          influence_intensity: 'balanced',
          response_style: 'analytic',
          cite_hypotheses: true,
          signal_biases: true
        },
        invocation_prompt: '',
        is_favorite: false,
        is_built_in: false,
        created_at_ms: Date.now(),
        updated_at_ms: Date.now()
      })

      const manager = useAlterManager()
      manager.activeAlter.value = {
        id: 'test-id',
        name: 'Test Alter',
        slug: 'test-alter',
        description: 'Test description',
        icon: null,
        color: null,
        category: null,
        mission: 'Test mission',
        inspirations: [],
        principles: [],
        reflexes: [],
        values: [],
        critiques: [],
        blind_spots: [],
        system_hints: [],
        style: {
          tone: 'neutral',
          verbosity: 'medium',
          contradiction_level: 50,
          exploration_level: 50,
          influence_intensity: 'balanced',
          response_style: 'analytic',
          cite_hypotheses: true,
          signal_biases: true
        },
        invocation_prompt: '',
        is_favorite: false,
        is_built_in: false,
        created_at_ms: Date.now(),
        updated_at_ms: Date.now()
      }
      manager.openEditWizard()
      manager.draft.value.blind_spots = ['Test blind spot']
      manager.draft.value.system_hints = ['Test hint']
      manager.wizardMode.value = 'edit'

      await manager.saveDraft()

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-id',
        blind_spots: ['Test blind spot'],
        system_hints: ['Test hint']
      }))
    })
  })
})
