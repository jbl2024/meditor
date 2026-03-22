/**
 * Frontmatter generation merge helpers.
 *
 * This module keeps the generated-property merge rules local to the editor
 * domain so the composable can stay focused on state orchestration.
 */
import type { FrontmatterField, FrontmatterStyleHint, FrontmatterValue } from './frontmatter'
import { defaultPropertyTypeForKey, normalizePropertyKey, type PropertyType } from './propertyTypes'
import type {
  FrontmatterGeneratedProperty,
  FrontmatterGenerationMode,
  FrontmatterGenerationValue
} from '../../../shared/api/frontmatterGenerationApi'

export type FrontmatterGenerationApplyResult = {
  fields: FrontmatterField[]
  appliedKeys: string[]
}

function valuesAreEqual(left: FrontmatterValue, right: FrontmatterValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    return left.every((item, index) => item === right[index])
  }
  return left === right
}

function isBlankValue(value: FrontmatterValue): boolean {
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim().length === 0
  return false
}

function normalizeGeneratedValue(type: PropertyType, value: FrontmatterGenerationValue): FrontmatterValue {
  if (type === 'checkbox') {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    return String(value).trim().toLowerCase() === 'true'
  }
  if (type === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    const parsed = Number(String(value).trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (type === 'list' || type === 'tags') {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean)
    }
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return String(value ?? '')
}

function normalizedGeneratedType(key: string, type: PropertyType): PropertyType {
  return defaultPropertyTypeForKey(key) ?? type
}

function fieldStyleForType(type: PropertyType): FrontmatterField['styleHint'] {
  if (type === 'list' || type === 'tags') return 'inline-list'
  return 'plain'
}

function updateField(field: FrontmatterField, generated: FrontmatterGeneratedProperty): FrontmatterField {
  const normalizedType = normalizedGeneratedType(generated.key, generated.type)
  const nextStyleHint: FrontmatterStyleHint =
    normalizedType === 'list' || normalizedType === 'tags'
      ? field.type === normalizedType
        ? field.styleHint
        : 'inline-list'
      : field.styleHint
  return {
    ...field,
    key: generated.key,
    type: normalizedType,
    value: normalizeGeneratedValue(normalizedType, generated.value),
    styleHint: nextStyleHint
  }
}

/**
 * Merges generated properties into the current frontmatter field list.
 *
 * Auto mode only fills blank or missing keys. Field mode replaces the target key
 * if it exists, otherwise appends it.
 */
export function mergeGeneratedFrontmatterProperties(
  fields: FrontmatterField[],
  generated: FrontmatterGeneratedProperty[],
  options: { mode: FrontmatterGenerationMode; targetKey?: string | null }
): FrontmatterGenerationApplyResult {
  const nextFields = [...fields]
  const appliedKeys: string[] = []
  const mode = options.mode
  const targetKey = normalizePropertyKey(options.targetKey ?? '')
  const existingIndexByKey = new Map<string, number>()

  nextFields.forEach((field, index) => {
    const normalized = normalizePropertyKey(field.key)
    if (normalized && !existingIndexByKey.has(normalized)) {
      existingIndexByKey.set(normalized, index)
    }
  })

  for (const item of generated) {
    const key = item.key.trim()
    if (!key) continue
    const normalizedKey = normalizePropertyKey(key)
    if (!normalizedKey) continue
    if (mode === 'field' && targetKey && normalizedKey !== targetKey) continue

    const normalizedType = normalizedGeneratedType(key, item.type)
    const nextGenerated: FrontmatterGeneratedProperty = {
      ...item,
      key,
      type: normalizedType,
      value: normalizeGeneratedValue(normalizedType, item.value)
    }

    const existingIndex = existingIndexByKey.get(normalizedKey)
    if (mode === 'auto') {
      if (typeof existingIndex === 'number') {
        const current = nextFields[existingIndex]!
        if (!isBlankValue(current.value)) {
          continue
        }
        const updated = updateField(current, nextGenerated)
        if (
          current.key === updated.key &&
          current.type === updated.type &&
          valuesAreEqual(current.value, updated.value)
        ) {
          continue
        }
        nextFields[existingIndex] = updated
        appliedKeys.push(updated.key)
        continue
      }

      nextFields.push({
        key,
        type: normalizedType,
        value: nextGenerated.value,
        order: nextFields.length,
        styleHint: fieldStyleForType(normalizedType)
      })
      existingIndexByKey.set(normalizedKey, nextFields.length - 1)
      appliedKeys.push(key)
      continue
    }

    if (typeof existingIndex === 'number') {
      const current = nextFields[existingIndex]!
      const updated = updateField(current, nextGenerated)
      if (
        current.key === updated.key &&
        current.type === updated.type &&
        valuesAreEqual(current.value, updated.value)
      ) {
        continue
      }
      nextFields[existingIndex] = updated
      appliedKeys.push(updated.key)
      continue
    }

    nextFields.push({
      key,
      type: normalizedType,
      value: nextGenerated.value,
      order: nextFields.length,
      styleHint: fieldStyleForType(normalizedType)
    })
    existingIndexByKey.set(normalizedKey, nextFields.length - 1)
    appliedKeys.push(key)
  }

  return {
    fields: nextFields.map((field, index) => ({
      ...field,
      order: index
    })),
    appliedKeys
  }
}
