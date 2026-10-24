/**
 * First-touch campaign data for signups (console spec 5.4, Console reports →
 * Marketing). The proxy keeps the first landing's utm_* values (and the
 * referring site) in a cookie; creating the workspace stores them on the Org
 * and the house Orbit lead. Pure and edge-safe.
 */

export const SIGNUP_UTM_COOKIE = 'fb_utm'
/** 30 days: a visitor who signs up within a month keeps the campaign that brought them. */
export const SIGNUP_UTM_MAX_AGE = 30 * 24 * 3600

export const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const
export type UtmKey = (typeof UTM_KEYS)[number]

export type SignupUtm = Readonly<Partial<Record<UtmKey, string>> & { referrer?: string; landing?: string }>

const MAX_VALUE = 100
const MAX_COOKIE = 1_000
/** Letters, digits and the punctuation campaigns use; anything else is dropped. */
const clean = (value: string | null | undefined): string | undefined => {
  const out = (value ?? '').replace(/[^\p{L}\p{N} ._\-+/:|@]/gu, '').trim().slice(0, MAX_VALUE)
  return out || undefined
}

/** The referring site's host, when it is not our own (a bare host keeps no personal data from the URL). */
function referrerHost(referrer: string | null | undefined, ownHost: string | null | undefined): string | undefined {
  if (!referrer) return undefined
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    const own = (ownHost ?? '').split(':')[0].toLowerCase()
    if (!host || host === own || (own && host.endsWith(`.${own.replace(/^www\./, '')}`))) return undefined
    return clean(host)
  } catch {
    return undefined
  }
}

/**
 * Campaign data from a landing request, or null when there is nothing to
 * keep: utm_* values from the query, plus the referring host and the landing
 * path when there is at least one of them.
 */
export function utmFromRequest(input: { search: string; pathname: string; referrer?: string | null; host?: string | null }): SignupUtm | null {
  const params = new URLSearchParams(input.search)
  const tags = Object.fromEntries(UTM_KEYS.map((k) => [k, clean(params.get(`utm_${k}`))]).filter(([, v]) => v)) as Partial<Record<UtmKey, string>>
  const referrer = referrerHost(input.referrer, input.host)
  if (!Object.keys(tags).length && !referrer) return null
  return { ...tags, ...(referrer ? { referrer } : {}), landing: clean(input.pathname) ?? '/' }
}

export const encodeUtm = (utm: SignupUtm): string => encodeURIComponent(JSON.stringify(utm)).slice(0, MAX_COOKIE)

/** The cookie read back, every value re-checked (it came from the browser). */
export function decodeUtm(raw: string | null | undefined): SignupUtm | null {
  if (!raw) return null
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>
    if (!value || typeof value !== 'object') return null
    const keys = [...UTM_KEYS, 'referrer', 'landing'] as const
    const out = Object.fromEntries(keys.map((k) => [k, typeof value[k] === 'string' ? clean(value[k] as string) : undefined]).filter(([, v]) => v))
    return Object.keys(out).length ? (out as SignupUtm) : null
  } catch {
    return null
  }
}

/** The label reports group by: utm_source, else the referring site, else "Direct". */
export const utmSourceLabel = (utm: SignupUtm | null | undefined): string => utm?.source || (utm?.referrer ? `Referral: ${utm.referrer}` : 'Direct')
