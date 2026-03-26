import type {
  AlterExplorationSession,
  AlterExplorationSessionSummary,
  CancelAlterExplorationSessionPayload,
  CreateAlterExplorationSessionPayload,
  RunAlterExplorationSessionPayload
} from '../../../shared/api/apiTypes'
import {
  cancelAlterExplorationSession,
  createAlterExplorationSession,
  listAlterExplorationSessions,
  loadAlterExplorationSession,
  runAlterExplorationSession
} from '../../../shared/api/alterExplorationIpcApi'

/**
 * Alter exploration transport adapter.
 *
 * Keeps IPC wiring out of the Alters domain workflows so UI composables can
 * stay focused on state transitions and orchestration.
 */
export async function fetchAlterExplorationSessions(limit = 40): Promise<AlterExplorationSessionSummary[]> {
  const sessions = await listAlterExplorationSessions()
  return sessions
    .slice(0, limit)
    .map((session) => ({
      id: session.id,
      workspace_path: session.workspace_path ?? session.workspace_id,
      subject_preview: session.subject.text.trim().slice(0, 96),
      alter_count: session.alter_ids.length,
      mode: session.mode,
      rounds: session.rounds,
      output_format: session.output_format,
      state: session.state,
      cancel_requested: session.cancel_requested ?? false,
      created_at_ms: session.created_at_ms,
      updated_at_ms: session.updated_at_ms
    }))
}

/**
 * Creates a new Alter exploration session in the backend.
 */
export async function createWorkspaceAlterExplorationSession(
  payload: CreateAlterExplorationSessionPayload
): Promise<AlterExplorationSession> {
  return await createAlterExplorationSession(payload)
}

/**
 * Loads a persisted Alter exploration session.
 */
export async function loadWorkspaceAlterExplorationSession(sessionId: string): Promise<AlterExplorationSession> {
  return await loadAlterExplorationSession(sessionId)
}

/**
 * Runs the orchestrated Alter exploration flow.
 */
export async function runWorkspaceAlterExplorationSession(
  payload: RunAlterExplorationSessionPayload
): Promise<AlterExplorationSession> {
  return await runAlterExplorationSession(payload)
}

/**
 * Requests cancellation for a running Alter exploration.
 */
export async function cancelWorkspaceAlterExplorationSession(
  payload: CancelAlterExplorationSessionPayload
): Promise<boolean> {
  return await cancelAlterExplorationSession(payload)
}
