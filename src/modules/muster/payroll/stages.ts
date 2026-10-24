import type { Permission } from '@/lib/catalog'

/**
 * The payroll month: an open state plus the eight SPEC gates, in order.
 * Pure (client-safe); the actions enforce it.
 */
export const PAYROLL_STATUSES = [
  'attendance_open',
  'attendance_locked',
  'reimbursements_closed',
  'generated',
  'hr_reviewed',
  'finance_approved',
  'locked',
  'released',
  'payslips_published',
] as const
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number]

export const STAGE_LABELS: Record<PayrollStatus, string> = {
  attendance_open: 'Attendance open',
  attendance_locked: 'Attendance locked',
  reimbursements_closed: 'Claims closed',
  generated: 'Generated',
  hr_reviewed: 'HR reviewed',
  finance_approved: 'Finance approved',
  locked: 'Locked',
  released: 'Salary released',
  payslips_published: 'Payslips published',
}

export const STAGE_TONES: Record<PayrollStatus, 'neutral' | 'warning' | 'info' | 'violet' | 'orchid' | 'success'> = {
  attendance_open: 'neutral',
  attendance_locked: 'warning',
  reimbursements_closed: 'warning',
  generated: 'info',
  hr_reviewed: 'violet',
  finance_approved: 'violet',
  locked: 'orchid',
  released: 'success',
  payslips_published: 'success',
}

export const stageIndex = (status: PayrollStatus): number => PAYROLL_STATUSES.indexOf(status)
export const isAtLeast = (status: PayrollStatus, target: PayrollStatus): boolean => stageIndex(status) >= stageIndex(target)
/** From `locked` on, figures are frozen: no regeneration, adjustments, holds or claim scheduling. */
export const isLocked = (status: PayrollStatus): boolean => isAtLeast(status, 'locked')

/** The sign-off steps pressed with "advance": where each may start from, and who may press it. */
export const ADVANCE_FROM: Record<'hr_reviewed' | 'finance_approved' | 'locked', PayrollStatus> = {
  hr_reviewed: 'generated',
  finance_approved: 'hr_reviewed',
  locked: 'finance_approved',
}
export const ADVANCE_PERMISSION: Record<keyof typeof ADVANCE_FROM, Permission> = {
  hr_reviewed: 'payroll.run',
  finance_approved: 'payroll.approve',
  locked: 'payroll.lock',
}
export type AdvanceTarget = keyof typeof ADVANCE_FROM

/**
 * Months that can be reopened (with a reason) by `payroll.unlock`. Released
 * months are financial records (SPEC §8: never hard-deleted), and reopening
 * would regenerate their register, so differences go into next month instead.
 */
export const REOPENABLE: readonly PayrollStatus[] = ['locked']

/** Generation may run (or re-run) from any status before `locked`. */
export const canGenerate = (status: PayrollStatus): boolean => !isLocked(status)
/** Claims collection can be closed only before generation. */
export const canCloseClaims = (status: PayrollStatus): boolean => status === 'attendance_open' || status === 'attendance_locked'

/**
 * The refusal shown when a step was pressed on a stale page: says where the
 * month actually is. `null` when the step is allowed from `status`.
 */
export function advanceRefusal(target: AdvanceTarget, status: PayrollStatus, monthLabel: string): string | null {
  if (status === ADVANCE_FROM[target]) return null
  if (isAtLeast(status, target)) return `${monthLabel} payroll is already past "${STAGE_LABELS[target]}". The page has been refreshed to show where the month is.`
  return `${monthLabel} payroll is at "${STAGE_LABELS[status]}", so it cannot be marked "${STAGE_LABELS[target]}" yet.`
}

/** One line per stage for the stepper (the open state is the starting point, not a step). */
export const STEPS = PAYROLL_STATUSES.slice(1).map((key) => ({ key, label: STAGE_LABELS[key] }))
/** Stepper `current` index: steps completed so far. */
export const stepperIndex = (status: PayrollStatus): number => stageIndex(status)

/** Stages whose figures were built from the attendance register: reopening attendance makes them stale. */
export const STALE_ON_REOPEN: readonly PayrollStatus[] = ['generated', 'hr_reviewed', 'finance_approved']

/**
 * Where a payroll month goes when its attendance is reopened: generated figures and their sign-offs are
 * dropped back to before generation, so they must be regenerated and signed off again. `null` = no change.
 */
export function reopenTarget(status: PayrollStatus, claimsClosed: boolean): PayrollStatus | null {
  if (status === 'attendance_locked') return 'attendance_open'
  if (!STALE_ON_REOPEN.includes(status)) return null
  return claimsClosed ? 'reimbursements_closed' : 'attendance_open'
}

type PeriodStamp = { status: string; lockedAt?: Date | null; reopenedAt?: Date | null } | null | undefined

/**
 * Payroll moves forward only over a locked attendance month whose register has not changed since generation.
 * `null` when the month may move on.
 */
export function attendanceGateRefusal(period: PeriodStamp, generatedAt: Date | null | undefined, monthLabel: string): string | null {
  if (period?.status !== 'locked') return `${monthLabel} attendance is open again. Lock the attendance month, regenerate payroll if anything changed, then continue.`
  if (!generatedAt) return null
  const changedAt = Math.max(period.lockedAt ? +new Date(period.lockedAt) : 0, period.reopenedAt ? +new Date(period.reopenedAt) : 0)
  if (changedAt > +new Date(generatedAt)) return `${monthLabel} attendance was reopened after payroll was generated. Regenerate payroll so it uses the corrected register, then continue.`
  return null
}

/** Months whose salaries have been paid: what YTD salary and TDS, and the tax exports, count. */
export const PAID_STATUSES: readonly PayrollStatus[] = PAYROLL_STATUSES.filter((s) => isAtLeast(s, 'released'))

/** Who has an unreleased payroll month now, for the employee's payslip callout: HR until it is reviewed, then Finance (R1 2.6). */
export const payslipOwner = (status: PayrollStatus): 'hr' | 'finance' => (isAtLeast(status, 'hr_reviewed') ? 'finance' : 'hr')
