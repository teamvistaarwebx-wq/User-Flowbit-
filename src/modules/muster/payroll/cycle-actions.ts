'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { withTransaction } from '@/lib/db'
import { formatDate, istInstant, monthRange, todayIST } from '@/lib/dates'
import { NotFoundError, UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { notifyMembers, notifyPermission } from '@/lib/notify'
import { isoDate, isoMonth, objectId, optionalText, requiredText } from '@/lib/validation'
import { Claim } from '@/models/muster/Claim'
import { ClaimForm } from '@/models/muster/ClaimForm'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { Employee } from '@/models/muster/Employee'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { returnScheduledClaims } from '../claims/unschedule'
import { generatePayroll, generationMessage } from './generate'
import { failureSummary, publishPayslips } from './payslips'
import { attendanceLocked, cycleLabel, getCycle } from './queries'
import { AttendancePeriod } from '@/models/muster/AttendancePeriod'
import { readSnapshot } from './snapshot'
import { ADVANCE_FROM, ADVANCE_PERMISSION, REOPENABLE, STAGE_LABELS, advanceRefusal, attendanceGateRefusal, canCloseClaims, type AdvanceTarget } from './stages'

const OPTS = { product: 'muster', feature: 'muster.payroll' } as const
const paths = (id: string) => {
  revalidatePath('/app/hr/payroll')
  revalidatePath(`/app/hr/payroll/${id}`)
}

async function cycleOr404(ctx: Parameters<typeof getCycle>[0], id: string) {
  const cycle = await getCycle(ctx, id)
  if (!cycle) throw new NotFoundError('That payroll month')
  return cycle
}

export const openPayrollMonth = action(
  z.object({ month: isoMonth }),
  async ({ month }, ctx) => {
    const [year, m] = month.split('-').map(Number)
    const thisYear = Number(todayIST().slice(0, 4))
    if (m < 1 || m > 12 || year < 2000 || year > thisYear + 1) return fail('Pick a month between 2000 and next year.', { month: 'Pick a real month' })
    const label = cycleLabel({ year, month: m })
    const existing = await ctx.db(PayrollCycle).findOne({ year, month: m }, { _id: 1 }).lean()
    if (existing) return ok(`${label} payroll was already open. Here it is.`, undefined, `/app/hr/payroll/${existing._id}`)
    const { start, end } = monthRange(month)
    const status = (await attendanceLocked(ctx, year, m)) ? 'attendance_locked' : 'attendance_open'
    const cycle = await ctx.db(PayrollCycle).create({ year, month: m, periodStart: start, periodEnd: end, status })
    await audit(ctx, { action: 'payroll.opened', entity: 'PayrollCycle', entityId: cycle._id, summary: `Opened ${label} payroll`, product: 'muster' })
    revalidatePath('/app/hr/payroll')
    return ok(`${label} payroll opened.`, undefined, `/app/hr/payroll/${cycle._id}`)
  },
  { ...OPTS, perm: 'payroll.run' },
)

export const closeClaimCollection = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const cycle = await cycleOr404(ctx, id)
    const label = cycleLabel(cycle)
    if (!canCloseClaims(cycle.status)) return fail(`${label} is already past claim collection. The page has been refreshed to show where the month is.`)
    const closed = await withTransaction(async (session) => {
      const forms = await ctx.db(ClaimForm).updateMany({ includeInPayroll: true, payrollYear: cycle.year, payrollMonth: cycle.month, status: 'open' }, { $set: { status: 'closed' } }, { session })
      const moved = await ctx.db(PayrollCycle).updateOne({ _id: cycle._id, status: cycle.status }, { $set: { status: 'reimbursements_closed', claimsClosed: { at: new Date(), by: ctx.userId, name: ctx.user.name } } }, { session })
      if (!moved.modifiedCount) throw new UserError(`${label} payroll moved on while you were looking. The page has been refreshed.`)
      return forms.modifiedCount
    })
    await audit(ctx, { action: 'payroll.claims_closed', entity: 'PayrollCycle', entityId: cycle._id, summary: `Closed claim collection for ${label} (${closed} form${closed === 1 ? '' : 's'} closed)`, product: 'muster' })
    paths(id)
    return ok(`Claim collection closed for ${label}${closed ? `: ${closed} claim form${closed === 1 ? '' : 's'} no longer take claims` : ''}.`)
  },
  { ...OPTS, perm: 'payroll.run' },
)

export const generatePayrollMonth = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const cycle = await cycleOr404(ctx, id)
    const report = await generatePayroll(ctx, cycle)
    const label = cycleLabel(cycle)
    await audit(ctx, { action: 'payroll.generated', entity: 'PayrollCycle', entityId: cycle._id, summary: `Generated ${label} payroll for ${report.paid + report.onHold} people (${report.skipped.length} skipped)`, product: 'muster', meta: { skipped: report.skipped.map((s) => `${s.name}: ${s.reason}`) } })
    paths(id)
    return ok(generationMessage(report))
  },
  { ...OPTS, perm: 'payroll.run' },
)

/** Salary accounts changed in self-service and not yet verified, for people paid in this month. */
async function unverifiedBankRefusal(ctx: Parameters<typeof getCycle>[0], cycleId: unknown, label: string): Promise<string | null> {
  const employeeIds = await ctx.db(PayrollEntry).distinct('employeeId', { cycleId, status: 'ready' })
  if (!employeeIds.length) return null
  const pending = await ctx.db(BankChangeRequest).find({ employeeId: { $in: employeeIds }, verifiedAt: null }, { employeeName: 1 }).lean()
  if (!pending.length) return null
  const names = [...new Set(pending.map((p) => p.employeeName))]
  const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '')
  return `${label} payroll pays a bank account that has not been verified yet (${shown}). Someone with access to sensitive details has to verify it first.`
}

/** Payroll moves forward only over a locked attendance month, so a paid month's attendance cannot change underneath it. */
async function openAttendanceRefusal(ctx: Parameters<typeof getCycle>[0], cycle: { year: number; month: number; generated?: { at?: Date | null } | null }, label: string): Promise<string | null> {
  const period = await ctx.db(AttendancePeriod).findOne({ year: cycle.year, month: cycle.month }, { status: 1, lockedAt: 1, reopenedAt: 1 }).lean()
  return attendanceGateRefusal(period, cycle.generated?.at, label)
}

/** Claims scheduled into this month after it was generated, for people who are paid in it: they would be left out of net pay. */
async function lateClaimsRefusal(ctx: Parameters<typeof getCycle>[0], cycleId: unknown, label: string): Promise<string | null> {
  const entries = await ctx.db(PayrollEntry).find({ cycleId, status: 'ready' }, { employeeId: 1, snapshot: 1 }).lean()
  const inRegister = entries.flatMap((e) => readSnapshot(e.snapshot)?.reimbursement.claimIds ?? [])
  const late = await ctx.db(Claim).countDocuments({ payrollCycleId: cycleId, status: 'scheduled_for_payroll', employeeId: { $in: entries.map((e) => e.employeeId) }, _id: { $nin: inRegister } })
  if (!late) return null
  return `${late} claim${late === 1 ? ' was' : 's were'} sent to ${label} payroll after it was generated. Regenerate the month so ${late === 1 ? 'it reaches' : 'they reach'} net pay, then lock it.`
}

const NEXT_NOTICE: Record<AdvanceTarget, { perm: 'payroll.approve' | 'payroll.lock' | 'payroll.release'; title: (l: string) => string }> = {
  hr_reviewed: { perm: 'payroll.approve', title: (l) => `${l} payroll is ready for Finance approval` },
  finance_approved: { perm: 'payroll.lock', title: (l) => `${l} payroll was approved by Finance and can be locked` },
  locked: { perm: 'payroll.release', title: (l) => `${l} payroll is locked. Record the salary payment once the bank has paid` },
}

export const advancePayrollStage = action(
  z.object({ id: objectId, target: z.enum(['hr_reviewed', 'finance_approved', 'locked']) }),
  async ({ id, target }, ctx) => {
    ctx.assert(ADVANCE_PERMISSION[target])
    const cycle = await cycleOr404(ctx, id)
    const label = cycleLabel(cycle)
    const refusal = advanceRefusal(target, cycle.status, label)
    if (refusal) return fail(refusal)
    if (!cycle.employeeCount && !(await ctx.db(PayrollEntry).exists({ cycleId: cycle._id }))) return fail(`${label} payroll has nobody in it. Generate it first.`)
    const attendanceRefusal = await openAttendanceRefusal(ctx, cycle, label)
    if (attendanceRefusal) return fail(attendanceRefusal)
    const lockRefusal = target === 'locked' ? ((await unverifiedBankRefusal(ctx, cycle._id, label)) ?? (await lateClaimsRefusal(ctx, cycle._id, label))) : null
    if (lockRefusal) return fail(lockRefusal)
    const stampKey = { hr_reviewed: 'hrReviewed', finance_approved: 'financeApproved', locked: 'locked' }[target]
    const moved = await ctx.db(PayrollCycle).updateOne({ _id: cycle._id, status: ADVANCE_FROM[target] }, { $set: { status: target, [stampKey]: { at: new Date(), by: ctx.userId, name: ctx.user.name } } })
    if (!moved.modifiedCount) return fail(`${label} payroll moved on while you were looking. The page has been refreshed to show where the month is.`)
    await audit(ctx, { action: `payroll.${target}`, entity: 'PayrollCycle', entityId: cycle._id, summary: `${label} payroll marked ${STAGE_LABELS[target]}`, product: 'muster' })
    const notice = NEXT_NOTICE[target]
    await notifyPermission(ctx, notice.perm, { title: notice.title(label), href: `/app/hr/payroll/${id}`, kind: 'approval', product: 'muster', event: `payroll.${target}` })
    paths(id)
    return ok(`${label} payroll marked ${STAGE_LABELS[target]}.`)
  },
  OPTS,
)

export const releaseSalaries = action(
  z.object({ id: objectId, paymentDate: isoDate, paymentReference: requiredText('Bank reference (UTR)', 60), paymentNotes: optionalText(500) }),
  async ({ id, paymentDate, paymentReference, paymentNotes }, ctx) => {
    const cycle = await cycleOr404(ctx, id)
    const label = cycleLabel(cycle)
    if (cycle.status !== 'locked') return fail(`${label} payroll is at "${STAGE_LABELS[cycle.status]}". Salaries are released once it is locked.`)
    if (Number.isNaN(Date.parse(`${paymentDate}T00:00:00Z`))) return fail('Some fields need attention.', { paymentDate: 'Use a real date' })
    if (paymentDate > todayIST()) return fail('Some fields need attention.', { paymentDate: 'That day has not come yet. Record the payment once the bank has made it.' })
    const bankRefusal = (await openAttendanceRefusal(ctx, cycle, label)) ?? (await unverifiedBankRefusal(ctx, cycle._id, label))
    if (bankRefusal) return fail(bankRefusal)
    const entries = await ctx.db(PayrollEntry).find({ cycleId: cycle._id, status: 'ready' }, { snapshot: 1 }).lean()
    const claimIds = entries.flatMap((e) => readSnapshot(e.snapshot)?.reimbursement.claimIds ?? [])
    const paidAt = istInstant(paymentDate, '12:00')
    const { paid, returned } = await withTransaction(async (session) => {
      const moved = await ctx.db(PayrollCycle).updateOne(
        { _id: cycle._id, status: 'locked' },
        { $set: { status: 'released', released: { at: new Date(), by: ctx.userId, name: ctx.user.name }, paymentDate, paymentReference, paymentNotes } },
        { session },
      )
      if (!moved.modifiedCount) throw new UserError(`${label} payroll moved on while you were looking. The page has been refreshed.`)
      const claims = await ctx.db(Claim).updateMany({ _id: { $in: claimIds }, payrollCycleId: cycle._id, status: 'scheduled_for_payroll' }, { $set: { status: 'paid', paidAt, paymentReference } }, { session })
      // Claims that never reached net pay (on hold, excluded, skipped) go back to Approved, so they can be sent on or paid outside payroll.
      const back = await returnScheduledClaims(ctx, { payrollCycleId: cycle._id }, session)
      return { paid: claims.modifiedCount, returned: back }
    })
    await audit(ctx, { action: 'payroll.released', entity: 'PayrollCycle', entityId: cycle._id, summary: `Released ${label} salaries (${formatINR(cycle.totalNet)}), reference ${paymentReference}`, product: 'muster', meta: { paymentDate, claimsPaid: paid, claimsReturned: returned } })
    await notifyPermission(ctx, 'payroll.release', { title: `${label} salaries released. Publish the payslips next`, href: `/app/hr/payroll/${id}`, kind: 'info', product: 'muster', event: 'payroll.released' })
    paths(id)
    revalidatePath('/app/hr/claims')
    const warn = returned ? ` ${returned} scheduled claim${returned === 1 ? ' was' : 's were'} not in the register, so ${returned === 1 ? 'it is' : 'they are'} back under Approved claims to send to another month or pay outside payroll.` : ''
    return ok(`${label} salaries recorded as paid on ${formatDate(paymentDate)}. ${paid} claim${paid === 1 ? '' : 's'} marked paid.${warn} Publish the payslips next.`)
  },
  { ...OPTS, perm: 'payroll.release' },
)

export const publishPayrollPayslips = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const cycle = await cycleOr404(ctx, id)
    const label = cycleLabel(cycle)
    if (cycle.status !== 'released' && cycle.status !== 'payslips_published') return fail(`${label} salaries have not been released yet. Record the payment first.`)
    const resend = cycle.status === 'payslips_published'
    const report = await publishPayslips(ctx, cycle, { resend })
    if (!report.published) return fail(`There are no payslips to publish for ${label}. Everyone is on hold or excluded.`)
    await ctx.db(PayrollCycle).updateOne({ _id: cycle._id }, { $set: { status: 'payslips_published', published: { at: new Date(), by: ctx.userId, name: ctx.user.name } } })
    await audit(ctx, { action: resend ? 'payroll.payslips_resent' : 'payroll.payslips_published', entity: 'PayrollCycle', entityId: cycle._id, summary: `${resend ? 'Re-sent' : 'Published'} ${report.published} payslips for ${label} (${report.emailed} emailed)`, product: 'muster' })
    const people = await ctx.db(Employee).find({ _id: { $in: (await ctx.db(PayrollEntry).find({ cycleId: cycle._id, status: 'ready' }, { employeeId: 1 }).lean()).map((e) => e.employeeId) }, memberId: { $ne: null } }, { memberId: 1 }).lean()
    await notifyMembers(ctx, people.map((p) => p.memberId!).filter(Boolean), { title: `Your ${label} payslip is ready`, href: '/app/me/payslips', kind: 'info', product: 'muster', event: 'payroll.payslip_published', dedupeKey: `payslip:${cycle._id}` })
    paths(id)
    revalidatePath('/app/me/payslips')
    const base = `${report.published} payslip${report.published === 1 ? '' : 's'} ${resend ? 're-sent' : 'published'} for ${label}; ${report.emailed} emailed.`
    return ok(report.failures.length ? `${base} Not emailed — ${failureSummary(report.failures)} They can still download it from My payslips.` : base)
  },
  { ...OPTS, perm: 'payroll.release' },
)

export const reopenPayroll = action(
  z.object({ id: objectId, reason: requiredText('Reason', 500) }),
  async ({ id, reason }, ctx) => {
    const cycle = await cycleOr404(ctx, id)
    const label = cycleLabel(cycle)
    if (!REOPENABLE.includes(cycle.status)) return fail(`${label} payroll is not locked, so there is nothing to reopen.`)
    await ctx.db(PayrollCycle).updateOne({ _id: cycle._id, status: cycle.status }, { $set: { status: 'generated' }, $unset: { hrReviewed: 1, financeApproved: 1, locked: 1 } })
    await audit(ctx, { action: 'payroll.reopened', entity: 'PayrollCycle', entityId: cycle._id, summary: `Reopened ${label} payroll`, product: 'muster', meta: { reason, from: cycle.status } })
    paths(id)
    return ok(`${label} payroll reopened. Regenerate it, then take it through review again.`)
  },
  { ...OPTS, perm: 'payroll.unlock' },
)
