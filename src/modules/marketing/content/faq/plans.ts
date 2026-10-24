import { FREE_MONTHS, FREE_SEAT_LIMIT } from '@/lib/account-types'
import { COMPANY_LEGAL_NAME } from '@/lib/company'
import { DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT } from '@/lib/first-year-discount'
import { FOLIO_EXTRA_FIRM_PAISE, FOLIO_INCLUDED_FIRMS, FOLIO_INCLUDED_USERS, PLAN_PRICES, BLOCKED_OPEN_PAGES, READ_ONLY_DAYS, TRIAL_DAYS, YEARLY_MONTHS, yearlyPricingCopy } from '@/lib/plans'
import { gstCopy, rupees } from '../../pricing'
import type { FaqItem } from './types'

const price = (key: keyof typeof PLAN_PRICES) => rupees(PLAN_PRICES[key].monthlyPaise)

/** Folio's fixed user limit (D7): who counts, and that more means Suite. */
export const FOLIO_USERS_COPY = `Folio on its own includes ${FOLIO_INCLUDED_USERS} users, and the limit cannot be raised. Anyone whose role has any Folio permission counts, even to view or quote: by default the Owner, Admins, Finance and Sales. For more than ${FOLIO_INCLUDED_USERS}, choose Suite, which covers everyone.`

/** How people are counted (B10): the code in lib/billing capacity, in words. Pending invites count everywhere. */
export const SEAT_COUNTING_COPY = `Free: the higher of people who sign in and employees on payroll. Suite: everyone who signs in, plus employees on payroll who do not sign in, so each person counts once. Separate products are each counted on their own: Work counts people who sign in, Muster counts employees on payroll, Orbit counts people whose role can work leads or deals, and Folio includes ${FOLIO_INCLUDED_FIRMS} firms and ${FOLIO_INCLUDED_USERS} users (each extra firm is ${rupees(FOLIO_EXTRA_FIRM_PAISE)} a month). Pending invites count as people who sign in.`

/** Plans and billing. Every number comes from lib/plans or lib/account-types. */
export const PLANS_FAQ: readonly FaqItem[] = [
  {
    id: 'pricing',
    category: 'plans',
    q: 'How much does Flowbit cost?',
    a: `Suite, all four products, is ${price('suite')} per person a month (minimum ${PLAN_PRICES.suite.minimum}). Or pick products: Work ${price('work')} per user, Muster Starter ${price('muster_starter')} or Muster Business ${price('muster_business')} per employee, Orbit ${price('orbit')} per sales user, and Folio ${price('folio')} per workspace. Prices exclude GST.`,
    guide: 'getting-started#start-what',
  },
  {
    id: 'free-plan',
    category: 'plans',
    q: 'Is there a free plan?',
    a: `Yes. Free covers up to ${FREE_SEAT_LIMIT} people with every product for ${FREE_MONTHS} months from signup. People are the higher of those who sign in (pending invites included) and employees on payroll. Adding a ${FREE_SEAT_LIMIT + 1}th person asks you to upgrade, or to start the ${TRIAL_DAYS}-day trial if your business has not had it. Paid add-ons (client portal, custom domains, Meetings AI) are not part of Free. Each business gets one Free workspace.`,
    guide: 'settings#admin-subscription',
  },
  {
    id: 'trial',
    category: 'plans',
    q: 'How does the free trial work?',
    a: `${TRIAL_DAYS} days with every product switched on and no card needed. Teams of more than ${FREE_SEAT_LIMIT} start on the trial; a Free workspace can start it when it needs more people. There is one trial per business, matched by GSTIN, else PAN, else the owner's email. We remind you 3 days and 1 day before it ends. If you trim back to ${FREE_SEAT_LIMIT} people within the ${FREE_MONTHS} months from signup, you can return to Free.`,
    guide: 'settings#admin-subscription',
  },
  {
    id: 'trial-ends',
    category: 'plans',
    q: 'What happens when the trial or free months end?',
    a: `Your workspace becomes read-only for ${READ_ONLY_DAYS} days, so you can still see everything but not change it. After that it is locked: only ${BLOCKED_OPEN_PAGES} open until you choose a plan. Data is deleted only 90 days after that, and we email you 30, 7 and 1 days before.`,
    guide: 'getting-started#start-what',
  },
  {
    id: 'gst',
    category: 'plans',
    q: 'Is GST included?',
    a: `No. ${gstCopy(COMPANY_LEGAL_NAME)} Add your GSTIN in Settings → Plan & billing so a tax invoice carries it for input tax credit.`,
    guide: 'settings#admin-subscription',
  },
  {
    id: 'count-users',
    category: 'plans',
    q: 'How do you count users?',
    a: SEAT_COUNTING_COPY,
  },
  {
    id: 'mix-products',
    category: 'plans',
    q: 'Can I mix products?',
    a: `Yes. Pick any combination, or take Suite for all four at ${price('suite')} a person.`,
  },
  {
    id: 'monthly-yearly',
    category: 'plans',
    q: 'Monthly or yearly?',
    a: `Either. ${yearlyPricingCopy(DEFAULT_FIRST_YEAR_DISCOUNT_PERCENT)} A yearly plan is paid up front; for example, 20 people on Suite pay ${rupees((PLAN_PRICES.suite.monthlyPaise * YEARLY_MONTHS * 20) / 2)} for the first year and ${rupees(PLAN_PRICES.suite.monthlyPaise * YEARLY_MONTHS * 20)} at each renewal (plus GST).`,
  },
  {
    id: 'change-plans',
    category: 'plans',
    q: 'Can I change plans later?',
    a: 'Add people or products any time and pay only for the rest of the current period. Reductions apply from your next renewal.',
    guide: 'settings#admin-subscription',
  },
  {
    id: 'how-to-pay',
    category: 'plans',
    q: 'How do I pay?',
    a: 'Through Razorpay: cards, UPI or netbanking, or set up autopay. A plan paid by card checkout or autopay renews automatically; otherwise we send a bill before each renewal. Cancel any time and keep access until the end of the period you’ve paid for.',
    guide: 'settings#admin-billing',
  },
  {
    id: 'pay-offline',
    category: 'plans',
    q: 'Can I pay by bank transfer?',
    a: 'Yes. Pay the bill by bank transfer, then use Paid offline? in Settings → Plan & billing → Bills and invoices to send the UTR and a screenshot. You keep access for up to 7 days while the Flowbit team checks it.',
    guide: 'settings#admin-billing',
  },
  {
    id: 'flowbit-invoices',
    category: 'plans',
    q: 'Where are my Flowbit invoices?',
    a: 'In Settings → Plan & billing, on the Bills and invoices tab. Download any invoice as a PDF or email it again to your accountant. Add your company name, GSTIN and address once and every invoice carries them.',
    guide: 'settings#admin-subscription',
  },
  {
    id: 'refunds',
    category: 'plans',
    q: 'Do you give refunds?',
    a: 'We don’t refund part-used periods, monthly or yearly. Cancel any time and you won’t be charged again. If you were charged twice, or after cancelling, we refund the extra charge in full.',
  },
  {
    id: 'folio-firms',
    category: 'plans',
    q: 'Can I bill from two companies?',
    a: `Yes. Folio includes ${FOLIO_INCLUDED_FIRMS} firms: add each with its own GSTIN or as non-GST, its own number series, bank details and letterhead. A third firm and beyond is ${rupees(FOLIO_EXTRA_FIRM_PAISE)} a month each.`,
    guide: 'folio#folio-settings',
  },
  {
    id: 'folio-users',
    category: 'plans',
    q: 'Who counts as a Folio user?',
    a: FOLIO_USERS_COPY,
  },
]
