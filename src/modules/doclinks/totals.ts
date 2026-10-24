import { formatINR } from '@/lib/money'
import { reverseChargeNote } from '@/modules/folio/invoices/rules'
import type { PublicTotal } from './view-types'

/** Pure: the totals block of a public invoice, quote or credit note. */

export type PricedTotals = { subtotalPaise?: number; discountPaise?: number; taxablePaise?: number; cgstPaise: number; sgstPaise: number; igstPaise: number; roundOffPaise?: number | null; totalPaise: number; reverseCharge?: boolean | null }

/**
 * Tax rows add up to the total, except under reverse charge: the recipient pays that GST, so it is left out
 * of the sum and named after the total instead.
 */
export function publicTotals(doc: PricedTotals, opts: { first: PublicTotal; totalLabel: string }): PublicTotal[] {
  const tax = doc.cgstPaise + doc.sgstPaise + doc.igstPaise
  const taxRows: PublicTotal[] = doc.reverseCharge
    ? []
    : [
        ...(doc.cgstPaise ? [{ label: 'CGST', amountPaise: doc.cgstPaise }] : []),
        ...(doc.sgstPaise ? [{ label: 'SGST', amountPaise: doc.sgstPaise }] : []),
        ...(doc.igstPaise ? [{ label: 'IGST', amountPaise: doc.igstPaise }] : []),
      ]
  return [
    opts.first,
    ...(doc.discountPaise ? [{ label: 'Discount', amountPaise: -doc.discountPaise }] : []),
    ...taxRows,
    ...(doc.roundOffPaise ? [{ label: 'Round off', amountPaise: doc.roundOffPaise }] : []),
    { label: opts.totalLabel, amountPaise: doc.totalPaise, strong: true },
    ...(doc.reverseCharge && tax ? [{ label: reverseChargeNote(tax, (p) => formatINR(p)), amountPaise: tax }] : []),
  ]
}
