import type { CreateLinkInput, RazorpayLink } from '@/modules/payments/razorpay-links'
import { billBalancePaise, type BalanceBill } from './rules'
import { BILL_LINK_KIND } from './bill-payment'

/**
 * After a part payment (usually a bank transfer recorded by UTR), the bill's
 * Razorpay link would still ask for the full amount (V2-REVIEW M-M3). The
 * link is re-created for the balance (reference '<bill>-2', '-3', … because
 * Razorpay refuses a reference twice) and the old one is cancelled. Pure
 * orchestration; the Razorpay client and the save are injected.
 */

export type RelinkBill = BalanceBill &
  Readonly<{
    id: string
    orgId: string
    number: string
    /** 'YYYY-MM-DD' IST. */
    dueDate: string
    link: Readonly<{ id: string; status?: string | null; amountPaise?: number | null }> | null
    /** Links made for this bill so far (1 = the original). */
    linkCount: number
    customer: Readonly<{ name?: string; email?: string }>
  }>

export type RelinkDeps = Readonly<{
  createLink: (input: CreateLinkInput) => Promise<RazorpayLink>
  cancelLink: (linkId: string) => Promise<void>
  save: (billId: string, link: RazorpayLink, linkCount: number) => Promise<void>
  /** Seconds since epoch the new link expires: the due date plus the usual grace. */
  expireBy: (dueDate: string) => number
}>

export type RelinkOutcome = 'relinked' | 'unchanged' | 'failed'

/** The new link to make, or null: none existed, nothing is left to pay, or it already asks for the balance. */
export function relinkPlan(bill: RelinkBill): { amountPaise: number; referenceId: string } | null {
  if (!bill.link?.id || bill.link.status === 'paid') return null
  const balance = billBalancePaise(bill)
  if (balance <= 0 || bill.link.amountPaise === balance) return null
  return { amountPaise: balance, referenceId: `${bill.number}-${bill.linkCount + 1}` }
}

export async function relinkBalance(deps: RelinkDeps, bill: RelinkBill): Promise<RelinkOutcome> {
  const plan = relinkPlan(bill)
  if (!plan) return 'unchanged'
  let link: RazorpayLink
  try {
    link = await deps.createLink({
      amountPaise: plan.amountPaise,
      referenceId: plan.referenceId,
      description: `Flowbit bill ${bill.number} (balance)`,
      customer: bill.customer,
      notes: { kind: BILL_LINK_KIND, billId: bill.id, orgId: bill.orgId },
      expireBy: deps.expireBy(bill.dueDate),
    })
  } catch (error) {
    // The old link stays: the customer can still pay by bank transfer, and Accounts sees the part-payment alert.
    console.error('[billing] balance link failed', bill.number, error)
    return 'failed'
  }
  await deps.save(bill.id, link, bill.linkCount + 1)
  // Cancel after the new link exists, so the bill is never without one; a failed cancel only leaves the old link payable (an overpayment is flagged).
  await deps.cancelLink(bill.link!.id).catch((error: unknown) => console.error('[billing] old link not cancelled', bill.number, error))
  return 'relinked'
}
