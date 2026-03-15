import {
  createAlter,
  deleteAlter,
  duplicateAlter,
  generateAlterDraft,
  listAlterRevisions,
  listAlters,
  loadAlter,
  loadAlterRevision,
  previewAlter,
  updateAlter
} from '../../../shared/api/altersIpcApi'
import type {
  AlterPayload,
  AlterRevisionPayload,
  AlterRevisionSummary,
  AlterSummary,
  CreateAlterPayload,
  GenerateAlterDraftPayload,
  PreviewAlterPayload,
  PreviewAlterResult,
  UpdateAlterPayload
} from '../../../shared/api/apiTypes'

/**
 * High-level Alters domain API surface.
 */

export async function fetchAlterList(): Promise<AlterSummary[]> {
  return await listAlters()
}

export async function fetchAlter(alterId: string): Promise<AlterPayload> {
  return await loadAlter(alterId)
}

export async function createWorkspaceAlter(payload: CreateAlterPayload): Promise<AlterPayload> {
  return await createAlter(payload)
}

export async function updateWorkspaceAlter(payload: UpdateAlterPayload): Promise<AlterPayload> {
  return await updateAlter(payload)
}

export async function duplicateWorkspaceAlter(alterId: string): Promise<AlterPayload> {
  return await duplicateAlter(alterId)
}

export async function deleteWorkspaceAlter(alterId: string): Promise<void> {
  await deleteAlter(alterId)
}

export async function fetchAlterRevisions(alterId: string): Promise<AlterRevisionSummary[]> {
  return await listAlterRevisions(alterId)
}

export async function fetchAlterRevision(revisionId: string): Promise<AlterRevisionPayload> {
  return await loadAlterRevision(revisionId)
}

export async function previewWorkspaceAlter(payload: PreviewAlterPayload): Promise<PreviewAlterResult> {
  return await previewAlter(payload)
}

export async function generateWorkspaceAlterDraft(payload: GenerateAlterDraftPayload): Promise<CreateAlterPayload> {
  return await generateAlterDraft(payload)
}
