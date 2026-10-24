import type { Condition, Vars } from './types'

/**
 * Wording and conditions (pure, client-safe: the editor previews with the
 * same functions the engine sends with).
 */

const VARIABLE = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g

/** "Hi {{client_name}}" → "Hi Ravi". Unknown or empty variables become ''. */
export function renderTemplate(text: string, vars: Vars): string {
  return text.replace(VARIABLE, (_, key: string) => {
    const value = vars[key]
    return value === null || value === undefined ? '' : String(value)
  })
}

/** The variables a template uses, each once. */
export const templateVariables = (text: string): string[] => [...new Set([...text.matchAll(VARIABLE)].map((m) => m[1]))]

/** Variables a template uses that the recipe does not offer (typos), for the editor to flag. */
export const unknownVariables = (text: string, known: readonly string[]): string[] => templateVariables(text).filter((v) => !known.includes(v))

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

/** One condition against the run's values. Numbers compare as numbers, everything else as lower-case text. */
export function conditionHolds(condition: Condition, vars: Vars): boolean {
  const actual = vars[condition.field]
  if (condition.op === 'empty') return isEmpty(actual)
  if (condition.op === 'not_empty') return !isEmpty(actual)
  const a = asNumber(actual)
  const b = asNumber(condition.value)
  const text = (v: unknown) => (isEmpty(v) ? '' : String(v).trim().toLowerCase())
  switch (condition.op) {
    case 'eq':
      return a !== null && b !== null ? a === b : text(actual) === text(condition.value)
    case 'ne':
      return a !== null && b !== null ? a !== b : text(actual) !== text(condition.value)
    case 'contains':
      return text(actual).includes(text(condition.value))
    case 'gt':
      return a !== null && b !== null && a > b
    case 'gte':
      return a !== null && b !== null && a >= b
    case 'lt':
      return a !== null && b !== null && a < b
    case 'lte':
      return a !== null && b !== null && a <= b
  }
}

/** Every condition holds (no conditions: always). */
export const conditionsHold = (conditions: readonly Condition[], vars: Vars): boolean => conditions.every((c) => conditionHolds(c, vars))
