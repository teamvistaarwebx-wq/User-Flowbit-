/**
 * Protection for the public lead form (pure): the honeypot, and the origin
 * allow-list the workspace keeps (only its own sites may post from a browser).
 */

/** The hidden field a person never fills; bots fill every field. */
export const HONEYPOT_FIELD = 'company_website'

export const honeypotTripped = (body: Record<string, unknown>): boolean => typeof body[HONEYPOT_FIELD] === 'string' && (body[HONEYPOT_FIELD] as string).trim() !== ''

/** 'https://Acme.in/contact?x' → 'https://acme.in'; null for anything that is not an http(s) origin. */
export function normaliseOrigin(value: string | null | undefined): string | null {
  try {
    const url = new URL((value ?? '').trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return `${url.protocol}//${url.host.toLowerCase()}`
  } catch {
    return null
  }
}

/**
 * A browser post must come from a listed origin. `*.acme.in` allows its
 * subdomains. A request with no Origin (a plain HTML form from some old
 * browsers, curl) is judged by its Referer instead; with neither it is refused
 * when the workspace listed any origins.
 */
export function originAllowed(origin: string | null | undefined, referer: string | null | undefined, allowed: readonly string[]): boolean {
  if (!allowed.length) return false
  const from = normaliseOrigin(origin) ?? normaliseOrigin(referer)
  if (!from) return false
  const host = new URL(from).host
  return allowed.some((entry) => {
    const rule = entry.trim().toLowerCase()
    if (rule.startsWith('*.')) return host.endsWith(rule.slice(1)) && host !== rule.slice(2)
    return normaliseOrigin(rule) === from
  })
}

/** Cleans a typed allow-list: origins only, at most 20, each once. */
export function cleanOrigins(lines: readonly string[]): string[] {
  const out = lines.map((l) => l.trim().toLowerCase()).filter(Boolean).map((l) => (l.startsWith('*.') && /^\*\.[a-z0-9.-]+\.[a-z]{2,}$/.test(l) ? l : normaliseOrigin(l.includes('://') ? l : `https://${l}`))).filter((v): v is string => Boolean(v))
  return [...new Set(out)].slice(0, 20)
}
