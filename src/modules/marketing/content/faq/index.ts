import type { ProductKey } from '@/lib/catalog'
import { FINANCE_FAQ } from './finance'
import { GETTING_STARTED_FAQ } from './getting-started'
import { HR_FAQ } from './hr'
import { INTEGRATIONS_FAQ } from './integrations'
import { PLANS_FAQ } from './plans'
import { SALES_FAQ } from './sales'
import { SETTINGS_FAQ } from './settings'
import type { FaqCategory, FaqItem } from './types'
import { WORK_FAQ } from './work'

export { FAQ_CATEGORIES, faqHref, guideHref } from './types'
export type { FaqCategory, FaqItem, ManualRef } from './types'

/** Every question, in category order. The one source for /faq and every subset below. */
export const ALL_FAQ: readonly FaqItem[] = [
  ...GETTING_STARTED_FAQ,
  ...PLANS_FAQ,
  ...WORK_FAQ,
  ...HR_FAQ,
  ...SALES_FAQ,
  ...FINANCE_FAQ,
  ...SETTINGS_FAQ,
  ...INTEGRATIONS_FAQ,
]

const BY_ID = new Map(ALL_FAQ.map((f) => [f.id, f]))

/** The questions with these ids, in this order. Throws on an unknown id so a typo fails the build. */
export function pickFaq(ids: readonly string[]): FaqItem[] {
  return ids.map((id) => {
    const item = BY_ID.get(id)
    if (!item) throw new Error(`Unknown FAQ id: ${id}`)
    return item
  })
}

export const faqByCategory = (category: FaqCategory): FaqItem[] => ALL_FAQ.filter((f) => f.category === category)

export const LANDING_FAQ_IDS = ['what-is-flowbit', 'free-plan', 'trial', 'gst', 'count-users', 'arc-changes'] as const

export const PRICING_FAQ_IDS = [
  'pricing', 'free-plan', 'trial', 'trial-ends', 'gst', 'count-users', 'folio-users', 'mix-products', 'monthly-yearly',
  'change-plans', 'how-to-pay', 'pay-offline', 'refunds', 'arc-changes', 'data-separate', 'employee-logins', 'mobile-app',
] as const

export const PRODUCT_FAQ_IDS: Record<ProductKey, readonly string[]> = {
  work: ['quick-add-hinglish', 'personal-tasks', 'guests', 'client-portal', 'meeting-recording', 'data-export', 'arc-changes'],
  muster: ['pf-esi-filing', 'tds-form-16', 'biometric-import', 'manager-salaries', 'employee-billing', 'employee-logins'],
  orbit: ['sales-users', 'lead-stages', 'sequences', 'lead-capture'],
  folio: ['e-invoice', 'folio-firms', 'folio-users', 'invoice-numbers', 'delete-invoice', 'bank-import', 'tally-export'],
}

export const LANDING_FAQ: FaqItem[] = pickFaq(LANDING_FAQ_IDS)
export const PRICING_FAQ: FaqItem[] = pickFaq(PRICING_FAQ_IDS)
export const productFaq = (key: ProductKey): FaqItem[] => pickFaq(PRODUCT_FAQ_IDS[key])

/** schema.org FAQPage structured data for a list of questions. */
export function faqJsonLd(items: readonly FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }
}

/** JSON for a `<script type="application/ld+json">`, with `<` escaped so it cannot close the tag. */
export const jsonLdScript = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c')

/** Plain-text haystack for the /faq search box. */
export const searchText = (item: FaqItem): string => `${item.q} ${item.a}`.toLowerCase()

/** True when every word of the query appears in the question or answer. */
export function matchesQuery(item: FaqItem, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = searchText(item)
  return words.every((w) => hay.includes(w))
}
