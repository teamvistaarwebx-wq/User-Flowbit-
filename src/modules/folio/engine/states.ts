import { INDIA_STATES } from '@/lib/india-states'

/**
 * GST state codes for Folio. Records store the core 2-letter code (`MP`);
 * GST maths and place of supply use the numeric code (`23`). This adds the
 * alternative letter codes found on old records (OR, CT, UT, DD, DH, TG) and
 * the UTGST label for union territories without a legislature.
 */

export type GstState = { code: string; name: string; letters: string[]; utgst: boolean }

const ALIASES: Record<string, string[]> = { '21': ['OR'], '22': ['CT'], '05': ['UT'], '26': ['DH', 'DD'], '36': ['TG'] }
/** Union territories without a legislature print UTGST where others print SGST. */
const UTGST_CODES = new Set(['04', '26', '31', '35', '38', '97'])

export const STATES: readonly GstState[] = INDIA_STATES.map((s) => ({
  code: s.gstCode,
  name: s.name,
  letters: [s.code2, ...(ALIASES[s.gstCode] ?? [])],
  utgst: UTGST_CODES.has(s.gstCode),
}))

const BY_CODE = new Map(STATES.map((s) => [s.code, s]))
const BY_LETTERS = new Map(STATES.flatMap((s) => s.letters.map((l) => [l, s] as const)))
const BY_NAME = new Map(STATES.map((s) => [s.name.toLowerCase(), s]))

export const stateByCode = (code: string | null | undefined): GstState | undefined => (code ? BY_CODE.get(code.trim().padStart(2, '0')) : undefined)

/** 'MP' / 'mp' / 'OR' -> '23' / '21'; null when unknown. */
export function gstCodeFromStateLetters(letters: string | null | undefined): string | null {
  return letters ? (BY_LETTERS.get(letters.trim().toUpperCase())?.code ?? null) : null
}

/** Letters, a full name or a numeric code -> GST code; null when unknown. */
export function gstCodeFromAny(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  if (/^\d{1,2}$/.test(v)) return stateByCode(v)?.code ?? null
  return gstCodeFromStateLetters(v) ?? BY_NAME.get(v.toLowerCase())?.code ?? null
}

/** '23' -> 'MP' (the core 2-letter code). */
export const lettersOfGstCode = (code: string | null | undefined): string | null => stateByCode(code)?.letters[0] ?? null

export const stateName = (code: string | null | undefined): string => stateByCode(code)?.name ?? ''

/** "Madhya Pradesh (23)"; the raw code when unknown; '' when empty. */
export function stateLabelOf(code: string | null | undefined): string {
  if (!code) return ''
  const state = stateByCode(code)
  return state ? `${state.name} (${state.code})` : code
}

/** "23-Madhya Pradesh" (GSTR-1 place of supply format). */
export const placeOfSupplyLabel = (code: string | null | undefined): string => (code ? `${code}-${stateName(code)}` : '')

/** SGST or UTGST for an intra-state supply in this place. */
export const sgstLabel = (code: string | null | undefined): 'SGST' | 'UTGST' => (stateByCode(code)?.utgst ? 'UTGST' : 'SGST')

/** Options for a place-of-supply select (value = GST code). */
export const GST_STATE_OPTIONS = STATES.filter((s) => s.code !== '97').map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))
