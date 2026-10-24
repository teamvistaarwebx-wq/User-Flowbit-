import { FREE_MONTHS, FREE_SEAT_LIMIT } from '@/lib/account-types'
import { DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT } from '@/lib/first-year-discount'
import { DELETE_AFTER_BLOCKED_DAYS, OWNER_DELETE_PURGE_DAYS } from '@/lib/lifecycle'
import { BLOCKED_OPEN_PAGES, PAST_DUE_GRACE_DAYS, READ_ONLY_DAYS, TRIAL_DAYS, yearlyPricingCopy } from '@/lib/plans'
import { gstCopy } from '../pricing'
import type { LegalContext, LegalContent } from './types'

/*
 * DRAFT for the owner's lawyer to review before launch (platform spec 13).
 * Jurisdiction, liability cap and the registered address need confirmation.
 * 7 Oct 2026: entity, domain, messaging and data-processing sections added.
 * 11 Oct 2026: Free vs trial by team size, one trial per business, renewal by
 * payment method, no GST before registration, owner deletion (owner decisions D1-D8).
 */
export function termsContent({ legalName, supportEmail }: LegalContext): LegalContent {
  return {
    title: 'Terms of service',
    updated: '11 Oct 2026',
    intro: `These terms are an agreement between ${legalName} ("Flowbit", "we"), which offers Flowbit at useflowbit.com, and the organisation that creates a Flowbit workspace ("you"). Flowbit is a brand of ${legalName}. By creating a workspace or using Flowbit you accept them on behalf of that organisation.`,
    sections: [
      { id: 'service', heading: 'The service', paragraphs: ['Flowbit is a web application with four products in one workspace: Flowbit Work (tasks and projects), Muster (HR and payroll), Orbit (sales pipeline) and Folio (quotes, invoices and collections). Which products you can use depends on your plan.', 'We may improve, change or retire features. We will not remove a paid product you are subscribed to during a period you have already paid for.'] },
      { id: 'accounts', heading: 'Accounts and workspaces', paragraphs: ['Each person signs in with their own account. You are responsible for who you invite, the role you give them and for keeping sign-in details private. The workspace owner controls the subscription and can remove members at any time.'] },
      { id: 'trial', heading: 'Free plan and trial', paragraphs: [
        `You start free, without a card. A workspace for up to ${FREE_SEAT_LIMIT} people starts on the Free plan: every product for ${FREE_MONTHS} months from signup. A bigger team starts on a ${TRIAL_DAYS}-day trial of every product. A Free workspace can also start the ${TRIAL_DAYS}-day trial when it needs more people.`,
        `Each business gets one Free workspace and one ${TRIAL_DAYS}-day trial, matched by GSTIN, else PAN, else the owner's verified email.`,
        `When the Free months or the trial end without a plan, the workspace becomes read-only for ${READ_ONLY_DAYS} days. After that it is blocked: only ${BLOCKED_OPEN_PAGES} open until you choose a plan. If no plan is chosen, the workspace data is deleted ${DELETE_AFTER_BLOCKED_DAYS} days after it is blocked; we email the owner 30, 7 and 1 days before.`,
      ] },
      { id: 'payment', heading: 'Plans, prices and payment', paragraphs: [
        `Prices are in Indian rupees. ${gstCopy(legalName)}`,
        yearlyPricingCopy(DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT),
        'A plan paid by card checkout or set up with autopay renews automatically each month or year until cancelled. Otherwise we send a bill before each renewal, to pay online or by bank transfer.',
        `If a renewal is not paid, you keep full access for ${PAST_DUE_GRACE_DAYS} days while we remind you (an autopay charge may be retried by the bank or Razorpay in that time); after that the workspace becomes read-only until payment is made.`,
      ], list: ['Adding people or products during a period is charged for the rest of that period.', 'Reductions take effect from your next renewal.', 'Refunds and cancellation are covered in our Refunds & cancellation policy.'] },
      { id: 'your-data', heading: 'Your data', paragraphs: ['Everything you put into your workspace (tasks, employee records, payroll, clients, invoices and files) belongs to you. You give us permission to store and process it only to run Flowbit for you. You are responsible for having the right to add the personal data of your employees, clients and contacts.', 'Payroll, statutory figures (PF, ESI, PT) and GST calculations are tools to help you. You remain responsible for checking them and for your own filings.'] },
      { id: 'messages', heading: 'Messages sent for you', paragraphs: ['Flowbit sends email on your behalf, such as invoices, quotes, payment reminders, payslips and team alerts. When WhatsApp messaging is switched on for your workspace, Flowbit can also send WhatsApp messages from your connected number through our messaging provider.', 'You decide who receives these messages. You are responsible for having a lawful reason to message each person, for honouring opt-outs (Flowbit stops WhatsApp messages to anyone who replies STOP), and for following WhatsApp’s Business Messaging Policy. Paid message credits, where offered, are usable only for Flowbit messaging and are covered by the terms shown when you buy them.'] },
      { id: 'processing', heading: 'Data processing', paragraphs: ['For personal data you put into your workspace, you are the data fiduciary and Flowbit processes it on your behalf. Our Data processing terms form part of this agreement.'] },
      { id: 'arc', heading: 'Arc assistant', paragraphs: ['Arc searches your workspace and drafts suggestions. Nothing Arc drafts is saved until a person clicks Apply, and Arc does not change pay, attendance, HR letters or invoice amounts on its own. When an AI provider is switched on, the text needed to answer a request is sent to that provider to produce the draft.'] },
      { id: 'acceptable-use', heading: 'Acceptable use', list: ['Do not use Flowbit for anything unlawful, including storing data you have no right to hold.', 'Do not try to access another workspace, probe for weaknesses or overload the service.', 'Do not resell Flowbit or copy its design or code.'] },
      { id: 'availability', heading: 'Availability and support', paragraphs: [`We work to keep Flowbit available and secure, but we cannot promise it will never be interrupted. Support is by email at ${supportEmail}.`] },
      { id: 'liability', heading: 'Liability', paragraphs: ['Flowbit is provided "as is". To the extent the law allows, our total liability for any claim is limited to the amount you paid us in the 12 months before the claim, and we are not liable for indirect losses such as lost profit or data you could have exported.'] },
      { id: 'ending', heading: 'Ending the agreement', paragraphs: ['You can cancel at any time from Settings → Plan & billing and keep access until the end of the paid period. We may suspend a workspace that breaks these terms or does not pay, after telling the owner. Export what you need before you leave.', `If the owner deletes the workspace, nobody can open it any more. We keep its data for ${OWNER_DELETE_PURGE_DAYS} days in case you change your mind, then delete it, except what the law requires us to keep.`] },
      { id: 'law', heading: 'Law and changes', paragraphs: ['These terms are governed by the laws of India. We will tell workspace owners by email before material changes take effect.', `Questions about these terms: ${supportEmail}.`] },
    ],
  }
}
