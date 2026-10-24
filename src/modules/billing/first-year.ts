import 'server-only'
import type { Types } from 'mongoose'
import { firstYearDiscountPercent, type PastInvoice } from '@/lib/first-year-discount'
import type { BillingCycle } from '@/lib/plans'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'

/**
 * The first-year discount a workspace's next plan invoice gets (console spec
 * 2): the Console percentage on a yearly plan when it has never paid for a
 * year (lib/first-year-discount), else 0.
 */
export async function firstYearDiscountFor(orgId: Types.ObjectId, cycle: BillingCycle, percent: number): Promise<number> {
  if (cycle !== 'yearly' || percent <= 0) return 0
  const past = await SubscriptionInvoice.find(
    { orgId, status: 'paid', kind: 'subscription' },
    { status: 1, kind: 1, cycle: 1, periodStart: 1, periodEnd: 1, 'lines.productKey': 1 },
  ).lean<PastInvoice[]>()
  return firstYearDiscountPercent({ cycle, percent, past })
}
