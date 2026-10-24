import 'server-only'
import { addDays, todayIST } from '@/lib/dates'
import { FolioEntity } from '@/models/folio/Entity'
import { FolioFollowup } from '@/models/folio/Followup'
import { FolioReceipt } from '@/models/folio/Receipt'
import { FolioRetainer } from '@/models/folio/Retainer'
import { Invoice } from '@/models/folio/Invoice'
import { daysSalesOutstanding, summariseAging, type AgingSummary } from '@/modules/folio/engine/aging'
import { previousPeriod, resolveBoundedPeriod, type BoundedPeriod } from '@/modules/folio/engine/period'
import { retainerSchedules } from '@/modules/folio/recurring/generate'
import { balancesByClient, listOutstanding, type ClientBalance } from './balances'
import { BILLED_STATUSES, entityMatch, type FolioScope } from './common'
import { monthlyTotals, type MonthTotal } from './ledger'

/** Everything the Folio dashboard shows (folio.md 6.19), for one firm or all of them. */
export type FolioDashboard = {
  today: string
  period: BoundedPeriod
  /** The period before, for the collected comparison (null for a custom range). */
  previous: { noun: string } | null
  hasEntity: boolean
  hasInvoices: boolean
  outstandingPaise: number
  netReceivablePaise: number
  unappliedPaise: number
  overduePaise: number
  overdueCount: number
  collectedPaise: number
  collectedPreviousPaise: number | null
  billedPaise: number
  draftCount: number
  dsoDays: number | null
  followupsDue: number
  retainersToBill: number
  aging: AgingSummary
  topDebtors: ClientBalance[]
  trend: MonthTotal[]
}

export type DashboardOptions = { entityId?: string | null; period?: BoundedPeriod }

async function sumField(scope: FolioScope, kind: 'receipts' | 'invoices', from: string, to: string, entityId?: string | null): Promise<number> {
  const rows =
    kind === 'receipts'
      ? await scope.db(FolioReceipt).aggregate<{ n: number }>([{ $match: { status: 'recorded', ...entityMatch(entityId), receivedOn: { $gte: from, $lte: to } } }, { $group: { _id: null, n: { $sum: '$amountPaise' } } }])
      : await scope.db(Invoice).aggregate<{ n: number }>([
          { $match: { status: { $in: [...BILLED_STATUSES] }, billingType: { $ne: 'opening' }, ...entityMatch(entityId), issueDate: { $gte: from, $lte: to } } },
          { $group: { _id: null, n: { $sum: '$totalPaise' } } },
        ])
  return rows[0]?.n ?? 0
}

/** Retainers with at least one billing date that has no non-void invoice yet. */
export async function retainersDueCount(scope: FolioScope, today: string, entityId?: string | null): Promise<number> {
  const retainers = await scope.db(FolioRetainer).find({ status: 'active', ...entityMatch(entityId) }).lean()
  if (!retainers.length) return 0
  const schedules = await retainerSchedules(scope, retainers, today)
  return [...schedules.values()].filter((s) => s.due.length > 0).length
}

export async function folioDashboard(scope: FolioScope, today: string = todayIST(), opts: DashboardOptions = {}): Promise<FolioDashboard> {
  const entityId = opts.entityId ?? null
  const period = opts.period ?? resolveBoundedPeriod({}, today)
  const prev = previousPeriod(period)
  const firm = entityMatch(entityId)
  const [entities, invoiceCount, draftCount, balances, outstanding, collected, collectedPrev, billed, billed90, followupsDue, retainersToBill, trend] = await Promise.all([
    scope.db(FolioEntity).countDocuments({}),
    scope.db(Invoice).countDocuments({ status: { $ne: 'draft' }, billingType: { $ne: 'opening' }, ...firm }),
    scope.db(Invoice).countDocuments({ status: 'draft', ...firm }),
    balancesByClient(scope, today, entityId),
    listOutstanding(scope, undefined, today, entityId),
    sumField(scope, 'receipts', period.from, period.to, entityId),
    prev ? sumField(scope, 'receipts', prev.from, prev.to, entityId) : Promise.resolve(null),
    sumField(scope, 'invoices', period.from, period.to, entityId),
    sumField(scope, 'invoices', addDays(today, -90), today, entityId),
    scope.db(FolioFollowup).countDocuments({ $or: [{ status: 'open', dueOn: { $lte: today } }, { status: 'snoozed', snoozedUntil: { $lte: today } }] }),
    retainersDueCount(scope, today, entityId),
    monthlyTotals(scope, 6, today, entityId),
  ])
  const outstandingPaise = balances.reduce((s, b) => s + b.outstandingPaise, 0)
  const unappliedPaise = balances.reduce((s, b) => s + b.unappliedCreditPaise, 0)
  const netReceivablePaise = outstandingPaise - unappliedPaise
  const overdueRows = outstanding.filter((r) => r.daysOverdue > 0)
  return {
    today,
    period,
    previous: prev ? { noun: prev.noun } : null,
    hasEntity: entities > 0,
    hasInvoices: invoiceCount > 0 || draftCount > 0,
    outstandingPaise,
    netReceivablePaise,
    unappliedPaise,
    overduePaise: overdueRows.reduce((s, r) => s + r.balancePaise, 0),
    overdueCount: overdueRows.length,
    collectedPaise: collected,
    collectedPreviousPaise: collectedPrev,
    billedPaise: billed,
    draftCount,
    dsoDays: daysSalesOutstanding(Math.max(0, netReceivablePaise), billed90, 90),
    followupsDue,
    retainersToBill,
    aging: summariseAging(outstanding, today),
    topDebtors: balances
      .filter((b) => b.overduePaise > 0)
      .sort((a, b) => b.overduePaise - a.overduePaise)
      .slice(0, 8),
    trend,
  }
}
