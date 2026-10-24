import { PRODUCT_KEYS, type ProductKey } from '@/lib/catalog'

/**
 * The plan someone picked on the pricing page before signing up
 * (`/signup?plan=suite`, `/signup?plan=custom&products=work,folio&muster=starter`).
 * It rides from signup to onboarding in a cookie, is stored on `Org.planIntent`
 * as a normalized query string, and preselects Settings → Plan & billing's picker
 * (platform spec 6.7.1–6.7.2). Pure and client-safe.
 */

export const PLAN_INTENT_COOKIE = 'fb_plan'
export const PLAN_INTENT_MAX_AGE = 7 * 24 * 60 * 60

export type PlanIntent = { plan: 'suite' | 'custom'; products: ProductKey[]; muster: 'starter' | 'business' | null }

type RawIntent = { plan?: string | null; products?: string | null; muster?: string | null }

const isProductKey = (value: string): value is ProductKey => (PRODUCT_KEYS as readonly string[]).includes(value)

/** A valid intent from URL-ish values, or null (unknown plans and empty custom picks are dropped). */
export function parsePlanIntent(raw: RawIntent): PlanIntent | null {
  if (raw.plan === 'suite') return { plan: 'suite', products: [], muster: null }
  if (raw.plan !== 'custom') return null
  const products = [...new Set((raw.products ?? '').split(',').map((p) => p.trim()).filter(isProductKey))]
  if (!products.length) return null
  const muster = products.includes('muster') && (raw.muster === 'starter' || raw.muster === 'business') ? raw.muster : null
  return { plan: 'custom', products, muster }
}

/** The same intent from a stored query string (`Org.planIntent`, the cookie). */
export function parsePlanIntentQuery(query: string | null | undefined): PlanIntent | null {
  if (!query) return null
  const params = new URLSearchParams(query)
  return parsePlanIntent({ plan: params.get('plan'), products: params.get('products'), muster: params.get('muster') })
}

/** Normalized query string for storage: `plan=custom&products=work,folio&muster=starter`. */
export function planIntentQuery(intent: PlanIntent): string {
  if (intent.plan === 'suite') return 'plan=suite'
  const muster = intent.muster ? `&muster=${intent.muster}` : ''
  return `plan=custom&products=${intent.products.join(',')}${muster}`
}
