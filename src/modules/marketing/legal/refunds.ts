import { FREE_MONTHS, FREE_SEAT_LIMIT } from '@/lib/account-types'
import { PAST_DUE_GRACE_DAYS, READ_ONLY_DAYS, TRIAL_DAYS } from '@/lib/plans'
import type { LegalContext, LegalContent } from './types'

/*
 * DRAFT for the owner's lawyer to review (platform spec 13 and open decision 17.2:
 * refund wording). Uses the suggested default: no refunds for part-used periods.
 */
export function refundsContent({ legalName, supportEmail }: LegalContext): LegalContent {
  return {
    title: 'Refunds & cancellation',
    updated: '11 Oct 2026',
    intro: `How cancelling a Flowbit subscription works, and when ${legalName} refunds a payment.`,
    sections: [
      { id: 'trial', heading: 'Try before you pay', paragraphs: [`You start free, with no card. Up to ${FREE_SEAT_LIMIT} people: free for ${FREE_MONTHS} months. Bigger teams: a ${TRIAL_DAYS}-day trial of all four products, once per business. So you can decide before paying anything.`] },
      { id: 'cancel', heading: 'Cancelling', paragraphs: ['The workspace owner can cancel at any time from Settings → Plan & billing. Cancelling stops the next renewal; you keep full access until the end of the period you have already paid for.', `After that, the workspace becomes read-only for ${READ_ONLY_DAYS} days so you can export what you need. It is then blocked, and its data is deleted 90 days later unless you renew; we email the owner 30, 7 and 1 days before.`] },
      { id: 'refunds', heading: 'Refunds', paragraphs: ['We don’t refund part-used periods, monthly or yearly. Cancel any time and you won’t be charged again.'], list: ['If you were charged twice, or charged after cancelling, we refund the extra charge in full to the original payment method.', 'Refunds go back through Razorpay to the card, UPI account or bank you paid from; your bank may take a few working days to show them. A payment made by bank transfer is refunded by bank transfer.'] },
      { id: 'changes', heading: 'Changing your plan', paragraphs: ['Adding people or products is charged only for the rest of the current period. Removing them takes effect from your next renewal, so you are never charged twice for the same seat.'] },
      { id: 'failed', heading: 'Unpaid renewals', paragraphs: [`Only a plan paid by card checkout or autopay renews by itself; otherwise we send a bill. If a renewal is not paid, you keep full access for ${PAST_DUE_GRACE_DAYS} days while we remind you (an autopay charge may be retried in that time). After that the workspace becomes read-only until payment is made.`] },
      { id: 'credits', heading: 'Message credits', paragraphs: ['If you buy WhatsApp message credits, they can be used only for messages sent through Flowbit. They cannot be withdrawn as cash or moved to another workspace.', 'Credits that were charged for a message that failed to send are returned to your balance. Unused paid credits are refunded only as set out in the terms shown when you buy them, and only to the original payment method.'] },
      { id: 'contact', heading: 'Questions', paragraphs: [`Write to ${supportEmail} with your workspace name and the payment reference shown on your invoice.`] },
    ],
  }
}
