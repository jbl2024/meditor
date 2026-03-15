import { invoke } from '@tauri-apps/api/core'
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
} from './apiTypes'

/**
 * Frontend IPC wrappers for the Alters workspace domain.
 */

export async function listAlters(): Promise<AlterSummary[]> {
  return await invoke('list_alters')
}

export async function createAlter(payload: CreateAlterPayload): Promise<AlterPayload> {
  return await invoke('create_alter', { payload })
}

export async function loadAlter(alterId: string): Promise<AlterPayload> {
  return await invoke('load_alter', { alterId })
}

export async function updateAlter(payload: UpdateAlterPayload): Promise<AlterPayload> {
  return await invoke('update_alter', { payload })
}

export async function deleteAlter(alterId: string): Promise<void> {
  await invoke('delete_alter', { alterId })
}

export async function duplicateAlter(alterId: string): Promise<AlterPayload> {
  return await invoke('duplicate_alter', { alterId })
}

export async function listAlterRevisions(alterId: string): Promise<AlterRevisionSummary[]> {
  return await invoke('list_alter_revisions', { alterId })
}

export async function loadAlterRevision(revisionId: string): Promise<AlterRevisionPayload> {
  return await invoke('load_alter_revision', { revisionId })
}

export async function previewAlter(payload: PreviewAlterPayload): Promise<PreviewAlterResult> {
  return await invoke('preview_alter', { payload })
}

export async function generateAlterDraft(payload: GenerateAlterDraftPayload): Promise<CreateAlterPayload> {
  return await invoke('generate_alter_draft', { payload })
}
