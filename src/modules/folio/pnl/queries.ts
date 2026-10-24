import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { mongoose } from '@/lib/db'
import { CreditNote } from '@/models/folio/CreditNote'
import { Invoice } from '@/models/folio/Invoice'
import { monthsIn } from '@/modules/folio/engine/period'
import { expenseCategories, expenseTotalsByMonth } from '@/modules/folio/expenses/queries'
import { BILLED_STATUSES, entityMatch } from '@/modules/folio/queries/common'
import { buildPnl, type MonthAmount, type Pnl } from './pnl-math'

/**
 * The P&L view's reads. Salaries come straight from Muster's payroll
 * collections (released months only, always with this org's id), so Folio
 * does not depend on Muster's model files.
 */

/** Why salaries are or are not in the numbers. */
export type PayrollState = 'included' | 'none_released' | 'muster_off' | 'no_access' | 'firm'

export type PnlView = Pnl & { payroll: { state: PayrollState; releasedMonths: string[] } }

const RELEASED = ['released', 'payslips_published']

const monthKey = (field: string) => ({ $substrBytes: [field, 0, 7] })

async function taxableByMonth(ctx: Ctx, from: string, to: string, entityId: string | null): Promise<{ income: MonthAmount[]; credits: MonthAmount[] }> {
  const [income, credits] = await Promise.all([
    ctx.db(Invoice).aggregate<{ _id: string; n: number }>([
      { $match: { status: { $in: [...BILLED_STATUSES] }, billingType: { $ne: 'opening' }, ...entityMatch(entityId), issueDate: { $gte: from, $lte: to } } },
      { $group: { _id: monthKey('$issueDate'), n: { $sum: '$taxablePaise' } } },
    ]),
    ctx.db(CreditNote).aggregate<{ _id: string; n: number }>([
      { $match: { status: 'issued', ...entityMatch(entityId), noteDate: { $gte: from, $lte: to } } },
      { $group: { _id: monthKey('$noteDate'), n: { $sum: '$taxablePaise' } } },
    ]),
  ])
  const shape = (rows: { _id: string; n: number }[]) => rows.map((r) => ({ month: r._id, paise: r.n }))
  return { income: shape(income), credits: shape(credits) }
}

type RawCycle = { _id: Types.ObjectId; year: number; month: number }

/** Employer cost (earnings + employer PF/ESI) of released payroll months, per month. */
async function releasedPayroll(ctx: Ctx, months: string[]): Promise<MonthAmount[]> {
  const db = mongoose.connection.db
  if (!db || !months.length) return []
  const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))]
  const cycles = (await db.collection('payrollcycles').find({ orgId: ctx.orgId, status: { $in: RELEASED }, year: { $in: years } }, { projection: { year: 1, month: 1 } }).toArray()) as unknown as RawCycle[]
  const inRange = cycles.filter((c) => months.includes(`${c.year}-${String(c.month).padStart(2, '0')}`))
  if (!inRange.length) return []
  const totals = (await db
    .collection('payrollentries')
    .aggregate([
      { $match: { orgId: ctx.orgId, cycleId: { $in: inRange.map((c) => c._id) }, status: 'ready' } },
      { $group: { _id: '$cycleId', n: { $sum: { $add: [{ $ifNull: ['$totalEarnings', 0] }, { $ifNull: ['$totalEmployerContrib', 0] }] } } } },
    ])
    .toArray()) as { _id: Types.ObjectId; n: number }[]
  const byCycle = new Map(totals.map((t) => [String(t._id), t.n]))
  return inRange.map((c) => ({ month: `${c.year}-${String(c.month).padStart(2, '0')}`, paise: byCycle.get(String(c._id)) ?? 0 }))
}

function payrollState(ctx: Ctx, entityId: string | null): PayrollState | null {
  if (!ctx.has('muster') || !ctx.hasFeature('muster.payroll')) return 'muster_off'
  if (!ctx.can('payroll.read')) return 'no_access'
  if (entityId) return 'firm'
  return null
}

export async function profitAndLoss(ctx: Ctx, opts: { from: string; to: string; entityId: string | null }): Promise<PnlView> {
  const months = monthsIn(opts.from, opts.to)
  const blocked = payrollState(ctx, opts.entityId)
  const [taxable, expenses, categories, payroll] = await Promise.all([
    taxableByMonth(ctx, opts.from, opts.to, opts.entityId),
    expenseTotalsByMonth(ctx, opts.from, opts.to, opts.entityId),
    expenseCategories(ctx),
    blocked ? Promise.resolve(null) : releasedPayroll(ctx, months).catch((error: unknown) => {
      console.error('[folio] reading Muster payroll for the P&L failed', error)
      return []
    }),
  ])
  const pnl = buildPnl({ months, ...taxable, expenses: expenses.map((e) => ({ month: e.month, categoryId: e.categoryId, paise: e.netPaise })), categories, payroll: payroll?.length ? payroll : null })
  return { ...pnl, payroll: { state: blocked ?? (payroll?.length ? 'included' : 'none_released'), releasedMonths: (payroll ?? []).map((p) => p.month) } }
}

export const PAYROLL_NOTES: Record<PayrollState, string> = {
  included: 'Salaries are the employer cost (earnings plus employer PF/ESI) of payroll months released in Muster.',
  none_released: 'No Muster payroll was released in this period, so salaries are not in these numbers yet.',
  muster_off: 'Muster not active: salaries are not included. Book them as expenses, or switch on Muster payroll.',
  no_access: 'Salaries are hidden because you cannot see payroll. Net profit here leaves them out.',
  firm: 'Muster payroll is not split by firm, so salaries appear only in the Combined view. Net profit here leaves them out.',
}
