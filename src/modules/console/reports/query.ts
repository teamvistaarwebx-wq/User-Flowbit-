import 'server-only'
import { accountTypeOf, countsInMetrics } from '@/lib/account-types'
import type { StaffCtx } from '@/lib/console/session'
import { isoDateIST } from '@/lib/dates'
import { utmSourceLabel } from '@/lib/utm'
import { Org } from '@/models/Org'
import { ConsoleAccount } from '@/models/console/ConsoleAccount'
import { Staff } from '@/models/console/Staff'
import { ImportBatch } from '@/models/imports/ImportBatch'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { WalletLedger } from '@/models/wallet/WalletLedger'
import { WaConnection } from '@/models/whatsapp/WaConnection'
import type { HealthScore } from '@/modules/console/health'
import { mrrOf } from '@/modules/console/metrics'
import { consoleSettings } from '@/modules/console/settings-query'
import { messageCostPaise, WA_CATEGORIES } from '@/modules/whatsapp/templates'
import type { ReportAccount } from './funnel'
import type { LedgerEntry, MoneyInvoice, RenewalAccount } from './money'

/**
 * Loads what Console reports read, once per page or CSV (./funnel, ./money do
 * the maths). Internal and Test workspaces are dropped here, so no report,
 * total or CSV can include them; their invoices and wallet rows are never read.
 */

const MAX_ORGS = 5_000
/** A signup trial starts with the workspace; a trial started later from Free starts after it. */
const SIGNUP_TRIAL_MS = 10 * 60_000

export type ReportData = Readonly<{
  accounts: ReportAccount[]
  renewals: RenewalAccount[]
  invoices: MoneyInvoice[]
  ledger: LedgerEntry[]
  managedOrgs: ReadonlySet<string>
  /** Provider cost per message by category, paise (fractional kept). */
  costPerMessage: Readonly<Record<string, number>>
  staff: { id: string; name: string }[]
  /** Workspaces left out: Internal and Test. */
  excluded: number
}>

export async function loadReportData(p: StaffCtx, opts: { ledgerSince: Date }): Promise<ReportData> {
  const orgs = await p.raw(Org).find({}, { name: 1, createdAt: 1, subscription: 1, deletedAt: 1, status: 1, signupUtm: 1 }).sort({ createdAt: -1 }).limit(MAX_ORGS).lean()
  const live = orgs.filter((o) => countsInMetrics(accountTypeOf(o.subscription)))
  const ids = live.map((o) => o._id)
  const [accounts, imported, invoices, ledger, connections, staff, settings] = await Promise.all([
    p.raw(ConsoleAccount).find({ orgId: { $in: ids } }, { orgId: 1, salespersonId: 1, 'health.score': 1, 'handover.startedAt': 1, 'handover.steps': 1 }).lean(),
    p.raw(ImportBatch).distinct('orgId', { orgId: { $in: ids }, status: 'done' }),
    p.raw(SubscriptionInvoice)
      .find({ orgId: { $in: ids }, status: { $in: ['paid', 'due'] } }, { orgId: 1, kind: 1, status: 1, periodStart: 1, periodEnd: 1, cycle: 1, taxableValuePaise: 1, totalPaise: 1, receivedPaise: 1, issueDate: 1, dueDate: 1, isTest: 1, tds: 1, 'payment.paidAt': 1, 'payment.provider': 1, createdAt: 1 })
      .lean(),
    p.raw(WalletLedger).find({ orgId: { $in: ids }, type: { $in: ['recharge', 'debit', 'refund', 'free'] }, at: { $gte: opts.ledgerSince } }, { orgId: 1, type: 1, at: 1, amountPaise: 1, paidPaise: 1, category: 1 }).lean(),
    p.raw(WaConnection).find({ orgId: { $in: ids }, mode: 'managed' }, { orgId: 1 }).lean(),
    p.raw(Staff).find({ role: { $in: ['sales', 'admin'] } }, { name: 1, status: 1 }).sort({ name: 1 }).lean(),
    consoleSettings(),
  ])
  const byOrg = new Map(accounts.map((a) => [String(a.orgId), a]))
  const importedSet = new Set(imported.map(String))
  const now = new Date()
  const firstPaid = new Map<string, Date>()
  for (const i of invoices) {
    if (i.status !== 'paid' || i.kind === 'wallet_recharge' || i.isTest || i.payment?.provider === 'simulated') continue
    const at = new Date(i.payment?.paidAt ?? i.createdAt)
    const key = String(i.orgId)
    const prev = firstPaid.get(key)
    if (!prev || at < prev) firstPaid.set(key, at)
  }
  const assigned = new Set(accounts.flatMap((a) => (a.salespersonId ? [String(a.salespersonId)] : [])))
  return {
    accounts: live.map((o): ReportAccount => {
      const account = byOrg.get(String(o._id))
      const sub = o.subscription
      const created = new Date(o.createdAt)
      const trialStarted = sub?.trialStartedAt ? new Date(sub.trialStartedAt) : null
      const utm = o.signupUtm ?? null
      return {
        id: String(o._id),
        name: o.name,
        createdAt: created,
        accountType: accountTypeOf(sub),
        inMetrics: true,
        deleted: Boolean(o.deletedAt) || o.status === 'deleted',
        signupType: trialStarted && trialStarted.getTime() - created.getTime() < SIGNUP_TRIAL_MS ? 'trial' : sub?.accountType === 'free' || sub?.freeEndsAt ? 'free' : 'trial',
        setupStarted: Boolean(account?.handover?.startedAt),
        imported: importedSet.has(String(o._id)),
        health: (account?.health?.score as HealthScore | undefined) ?? null,
        paidAt: firstPaid.get(String(o._id)) ?? null,
        mrrPaise: mrrOf(sub, now),
        salespersonId: account?.salespersonId ? String(account.salespersonId) : null,
        utmSource: utmSourceLabel(utm ? { source: utm.source ?? undefined, referrer: utm.referrer ?? undefined } : null),
        utmMedium: utm?.medium ?? null,
        utmCampaign: utm?.campaign ?? null,
      }
    }),
    renewals: live.map((o) => ({
      id: String(o._id),
      name: o.name,
      periodEnd: o.subscription?.currentPeriodEnd ? new Date(o.subscription.currentPeriodEnd) : null,
      amountPaise: o.subscription?.amountPaise ?? 0,
      cycle: o.subscription?.cycle ?? null,
      autopay: Boolean(o.subscription?.razorpaySubscriptionId || ['active', 'authenticated'].includes(o.subscription?.autopay?.status ?? '')),
      cancelAtPeriodEnd: Boolean(o.subscription?.cancelAtPeriodEnd),
      paid: !o.deletedAt && o.subscription?.status === 'active' && Boolean(o.subscription?.plan && o.subscription.plan !== 'trial'),
    })),
    invoices: invoices.map((i) => ({
      orgId: String(i.orgId),
      kind: (i.kind ?? 'subscription') as MoneyInvoice['kind'],
      status: i.status as MoneyInvoice['status'],
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      cycle: (i.cycle ?? null) as MoneyInvoice['cycle'],
      taxableValuePaise: i.taxableValuePaise,
      totalPaise: i.totalPaise,
      receivedPaise: i.receivedPaise ?? 0,
      paidOn: i.payment?.paidAt ? isoDateIST(new Date(i.payment.paidAt)) : i.issueDate,
      dueDate: i.dueDate ?? null,
      isTest: Boolean(i.isTest) || i.payment?.provider === 'simulated',
      tds: i.tds ? { declared: Boolean(i.tds.declared), amountPaise: i.tds.amountPaise ?? 0, certificateStatus: i.tds.certificateStatus ?? null } : null,
    })),
    ledger: ledger.map((e) => ({ orgId: String(e.orgId), type: e.type, at: new Date(e.at), amountPaise: e.amountPaise, paidPaise: e.paidPaise ?? 0, category: e.category ?? null })),
    managedOrgs: new Set(connections.map((c) => String(c.orgId))),
    costPerMessage: Object.fromEntries(WA_CATEGORIES.map((c) => [c, messageCostPaise(c, settings.whatsapp.rates)])),
    staff: staff.filter((s) => s.status === 'active' || assigned.has(String(s._id))).map((s) => ({ id: String(s._id), name: s.status === 'active' ? s.name : `${s.name} (former)` })),
    excluded: orgs.length - live.length,
  }
}
