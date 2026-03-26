import { invoke } from '@tauri-apps/api/core'
import type {
  AlterExplorationSession,
  CancelAlterExplorationSessionPayload,
  CreateAlterExplorationSessionPayload,
  RunAlterExplorationSessionPayload
} from './apiTypes'

/**
 * Frontend IPC wrappers for Alter Exploration sessions.
 *
 * Transport stays here so the domain layer can focus on orchestration and UI
 * state instead of Tauri command naming.
 */

function normalizeInvokeError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === 'string' && err.trim()) return new Error(err.trim())
  try {
    const serialized = JSON.stringify(err)
    if (serialized && serialized !== '{}' && serialized !== 'null') {
      return new Error(serialized)
    }
  } catch {
    // Fall through to a generic IPC error.
  }
  return new Error('Alter Exploration IPC request failed.')
}

async function invokeExploration<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (err) {
    throw normalizeInvokeError(err)
  }
}

export async function createAlterExplorationSession(
  payload: CreateAlterExplorationSessionPayload
): Promise<AlterExplorationSession> {
  return await invokeExploration('create_alter_exploration_session', { payload })
}

export async function loadAlterExplorationSession(sessionId: string): Promise<AlterExplorationSession> {
  return await invokeExploration('load_alter_exploration_session', { payload: { session_id: sessionId } })
}

export async function listAlterExplorationSessions(): Promise<AlterExplorationSession[]> {
  return await invokeExploration('list_alter_exploration_sessions')
}

export async function runAlterExplorationSession(
  payload: RunAlterExplorationSessionPayload
): Promise<AlterExplorationSession> {
  return await invokeExploration('run_alter_exploration_session', { payload })
}

export async function cancelAlterExplorationSession(
  payload: CancelAlterExplorationSessionPayload
): Promise<boolean> {
  return await invokeExploration('cancel_alter_exploration_session', { payload })
}
