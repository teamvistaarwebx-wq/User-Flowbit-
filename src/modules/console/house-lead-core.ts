import { ACCOUNT_TYPE_LABEL, type AccountType } from '@/lib/account-types'

/**
 * Signups and demo requests become Leads in Vistaar's own Orbit workspace
 * (console spec 5.4). Pure part: what the lead says and which source/sector
 * keys it uses. modules/console/house-lead writes it.
 */

export type HouseLeadOrigin = 'signup' | 'demo_request'

export type HouseLeadInput = {
  origin: HouseLeadOrigin
  name: string
  email: string
  company: string
  phone?: string | null
  teamSize: string
  products: readonly string[]
  accountType?: AccountType | null
  /** Workspace slug for signups. */
  workspace?: string | null
  /** Pricing-page pick carried through signup (lib/plan-intent). */
  planIntent?: string | null
  message?: string | null
  /** First-touch campaign (lib/utm), stored on the lead's utm fields. */
  utm?: Readonly<{ source?: string; medium?: string; campaign?: string; term?: string; content?: string }> | null
}

/** Preferred Orbit source per origin; the house workspace's own list decides if it is active. */
export const PREFERRED_SOURCE: Record<HouseLeadOrigin, readonly string[]> = {
  signup: ['website', 'inbound', 'other'],
  demo_request: ['inbound', 'website', 'other'],
}
export const PREFERRED_SECTOR = ['other'] as const

/** The first preferred key that is active, else the first active key, else null. */
export function pickKey(active: readonly string[], preferred: readonly string[]): string | null {
  return preferred.find((key) => active.includes(key)) ?? active[0] ?? null
}

const ORIGIN_LABEL: Record<HouseLeadOrigin, string> = { signup: 'Signed up', demo_request: 'Asked for a demo' }

/** One dated line for the lead's notes, e.g. "8 Oct 2026 · Signed up · Free · 2-5 people · workspace acme". */
export function houseLeadLine(input: HouseLeadInput, at: Date): string {
  const date = at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
  const parts = [
    date,
    ORIGIN_LABEL[input.origin],
    input.accountType ? ACCOUNT_TYPE_LABEL[input.accountType] : null,
    `${input.teamSize} people`,
    input.products.length ? `products: ${input.products.join(', ')}` : null,
    input.workspace ? `workspace ${input.workspace}` : null,
    input.planIntent ? `pricing pick: ${input.planIntent}` : null,
  ].filter((p): p is string => Boolean(p))
  const line = parts.join(' · ')
  return input.message ? `${line}\n${input.message.trim()}` : line
}

/** Notes after adding a line: newest first, existing notes kept, capped so the field never grows without bound. */
export function appendNote(existing: string | null | undefined, line: string, max = 4000): string {
  const next = existing?.trim() ? `${line}\n\n${existing.trim()}` : line
  return next.length > max ? next.slice(0, max) : next
}
