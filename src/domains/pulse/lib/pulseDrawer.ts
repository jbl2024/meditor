/**
 * Shared contract for hosting the editor-owned Pulse workflow in shell chrome.
 */
import type { PulseActionId, PulseSourceKind } from '../../../shared/api/apiTypes'
import type { PulseApplyMode } from './pulse'

/** Pulse sources the editor drawer can host and apply back into a note. */
export type PulseDrawerSourceKind = Extract<PulseSourceKind, 'editor_selection' | 'editor_note' | 'second_brain_context'>

/** Serializable Pulse UI state mirrored from the active editor into the right drawer. */
export type PulseDrawerState = {
  open: boolean
  sourceKind: PulseDrawerSourceKind
  actionId: PulseActionId
  instruction: string
  previewMarkdown: string
  provenancePaths: string[]
  running: boolean
  error: string
  sourceText: string
  applyModes: PulseApplyMode[]
  primaryApplyMode: PulseApplyMode
}

/** Builds the inert drawer state used when no active editor has Pulse open. */
export function createClosedPulseDrawerState(): PulseDrawerState {
  return {
    open: false,
    sourceKind: 'editor_selection',
    actionId: 'rewrite',
    instruction: '',
    previewMarkdown: '',
    provenancePaths: [],
    running: false,
    error: '',
    sourceText: '',
    applyModes: ['replace_selection', 'insert_below', 'send_to_second_brain'],
    primaryApplyMode: 'replace_selection'
  }
}

/** Compares mirrored drawer snapshots so shell updates can avoid render loops. */
export function pulseDrawerStatesEqual(left: PulseDrawerState, right: PulseDrawerState): boolean {
  return left.open === right.open &&
    left.sourceKind === right.sourceKind &&
    left.actionId === right.actionId &&
    left.instruction === right.instruction &&
    left.previewMarkdown === right.previewMarkdown &&
    left.running === right.running &&
    left.error === right.error &&
    left.sourceText === right.sourceText &&
    left.primaryApplyMode === right.primaryApplyMode &&
    left.provenancePaths.length === right.provenancePaths.length &&
    left.provenancePaths.every((path, index) => path === right.provenancePaths[index]) &&
    left.applyModes.length === right.applyModes.length &&
    left.applyModes.every((mode, index) => mode === right.applyModes[index])
}
