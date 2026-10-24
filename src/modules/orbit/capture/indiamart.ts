import { draftFromFields, type LeadDraft } from './map'

/**
 * IndiaMART Lead Manager pull API (pure adapter). Checked on 8 Oct 2026
 * against help.indiamart.com "LMS CRM integration v2":
 *   GET https://mapi.indiamart.com/wservce/crm/crmListing/v2/?glusr_crm_key=…&start_time=…&end_time=…
 *   times in IST as DD-MM-YYYYHH:MM:SS, at most 7 days apart, at least 5
 *   minutes between calls (more than 5 a minute locks the key for 15
 *   minutes); the answer is { CODE, STATUS, MESSAGE, TOTAL_RECORDS, RESPONSE[] }
 *   with UNIQUE_QUERY_ID, QUERY_TYPE, QUERY_TIME, SENDER_NAME, SENDER_MOBILE /
 *   SENDER_EMAIL, SENDER_COUNTRY_ISO, QUERY_MESSAGE.
 * Other fields (SENDER_COMPANY, SENDER_CITY, QUERY_PRODUCT_NAME,
 * SENDER_MOBILE_ALT…) are read when present. Beta: verify with a real key.
 */

export const INDIAMART_URL = 'https://mapi.indiamart.com/wservce/crm/crmListing/v2/'
export const INDIAMART_MIN_GAP_MS = 5 * 60_000
const MAX_WINDOW_MS = 7 * 24 * 3_600_000
const IST_OFFSET_MS = 330 * 60_000

const QUERY_TYPES: Readonly<Record<string, string>> = { W: 'Direct enquiry', B: 'Buy-lead', P: 'Call (PNS)', BIZ: 'Catalog view', WA: 'WhatsApp enquiry' }

/** 'DD-MM-YYYYHH:MM:SS' in IST. */
export function indiamartTime(at: Date): string {
  const d = new Date(at.getTime() + IST_OFFSET_MS)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

/** The window to ask for: from the last pull (with a 10-minute overlap; repeats are dropped by id), never more than 7 days back. */
export function pullWindow(lastPulledAt: Date | null | undefined, now: Date): { from: Date; to: Date } {
  const earliest = new Date(now.getTime() - MAX_WINDOW_MS + 60_000)
  const from = lastPulledAt ? new Date(Math.max(lastPulledAt.getTime() - 10 * 60_000, earliest.getTime())) : new Date(now.getTime() - 24 * 3_600_000)
  return { from, to: now }
}

export const indiamartUrl = (key: string, window: { from: Date; to: Date }): string =>
  `${INDIAMART_URL}?${new URLSearchParams({ glusr_crm_key: key, start_time: indiamartTime(window.from), end_time: indiamartTime(window.to) }).toString()}`

/** True when another pull may go now (IndiaMART refuses calls closer than 5 minutes). */
export const mayPull = (lastAttemptAt: Date | null | undefined, now: Date): boolean => !lastAttemptAt || now.getTime() - lastAttemptAt.getTime() >= INDIAMART_MIN_GAP_MS

/**
 * Tallies one pull's capture outcomes. A refused lead (the workspace could not
 * take it) must not be lost: the window then stays put so the next run asks
 * for it again (repeats are dropped by id), and the reason is kept as the error.
 */
export type PullTally = Readonly<{ created: number; duplicates: number; refused: number; advance: boolean; error: string }>

export function tallyPull(outcomes: readonly Readonly<{ status: string; reason?: string }>[]): PullTally {
  const count = (status: string) => outcomes.filter((o) => o.status === status).length
  const refused = outcomes.filter((o) => o.status === 'refused')
  const error = refused.length ? `${refused.length} ${refused.length === 1 ? 'enquiry was' : 'enquiries were'} not saved: ${refused[0].reason || 'refused'} They will be tried again.` : ''
  return { created: count('created'), duplicates: count('duplicate'), refused: refused.length, advance: refused.length === 0, error }
}

type Obj = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

export type IndiamartResult = Readonly<{ ok: true; drafts: LeadDraft[] }> | Readonly<{ ok: false; error: string }>

/** One enquiry as a lead draft (null when it has no phone or email). */
export function draftFromIndiamart(row: Obj): LeadDraft | null {
  const id = s(row.UNIQUE_QUERY_ID)
  if (!id) return null
  const type = QUERY_TYPES[s(row.QUERY_TYPE)] ?? s(row.QUERY_TYPE)
  const product = s(row.QUERY_PRODUCT_NAME) || s(row.SUBJECT)
  const place = [s(row.SENDER_CITY), s(row.SENDER_STATE)].filter(Boolean).join(', ')
  const message = [type && `IndiaMART ${type}${s(row.QUERY_TIME) ? ` at ${s(row.QUERY_TIME)}` : ''}`, product && `Product: ${product}`, s(row.QUERY_MESSAGE), place && `Location: ${place}`, s(row.SENDER_MOBILE_ALT) && `Alternate mobile: ${s(row.SENDER_MOBILE_ALT)}`].filter(Boolean).join('\n')
  return draftFromFields({ name: s(row.SENDER_NAME), company: s(row.SENDER_COMPANY), mobile: s(row.SENDER_MOBILE) || s(row.SENDER_PHONE), email: s(row.SENDER_EMAIL), message }, 'indiamart', { externalId: id, extraTags: ['indiamart', ...(type ? [type.toLowerCase()] : [])] })
}

/**
 * IndiaMART's Push API posts one enquiry as { CODE, STATUS, RESPONSE: {...} }
 * to a webhook URL: that enquiry as a draft, or null for any other body.
 */
export function draftFromIndiamartPush(body: unknown): LeadDraft | null {
  const root = (body && typeof body === 'object' ? body : {}) as Obj
  const row = root.RESPONSE && typeof root.RESPONSE === 'object' && !Array.isArray(root.RESPONSE) ? (root.RESPONSE as Obj) : null
  return row && s(row.UNIQUE_QUERY_ID) ? draftFromIndiamart(row) : null
}

/** IndiaMART's answer as drafts, each enquiry once; a FAILURE answer as its message. */
export function mapIndiamartResponse(body: unknown): IndiamartResult {
  const root = (body && typeof body === 'object' ? body : {}) as Obj
  const code = Number(root.CODE)
  const status = s(root.STATUS).toUpperCase()
  // 204 means "no leads in this window": a success with nothing in it.
  if (code === 204) return { ok: true, drafts: [] }
  if (status !== 'SUCCESS' && code !== 200) return { ok: false, error: s(root.MESSAGE) || `IndiaMART answered ${s(root.CODE) || 'an error'}` }
  const rows = Array.isArray(root.RESPONSE) ? (root.RESPONSE as Obj[]) : []
  const seen = new Set<string>()
  const drafts: LeadDraft[] = []
  for (const row of rows) {
    const draft = draftFromIndiamart(row)
    if (!draft || !draft.externalId || seen.has(draft.externalId)) continue
    seen.add(draft.externalId)
    drafts.push(draft)
  }
  return { ok: true, drafts }
}
