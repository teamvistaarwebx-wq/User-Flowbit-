import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { parseRupees } from '@/lib/money'
import { INDIA_STATES, gstinMatchesState, stateByCode2, stateOfGstin } from '@/lib/india-states'

/** Shared zod helpers. Use them in action schemas so every form validates the same way. */

export const objectId = z.string().refine((v) => isValidObjectId(v), 'Choose a valid item')

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-20')
export const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, 'Use a month like 2026-10')
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30')

export const AMOUNT_ERROR = 'Enter an amount in rupees, e.g. 150000'

/**
 * Accepts rupees ("1,250.50" or 1250.5) and returns integer paise. Text such as
 * "1.5L" or "lots" is refused, not truncated; a blank string (JSON callers) is 0.
 */
export const paise = z
  .union([z.string(), z.number()], { error: AMOUNT_ERROR })
  .transform((v, ctx) => {
    const value = typeof v === 'string' && v.trim() === '' ? 0 : parseRupees(v)
    if (value !== null) return value
    ctx.addIssue({ code: 'custom', message: AMOUNT_ERROR })
    return z.NEVER
  })
  .refine((v) => v >= 0, 'Enter an amount of zero or more')

/** Integer paise as-is (for JSON payloads that already carry paise). */
export const paiseInt = z.number().int('Amounts are whole paise').min(0)

export const email = z.string().trim().toLowerCase().email('Enter a valid email address')
export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine((v) => /^(\+91)?[6-9]\d{9}$/.test(v) || /^\+?\d{8,15}$/.test(v), 'Enter a valid phone number')
export const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN')
export const pan = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid PAN like ABCDE1234F')
export const ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC like HDFC0001234')
export const pincode = z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit PIN code')
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters')
  .max(48, 'Use at most 48 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')

/** A required trimmed string with a friendly message. */
export const requiredText = (label: string, max = 200) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is too long`)

/** Optional trimmed string; blank becomes undefined. */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, 'This is too long')
    .optional()
    .transform((v) => (v ? v : undefined))

/** Checkbox/switch value from a form: 'on' | 'true' | '1' | true -> true; absent -> false. */
export const checkbox = z
  .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0'), z.boolean()])
  .optional()
  .transform((v) => v === true || v === 'on' || v === 'true' || v === '1')

/** Integer from a form field. */
export const intField = (label: string, min = 0, max = 1_000_000) =>
  z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min).max(max)

/** A list from repeated form keys or a single value. */
export const listOf = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(item))

/** Distinct values, first occurrence first. */
export const distinct = <T>(values: readonly T[]): T[] => [...new Set(values)]

/** `listOf` with a count cap, de-duplicated (R3 L-23g: no unbounded arrays in action input). */
export const cappedListOf = <T extends z.ZodType>(item: T, max: number) =>
  z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(item).max(max, `Pick at most ${max}`)).transform(distinct)

export { INDIA_STATES, STATE_OPTIONS, gstinMatchesState, stateByCode2, stateByGstCode, stateLabel, stateOfGstin, type IndiaState } from '@/lib/india-states'

/** Legacy lookup kept for existing callers: { MP: { name, gst: '23' } }. Prefer INDIA_STATES / stateByCode2. */
export const INDIAN_STATES: Record<string, { name: string; gst: string; isUT: boolean }> = Object.fromEntries(
  INDIA_STATES.map((s) => [s.code2, { name: s.name, gst: s.gstCode, isUT: s.isUT }]),
)

/** A 2-letter state code from the table ('mp' -> 'MP'). */
export const stateCode = z.string().trim().toUpperCase().refine((v) => Boolean(stateByCode2(v)), 'Choose a state')

/**
 * The field error when a GSTIN's first two digits don't match the chosen state,
 * or null when they agree (or either is blank). Use inside a zod superRefine.
 */
export function gstinStateIssue(gstinValue: string | undefined, code2: string | undefined): string | null {
  if (!gstinValue || !code2) return null
  if (gstinMatchesState(gstinValue, code2)) return null
  const registered = stateOfGstin(gstinValue)
  const chosen = stateByCode2(code2)
  return registered && chosen
    ? `This GSTIN is registered in ${registered.name} (${registered.gstCode}), but the state is ${chosen.name} (${chosen.gstCode}).`
    : 'This GSTIN does not match the state.'
}
