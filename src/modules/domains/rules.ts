/**
 * Custom domains (paid add-on 'domains'), pure and edge-safe:
 *  - sending: mail to clients goes from billing@<their domain> once Resend
 *    has verified its SPF, DKIM and return-path records;
 *  - portal: portal.<their domain> is a CNAME to Flowbit and serves that
 *    workspace's client portal.
 */

export const DOMAIN_KINDS = ['sending', 'portal'] as const
export type DomainKind = (typeof DOMAIN_KINDS)[number]

/** The local part client-facing mail is sent from. */
export const SENDING_LOCAL_PART = 'billing'

/** Mail kinds that go to a workspace's clients, so they use its own sending domain. */
export const CLIENT_MAIL_KINDS: ReadonlySet<string> = new Set(['invoice', 'quote', 'statement', 'reminder', 'portal'])

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
const RESERVED = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|localdomain|test|example|invalid)$/i

/** Lower-cased host without scheme, path, port or trailing dot; null when it is not a public domain name. */
export function normalizeDomain(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '')
  if (!host || host.length > 253 || !host.includes('.')) return null
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return null
  const labels = host.split('.')
  if (!labels.every((l) => LABEL.test(l))) return null
  if (!/^[a-z]{2,63}$/.test(labels[labels.length - 1]) && !labels[labels.length - 1].startsWith('xn--')) return null
  if (RESERVED.test(host)) return null
  return host
}

/** Flowbit's own hosts are never a workspace's domain. */
export function isFlowbitDomain(domain: string, own: readonly string[]): boolean {
  return own.some((o) => o && (domain === o || domain.endsWith(`.${o}`)))
}

/** "Bright Foods <billing@brightfoods.in>" (quotes and angle brackets stripped from the name). */
export function sendingFrom(orgName: string, domain: string): string {
  const name = orgName.replace(/["<>\r\n]/g, '').trim().slice(0, 60) || 'Billing'
  return `${name} <${SENDING_LOCAL_PART}@${domain}>`
}

/** A portal host must be a subdomain (portal.theirdomain.com), never an apex: apex records cannot be a CNAME. */
export const isSubdomain = (domain: string): boolean => domain.split('.').length >= 3

/** Whether a resolved CNAME chain points at Flowbit's target. */
export function cnameMatches(records: readonly string[], target: string): boolean {
  const want = target.toLowerCase().replace(/\.$/, '')
  return records.some((r) => r.toLowerCase().replace(/\.$/, '') === want)
}

/**
 * The path a request on a custom portal host is served from: everything maps
 * under /portal/<slug>; Next assets and the API pass through; product pages 404.
 */
export function portalPathFor(slug: string, pathname: string): { kind: 'next' } | { kind: 'rewrite'; pathname: string } | { kind: 'not_found' } {
  if (pathname.startsWith('/_next/') || pathname.startsWith('/api/')) return { kind: 'next' }
  const base = `/portal/${slug}`
  if (pathname === base || pathname.startsWith(`${base}/`)) return { kind: 'next' }
  if (pathname.startsWith('/portal/') || pathname.startsWith('/app') || pathname.startsWith('/console') || pathname.startsWith('/onboarding')) return { kind: 'not_found' }
  return { kind: 'rewrite', pathname: pathname === '/' ? base : `${base}${pathname}` }
}

/** Resend's domain statuses, as the page words them. */
export const STATUS_LABEL: Record<string, string> = { pending: 'Waiting for DNS', verified: 'Verified', failed: 'Not verified', not_started: 'Waiting for DNS', temporary_failure: 'Checking again' }

const hostOnly = (value: string) => value.toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '')

/**
 * Whether a request's Host may be a workspace's portal domain: not loopback,
 * not a *.vercel.app preview, and none of Flowbit's own hosts (or their
 * subdomains). Only such hosts cost a lookup in the proxy.
 */
export function isCandidatePortalHost(host: string | null | undefined, ownHosts: readonly (string | null | undefined)[]): boolean {
  if (!host) return false
  const name = hostOnly(host)
  if (!name.includes('.') || name.endsWith('.localhost') || /^[\d.]+$/.test(name) || name.startsWith('[') || name.endsWith('.vercel.app')) return false
  const own = ownHosts.map((h) => (h ? hostOnly(h) : '')).filter(Boolean)
  return !own.some((o) => name === o || name.endsWith(`.${o}`) || o.endsWith(`.${name}`))
}
