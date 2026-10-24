import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { CompOff } from '@/models/muster/CompOff'
import { LeaveBalance } from '@/models/muster/LeaveBalance'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { LeaveType } from '@/models/muster/LeaveType'
import { COMP_OFF_CODE } from '../settings/defaults'
import { getPolicy } from '../settings/queries'
import { accruedDays, accruesLeave, leaveYearFor, openingBalance, previousLeaveYear, type AccrualModel, type LeaveYear } from './accrual'
import { compOffEarned } from './comp-off-credit'

/**
 * Leave balances are computed, never stored: opening (carried forward) +
 * accrued + HR adjustments − paid days of approved leave. Pending requests
 * are shown beside the balance, not taken from it.
 */

export type BalanceRow = {
  typeId: string
  code: string
  name: string
  model: AccrualModel
  accrues: boolean
  opening: number
  accrued: number
  adjusted: number
  taken: number
  pending: number
  /** null for on-application types: they are granted per request up to `perRequestCap`. */
  remaining: number | null
  perRequestCap: number | null
}

type Person = { _id: Types.ObjectId; employmentType: string; status: string; joinDate: string; exitDate?: string | null }
type TypeDoc = { _id: Types.ObjectId; code: string; name: string; isPaid: boolean; accrualModel: AccrualModel; annualQuota: number; accrualPerMonth: number; carryForwardCap?: number | null }
type Req = { employeeId: Types.ObjectId; leaveTypeId: Types.ObjectId; startDate: string; paidDays: number; status: string }

const PRIOR_YEARS = 3
const r2 = (n: number) => Math.round(n * 100) / 100

type Loaded = {
  types: TypeDoc[]
  year: LeaveYear
  priors: LeaveYear[]
  carryPercent: number
  requests: Req[]
  /** Every year's adjustments: comp-off counts them all, other types by leave year. */
  adjustments: { employeeId: Types.ObjectId; leaveTypeId: Types.ObjectId; days: number; leaveYear: string }[]
  compOffs: { employeeId: Types.ObjectId; days: number; expiresOn?: string | null }[]
}

async function load(ctx: Ctx, employeeIds: Types.ObjectId[], asOf: string): Promise<Loaded> {
  const policy = await getPolicy(ctx)
  const startMonth = policy.leave.leaveYearStartMonth
  const year = leaveYearFor(asOf, startMonth)
  const priors: LeaveYear[] = []
  let cursor = year
  for (let i = 0; i < PRIOR_YEARS; i += 1) {
    cursor = previousLeaveYear(cursor, startMonth)
    priors.unshift(cursor)
  }
  const [types, requests, adjustments, compOffs] = await Promise.all([
    ctx.db(LeaveType).find({ isActive: true, isPaid: true }).sort({ displayOrder: 1, code: 1 }).lean(),
    ctx.db(LeaveRequest).find({ employeeId: { $in: employeeIds }, status: { $in: ['approved', 'pending'] } }, { employeeId: 1, leaveTypeId: 1, startDate: 1, paidDays: 1, status: 1 }).lean(),
    ctx.db(LeaveBalance).find({ employeeId: { $in: employeeIds } }, { employeeId: 1, leaveTypeId: 1, days: 1, leaveYear: 1 }).lean(),
    ctx.db(CompOff).find({ employeeId: { $in: employeeIds }, status: 'approved' }, { employeeId: 1, days: 1, expiresOn: 1 }).lean(),
  ])
  return { types: types as TypeDoc[], year, priors, carryPercent: policy.leave.carryForwardPercent, requests: requests as Req[], adjustments, compOffs }
}

const same = (a: Types.ObjectId, b: Types.ObjectId) => String(a) === String(b)
const inYear = (d: string, y: LeaveYear) => d >= y.start && d <= y.end

function balancesFor(person: Person, l: Loaded, asOf: string): BalanceRow[] {
  const mine = l.requests.filter((r) => same(r.employeeId, person._id))
  const sumPaid = (type: TypeDoc, pred: (r: Req) => boolean) => r2(mine.filter((r) => same(r.leaveTypeId, type._id) && pred(r)).reduce((s, r) => s + (r.paidDays ?? 0), 0))
  const accrues = accruesLeave(person)
  return l.types.map((type) => {
    const base = { typeId: String(type._id), code: type.code, name: type.name, model: type.accrualModel, accrues }
    const typeAdjustments = l.adjustments.filter((a) => same(a.employeeId, person._id) && same(a.leaveTypeId, type._id))
    const adjustedIn = (label: string | null) => r2(typeAdjustments.filter((a) => label === null || a.leaveYear === label).reduce((s, a) => s + a.days, 0))
    const adjusted = adjustedIn(type.code === COMP_OFF_CODE ? null : l.year.label)
    const pending = sumPaid(type, (r) => r.status === 'pending')
    if (type.code === COMP_OFF_CODE) {
      const uses = mine.filter((r) => same(r.leaveTypeId, type._id) && r.status === 'approved').map((r) => ({ startDate: r.startDate, paidDays: r.paidDays ?? 0 }))
      const earned = compOffEarned(l.compOffs.filter((c) => same(c.employeeId, person._id)), uses, asOf)
      const taken = sumPaid(type, (r) => r.status === 'approved')
      return { ...base, accrues: true, opening: 0, accrued: earned, adjusted, taken, pending, remaining: r2(earned + adjusted - taken), perRequestCap: null }
    }
    const taken = sumPaid(type, (r) => r.status === 'approved' && inYear(r.startDate, l.year))
    if (type.accrualModel === 'on_application') return { ...base, opening: 0, accrued: 0, adjusted, taken, pending, remaining: null, perRequestCap: type.annualQuota }
    const rule = { accrualModel: type.accrualModel, annualQuota: type.annualQuota, accrualPerMonth: type.accrualPerMonth, carryForwardCap: type.carryForwardCap ?? null }
    const accrued = accruedDays(rule, person, l.year, asOf)
    const carries = type.accrualModel === 'monthly' || type.accrualModel === 'annual'
    const priorYears = carries ? l.priors.filter((y) => y.end >= person.joinDate).map((y) => ({ accrued: accruedDays(rule, person, y, y.end), taken: sumPaid(type, (r) => r.status === 'approved' && inYear(r.startDate, y)), adjusted: adjustedIn(y.label) })) : []
    const opening = carries ? openingBalance(priorYears, l.carryPercent, rule.carryForwardCap) : 0
    return { ...base, opening, accrued, adjusted, taken, pending, remaining: r2(opening + accrued + adjusted - taken), perRequestCap: null }
  })
}

export async function getLeaveBalances(ctx: Ctx, person: Person, asOf: string): Promise<{ year: LeaveYear; rows: BalanceRow[] }> {
  const loaded = await load(ctx, [person._id], asOf)
  return { year: loaded.year, rows: balancesFor(person, loaded, asOf) }
}

export async function teamBalances(ctx: Ctx, people: Person[], asOf: string): Promise<{ year: LeaveYear; types: { id: string; code: string; name: string }[]; byEmployee: Map<string, BalanceRow[]> }> {
  const loaded = await load(ctx, people.map((p) => p._id), asOf)
  const types = loaded.types.filter((t) => t.accrualModel !== 'on_application' || t.code === COMP_OFF_CODE).map((t) => ({ id: String(t._id), code: t.code, name: t.name }))
  return { year: loaded.year, types, byEmployee: new Map(people.map((p) => [String(p._id), balancesFor(p, loaded, asOf)])) }
}

/** Days the balance can pay for this type (null = no balance applies). */
export async function availableDays(ctx: Ctx, person: Person, typeId: string, asOf: string): Promise<BalanceRow | null> {
  const { rows } = await getLeaveBalances(ctx, person, asOf)
  return rows.find((r) => r.typeId === typeId) ?? null
}
