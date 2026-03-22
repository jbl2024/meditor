/**
 * Frontend IPC wrapper for AI-assisted frontmatter generation.
 *
 * This stays transport-only so the editor composable can own merge behavior
 * while the backend owns provider access and strict JSON parsing.
 */
import { invoke } from '@tauri-apps/api/core'
import type { FrontmatterField } from '../../domains/editor/lib/frontmatter'
import type { PropertyType } from '../../domains/editor/lib/propertyTypes'

export type FrontmatterGenerationMode = 'auto' | 'field'

export type FrontmatterGenerationExistingField = {
  key: string
  type: PropertyType
  value: string
}

export type FrontmatterGenerationRequest = {
  path: string
  title: string
  body_markdown: string
  raw_yaml: string
  existing_fields: FrontmatterGenerationExistingField[]
  mode: FrontmatterGenerationMode
  target_key?: string | null
  language_hint?: string | null
}

export type FrontmatterGenerationValue = string | number | boolean | string[]

export type FrontmatterGeneratedProperty = {
  key: string
  type: PropertyType
  value: FrontmatterGenerationValue
}

export type FrontmatterGenerationResponse = {
  language: string
  properties: FrontmatterGeneratedProperty[]
}

function normalizeInvokeError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === 'string' && err.trim()) return new Error(err.trim())
  try {
    const serialized = JSON.stringify(err)
    if (serialized && serialized !== '{}' && serialized !== 'null') {
      return new Error(serialized)
    }
  } catch {
    // Fall through to the generic IPC failure.
  }
  return new Error('Frontmatter generation IPC request failed.')
}

/**
 * Requests AI-generated frontmatter properties from the backend LLM workflow.
 */
export async function generateFrontmatterProperties(
  payload: FrontmatterGenerationRequest
): Promise<FrontmatterGenerationResponse> {
  try {
    return await invoke<FrontmatterGenerationResponse>('generate_frontmatter_properties', { payload })
  } catch (err) {
    throw normalizeInvokeError(err)
  }
}

/**
 * Serializes an editor field into the compact value shape expected by the backend request.
 */
export function serializeFrontmatterGenerationField(field: FrontmatterField): FrontmatterGenerationExistingField {
  const value = Array.isArray(field.value)
    ? field.value.join(', ')
    : typeof field.value === 'boolean'
      ? (field.value ? 'true' : 'false')
      : String(field.value ?? '')
  return {
    key: field.key,
    type: field.type,
    value
  }
}
