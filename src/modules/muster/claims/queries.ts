import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { escapeRegex } from '@/lib/utils'
import { Claim } from '@/models/muster/Claim'
import { ClaimCategory } from '@/models/muster/ClaimCategory'
import { ClaimForm } from '@/models/muster/ClaimForm'
import { Employee } from '@/models/muster/Employee'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { cycleLabel } from '@/modules/muster/payroll/queries'
import { ownEmployeeId, visibleEmployeeIds, visibleFilter } from '@/modules/muster/people/scope'
import { APPROVED, UNDECIDED, type ClaimStatus } from './constants'

export const CLAIM_TABS = ['review', 'approved', 'scheduled', 'paid', 'rejected', 'all'] as const
export type ClaimTab = (typeof CLAIM_TABS)[number]

const TAB_STATUSES: Record<ClaimTab, readonly ClaimStatus[] | null> = {
  review: UNDECIDED,
  approved: APPROVED,
  scheduled: ['scheduled_for_payroll'],
  paid: ['paid'],
  rejected: ['rejected'],
  all: null,
}

export type ClaimTotals = Record<'pending' | 'approved' | 'paid' | 'rejected', { count: number; amount: number }>

/** Pending / approved (incl. scheduled) / paid / rejected totals over the claims the reader may see. */
export async function claimTotals(ctx: Ctx, extra: Record<string, unknown> = {}): Promise<ClaimTotals> {
  const scope = visibleFilter(await visibleEmployeeIds(ctx), 'employeeId')
  const rows = await ctx.db(Claim).aggregate<{ _id: ClaimStatus; count: number; claimed: number; approved: number }>([
    { $match: { ...scope, ...extra } },
    { $group: { _id: '$status', count: { $sum: 1 }, claimed: { $sum: '$amountClaimed' }, approved: { $sum: { $ifNull: ['$amountApproved', '$amountClaimed'] } } } },
  ])
  const sum = (statuses: readonly ClaimStatus[], field: 'claimed' | 'approved') =>
    rows.filter((r) => statuses.includes(r._id)).reduce((acc, r) => ({ count: acc.count + r.count, amount: acc.amount + r[field] }), { count: 0, amount: 0 })
  return {
    pending: sum(UNDECIDED, 'claimed'),
    approved: sum([...APPROVED, 'scheduled_for_payroll'], 'approved'),
    paid: sum(['paid'], 'approved'),
    rejected: sum(['rejected'], 'claimed'),
  }
}

/** Claims for a tab (or a form), with names resolved, newest expense first. */
export async function listClaims(ctx: Ctx, opts: { tab: ClaimTab; q?: string; formId?: Types.ObjectId; skip: number; limit: number }) {
  const scope = visibleFilter(await visibleEmployeeIds(ctx), 'employeeId')
  const statuses = TAB_STATUSES[opts.tab]
  const filter: Record<string, unknown> = { ...scope, ...(statuses ? { status: { $in: statuses } } : {}), ...(opts.formId ? { formId: opts.formId } : {}) }
  if (opts.tab === 'approved') {
    // Claims left "In payroll" on a month released without them still need paying, so they are listed (and can be sent on) here.
    const released = await ctx.db(PayrollCycle).distinct('_id', { status: { $in: ['released', 'payslips_published'] } })
    if (released.length) {
      delete filter.status
      filter.$and = [{ $or: [{ status: { $in: statuses } }, { status: 'scheduled_for_payroll', payrollCycleId: { $in: released } }] }]
    }
  }
  if (opts.q) {
    const rx = new RegExp(escapeRegex(opts.q), 'i')
    const matching = await ctx.db(Employee).find({ fullName: rx }, { _id: 1 }).lean()
    filter.$or = [{ purpose: rx }, { vendor: rx }, { project: rx }, { employeeId: { $in: matching.map((e) => e._id) } }]
  }
  const [claims, total] = await Promise.all([
    ctx.db(Claim).find(filter).sort({ createdAt: -1 }).skip(opts.skip).limit(opts.limit).lean(),
    ctx.db(Claim).countDocuments(filter),
  ])
  const [people, categories, forms, cycles] = await Promise.all([
    ctx.db(Employee).find({ _id: { $in: claims.map((c) => c.employeeId) } }, { fullName: 1, code: 1 }).lean(),
    ctx.db(ClaimCategory).find({ _id: { $in: claims.map((c) => c.categoryId) } }, { name: 1 }).lean(),
    ctx.db(ClaimForm).find({ _id: { $in: claims.map((c) => c.formId).filter(Boolean) } }, { name: 1 }).lean(),
    ctx.db(PayrollCycle).find({ _id: { $in: claims.map((c) => c.payrollCycleId).filter(Boolean) } }, { year: 1, month: 1 }).lean(),
  ])
  const person = new Map(people.map((p) => [String(p._id), p]))
  const category = new Map(categories.map((c) => [String(c._id), c.name]))
  const form = new Map(forms.map((f) => [String(f._id), f.name]))
  const cycle = new Map(cycles.map((c) => [String(c._id), cycleLabel(c)]))
  const own = ownEmployeeId(ctx)
  const rows = claims.map((c) => ({
    id: String(c._id),
    employee: person.get(String(c.employeeId))?.fullName ?? 'Former employee',
    code: person.get(String(c.employeeId))?.code ?? '',
    own: own === String(c.employeeId) && !ctx.can('roles.manage'),
    expenseDate: c.expenseDate,
    purpose: c.purpose,
    vendor: c.vendor ?? null,
    project: c.project ?? null,
    category: category.get(String(c.categoryId)) ?? '—',
    claimed: c.amountClaimed,
    approved: c.amountApproved ?? null,
    status: c.status as ClaimStatus,
    reviewNote: c.reviewNote ?? null,
    receipts: c.attachments?.length ?? 0,
    formName: c.formId ? (form.get(String(c.formId)) ?? null) : null,
    cycleLabel: c.payrollCycleId ? (cycle.get(String(c.payrollCycleId)) ?? null) : null,
  }))
  return { rows, total }
}

/** Payroll months claims can still be scheduled into (not locked), newest first. */
export async function schedulableCycles(ctx: Pick<Ctx, 'db'>) {
  const cycles = await ctx.db(PayrollCycle).find({ status: { $nin: ['locked', 'released', 'payslips_published'] } }, { year: 1, month: 1 }).sort({ year: -1, month: -1 }).lean()
  return cycles.map((c) => ({ value: String(c._id), label: cycleLabel(c) }))
}
