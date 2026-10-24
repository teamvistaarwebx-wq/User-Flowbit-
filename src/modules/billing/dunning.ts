import 'server-only'
import { runWalletExpiry } from '@/modules/wallet/account'
import { eachOrg, type CronOrg } from '@/lib/cron'
import { formatDate, isoDateIST } from '@/lib/dates'
import { entitlements } from '@/lib/entitlements'
import { formatINR } from '@/lib/money'
import type { BillingCycle } from '@/lib/plans'
import type { SystemDb } from '@/lib/platform'
import { defaultConsoleSettings, fillTemplate } from '@/lib/console/settings-defaults'
import { consoleSettings } from '@/modules/console/settings-query'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { selectionLabel, selectionOf } from '@/modules/subscription/selection'
import { autopayCovers, type AutopayStatus } from './autopay-state'
import { debitAmountPaise } from './autopay'
import { billButtonSuffix, billingAudience, BILLING_PAGE_SUFFIX, billPublicUrl, sendBillingMessage, type BillingAudience } from './notify'
import { expireProvisionalPayments } from './offline'
import { billBalancePaise, dunningOffset, isDunningExcluded, needsPerDebitApproval, preDebitNoticeDue, renewalNotice, type DunningOffset, type RenewalNotice } from './rules'

/**
 * /api/cron/billing, daily (console spec 11): due-bill reminders and renewal
 * reminders at 15, 7, 3 and 1 days before, on the day and 1, 3 and 7 days
 * after (email first, WhatsApp A where opted in); the autopay pre-debit
 * notice 24–48 hours before each charge; and the end of provisional access
 * for offline payments nobody verified in 7 days. After the last reminder the
 * lifecycle (read-only, then blocked) takes over. Internal, Test and Comped
 * workspaces are skipped; Free and Trial endings stay with the lifecycle
 * reminders. Every message has a dedupe key, so a second run sends nothing.
 */

const days = (n: number) => `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'}`

function dueWording(offset: DunningOffset, number: string, amount: string, dueDate: string) {
  if (offset < 0) return { subject: `Flowbit bill ${number}: ${amount} due in ${days(offset)}`, title: `${amount} is due on ${dueDate}` }
  if (offset === 0) return { subject: `Flowbit bill ${number}: ${amount} due today`, title: `${amount} is due today` }
  return { subject: `Flowbit bill ${number}: ${amount} overdue by ${days(offset)}`, title: `${amount} was due on ${dueDate}` }
}

const RENEWAL_LINE: Record<RenewalNotice, (date: string, amount: string) => { subject: string; text: string }> = {
  renews: (date, amount) => ({ subject: `Your Flowbit plan renews on ${date}`, text: `It renews on ${date} and ${amount} will be debited through your autopay mandate. Nothing to do.` }),
  expires: (date, amount) => ({ subject: `Your Flowbit plan ends on ${date}`, text: `Your paid period ends on ${date}. Renew for ${amount} to keep everything running: pay online or by bank transfer from Settings → Plan & billing, or turn on autopay.` }),
  expired: (date) => ({ subject: 'Your Flowbit plan ended today', text: `Your paid period ended on ${date}. You keep full access for 7 more days; after that the workspace turns read-only until it is paid.` }),
  overdue: (date) => ({ subject: 'Your Flowbit renewal is overdue', text: `Your paid period ended on ${date}. Pay now to keep editing; after 7 days the workspace turns read-only.` }),
}

async function dueBillReminders(db: SystemDb, org: CronOrg, today: string, audience: () => Promise<BillingAudience>): Promise<string[]> {
  const bills = await db.forOrg(org._id).db(SubscriptionInvoice).find({ status: 'due', dueDate: { $type: 'string' } }).lean()
  const sent: string[] = []
  const { templates } = bills.length ? await consoleSettings() : { templates: defaultConsoleSettings().templates }
  for (const bill of bills) {
    const offset = dunningOffset(bill.dueDate!, today)
    if (offset === null || !bill.publicKey) continue
    const amount = formatINR(billBalancePaise(bill), { decimals: 2 })
    const words = dueWording(offset, bill.number, amount, formatDate(bill.dueDate!))
    await sendBillingMessage(
      {
        orgId: org._id,
        event: 'subscription.bill_reminder',
        dedupeKey: `bill:${String(bill._id)}:d${offset}`,
        subject: words.subject,
        title: words.title,
        paragraphs: [fillTemplate(templates.paymentDue, { number: bill.number, amount, date: formatDate(bill.dueDate!) }), `Bill ${bill.number} for ${formatDate(bill.periodStart)} to ${formatDate(bill.periodEnd)}.`, 'Pay online, or pay by bank transfer and share the UTR from Settings → Plan & billing. The GST invoice follows the payment.'],
        cta: { label: 'View and pay', href: billPublicUrl(bill.publicKey) },
        entity: 'SubscriptionInvoice',
        entityId: bill._id,
        whatsapp: { key: 'due_reminder', values: { number: bill.number, amount, dueDate: formatDate(bill.dueDate!) }, extras: { buttonValue: billButtonSuffix(bill.publicKey) } },
        defer: true,
      },
      await audience(),
    )
    sent.push(`bill ${bill.number} ${offset}`)
  }
  return sent
}

async function renewalReminders(org: CronOrg, today: string, now: Date, hasDueBill: boolean, audience: () => Promise<BillingAudience>): Promise<string[]> {
  const sub = org.subscription
  const selection = selectionOf(sub)
  if (!sub || !selection || !sub.currentPeriodEnd || hasDueBill) return []
  const end = new Date(sub.currentPeriodEnd)
  const endDay = isoDateIST(end)
  const offset = dunningOffset(endDay, today)
  if (offset === null) return []
  const autopayActive = autopayCovers(sub.autopay?.status as AutopayStatus | null) || (Boolean(sub.razorpaySubscriptionId) && sub.status === 'active' && !sub.cancelAtPeriodEnd)
  const notice = renewalNotice({ offset, autopayActive, paidThrough: end.getTime() > now.getTime() })
  if (!notice) return []
  const cycle = (sub.cycle ?? 'monthly') as BillingCycle
  const amountPaise = sub.autopay?.amountPaise ?? debitAmountPaise(selection, cycle, sub.billing?.address?.stateCode, sub.unitPrices)
  const amount = formatINR(amountPaise, { decimals: 2 })
  const line = RENEWAL_LINE[notice](formatDate(endDay), amount)
  await sendBillingMessage(
    {
      orgId: org._id,
      event: 'subscription.renewal_reminder',
      dedupeKey: `renewal:${endDay}:${offset}`,
      subject: line.subject,
      title: line.subject,
      paragraphs: [`${selectionLabel(selection)}, ${cycle}.`, line.text],
      cta: { label: 'Open billing', href: '/app/settings/subscription?tab=bills' },
      entity: 'Org',
      entityId: org._id,
      whatsapp: { key: 'renewal_reminder', values: { date: formatDate(endDay), amount }, extras: { buttonValue: BILLING_PAGE_SUFFIX } },
      defer: true,
    },
    await audience(),
  )
  return [`renewal ${notice} ${offset}`]
}

async function preDebitNotice(org: CronOrg, now: Date, audience: () => Promise<BillingAudience>): Promise<string[]> {
  const sub = org.subscription
  const selection = selectionOf(sub)
  if (!sub || !selection) return []
  const covered = autopayCovers(sub.autopay?.status as AutopayStatus | null) || (Boolean(sub.razorpaySubscriptionId) && sub.status === 'active' && !sub.cancelAtPeriodEnd)
  const chargeAt = sub.autopay?.nextChargeAt ? new Date(sub.autopay.nextChargeAt) : sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null
  if (!covered || !chargeAt || !preDebitNoticeDue(chargeAt, now)) return []
  const cycle = (sub.cycle ?? 'monthly') as BillingCycle
  const amountPaise = sub.autopay?.amountPaise ?? debitAmountPaise(selection, cycle, sub.billing?.address?.stateCode, sub.unitPrices)
  const amount = formatINR(amountPaise, { decimals: 2 })
  const date = formatDate(isoDateIST(chargeAt))
  const afa = needsPerDebitApproval({ amountPaise, cycle }) ? ['This debit is above ₹15,000, so your bank or UPI app will ask you to approve it (PIN or OTP). Please approve it when asked, or the renewal fails.'] : []
  await sendBillingMessage(
    {
      orgId: org._id,
      event: 'subscription.pre_debit',
      dedupeKey: `predebit:${chargeAt.toISOString()}`,
      subject: `Pre-debit notice: ${amount} on ${date}`,
      title: `${amount} will be debited on ${date}`,
      paragraphs: [`Your autopay mandate will pay for Flowbit ${selectionLabel(selection)} (${cycle}) on ${date}: ${amount}, GST included.`, ...afa, 'To change or stop autopay, open Settings → Plan & billing before then.'],
      cta: { label: 'Manage autopay', href: '/app/settings/subscription?tab=bills' },
      entity: 'Org',
      entityId: org._id,
      whatsapp: { key: 'renewal_reminder', values: { date, amount }, extras: { buttonValue: BILLING_PAGE_SUFFIX } },
      defer: true,
    },
    await audience(),
  )
  return ['pre-debit']
}

/** One workspace's reminders for today. */
export async function remindWorkspace(db: SystemDb, org: CronOrg, today: string, now: Date): Promise<string[]> {
  let cached: BillingAudience | null = null
  const audience = async () => (cached ??= await billingAudience(org._id))
  const bills = await dueBillReminders(db, org, today, audience)
  const hasDueBill = Boolean(await db.forOrg(org._id).db(SubscriptionInvoice).exists({ status: 'due' }))
  return [...bills, ...(await renewalReminders(org, today, now, hasDueBill, audience)), ...(await preDebitNotice(org, now, audience))]
}

export const includeInDunning = (org: CronOrg, now: Date): boolean => {
  const ent = entitlements(org, now)
  return ent.billed && !isDunningExcluded(ent.accountType)
}

export async function runBillingCron(db: SystemDb, asOf: string) {
  const now = new Date()
  const expired = await expireProvisionalPayments(now)
  // WhatsApp wallet: unused paid credit expires 12 months after its recharge (idempotent per recharge).
  const wallet = await runWalletExpiry(now).catch((error: unknown) => {
    console.error('[billing] wallet expiry failed', error)
    return null
  })
  const orgs = await eachOrg(db, 'billing', (org) => includeInDunning(org, now), (org) => remindWorkspace(db, org, asOf, now))
  return { expired, wallet, orgs: orgs.filter((o) => o.error || (o.result?.length ?? 0) > 0) }
}
