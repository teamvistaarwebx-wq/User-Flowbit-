import type { Tone } from '@/lib/status'

/**
 * Employment lifecycle: the 13 statuses, their stages, and which moves are
 * allowed. Pure (no database) so pages, actions, imports and tests share it.
 */

export const EMPLOYEE_STATUSES = [
  'candidate', 'offered', 'joining_pending',
  'intern', 'probation', 'active', 'confirmed',
  'notice_period', 'resigned', 'terminated',
  'internship_completed', 'exited', 'inactive',
] as const
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number]

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'intern', 'contract'] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]
export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = { full_time: 'Full time', part_time: 'Part time', intern: 'Intern', contract: 'Contract' }

/** Office people follow the workspace's location at check-in (lib/geo); remote people are never asked for it. */
export const WORK_MODES = ['office', 'remote'] as const
export type WorkMode = (typeof WORK_MODES)[number]
export const WORK_MODE_LABEL: Record<WorkMode, string> = { office: 'Office', remote: 'Remote' }
/** A record saved before work modes existed has none and counts as office. */
export const workModeOf = (value: string | null | undefined): WorkMode => (value === 'remote' ? 'remote' : 'office')

export type Stage = 'pre_joining' | 'working' | 'leaving' | 'ended'
export const STAGE_LABEL: Record<Stage, string> = { pre_joining: 'Before joining', working: 'Working', leaving: 'Leaving', ended: 'No longer here' }

type StatusDef = { label: string; stage: Stage; tone: Tone; inDirectory: boolean; onPayroll: boolean; meaning: string }

export const LIFECYCLE: Record<EmployeeStatus, StatusDef> = {
  candidate: { label: 'Candidate', stage: 'pre_joining', tone: 'neutral', inDirectory: false, onPayroll: false, meaning: 'In the hiring process. No offer has been made.' },
  offered: { label: 'Offered', stage: 'pre_joining', tone: 'neutral', inDirectory: false, onPayroll: false, meaning: 'An offer has been issued and is awaiting acceptance.' },
  joining_pending: { label: 'Joining pending', stage: 'pre_joining', tone: 'warning', inDirectory: false, onPayroll: false, meaning: 'Offer accepted, joining date not yet reached.' },
  intern: { label: 'Intern', stage: 'working', tone: 'success', inDirectory: true, onPayroll: true, meaning: 'On an internship with a defined end date.' },
  probation: { label: 'Probation', stage: 'working', tone: 'warning', inDirectory: true, onPayroll: true, meaning: 'Employed, within the probation period.' },
  active: { label: 'Active', stage: 'working', tone: 'success', inDirectory: true, onPayroll: true, meaning: 'Employed and working normally.' },
  confirmed: { label: 'Confirmed', stage: 'working', tone: 'success', inDirectory: true, onPayroll: true, meaning: 'Probation completed and confirmed in the role.' },
  notice_period: { label: 'Notice period', stage: 'leaving', tone: 'warning', inDirectory: true, onPayroll: true, meaning: 'Serving notice. Still working and still paid.' },
  resigned: { label: 'Resigned', stage: 'leaving', tone: 'warning', inDirectory: true, onPayroll: true, meaning: 'Resignation accepted, notice not yet served out.' },
  terminated: { label: 'Terminated', stage: 'leaving', tone: 'danger', inDirectory: false, onPayroll: false, meaning: 'Employment ended by the company. Settlement may be pending.' },
  internship_completed: { label: 'Internship completed', stage: 'ended', tone: 'neutral', inDirectory: false, onPayroll: false, meaning: 'Internship finished. Certificate and experience letter are due.' },
  exited: { label: 'Exited', stage: 'ended', tone: 'neutral', inDirectory: false, onPayroll: false, meaning: 'Left the organisation. Records kept for payroll history.' },
  inactive: { label: 'Inactive', stage: 'ended', tone: 'neutral', inDirectory: false, onPayroll: false, meaning: 'On the books but not working: long leave, sabbatical, dormant.' },
}

export const statusLabelOf = (s: string) => LIFECYCLE[s as EmployeeStatus]?.label ?? s
export const statusToneOf = (s: string): Tone => LIFECYCLE[s as EmployeeStatus]?.tone ?? 'neutral'
export const isInDirectory = (s: string) => Boolean(LIFECYCLE[s as EmployeeStatus]?.inDirectory)
export const isOnPayroll = (s: string) => Boolean(LIFECYCLE[s as EmployeeStatus]?.onPayroll)
export const hasLeft = (s: string) => LIFECYCLE[s as EmployeeStatus]?.stage === 'ended' || s === 'terminated'

export const DIRECTORY_STATUSES = EMPLOYEE_STATUSES.filter(isInDirectory)
export const PAYROLL_STATUSES = EMPLOYEE_STATUSES.filter(isOnPayroll)

/** Statuses grouped by stage, for the grouped status picker. */
export const statusesByStage = (): { stage: Stage; label: string; statuses: EmployeeStatus[] }[] =>
  (Object.keys(STAGE_LABEL) as Stage[]).map((stage) => ({ stage, label: STAGE_LABEL[stage], statuses: EMPLOYEE_STATUSES.filter((s) => LIFECYCLE[s].stage === stage) }))

export const TRANSITIONS: Record<EmployeeStatus, readonly EmployeeStatus[]> = {
  candidate: ['offered', 'inactive'],
  offered: ['joining_pending', 'candidate', 'inactive'],
  joining_pending: ['intern', 'probation', 'active', 'inactive'],
  intern: ['probation', 'active', 'internship_completed', 'notice_period', 'terminated'],
  probation: ['confirmed', 'active', 'notice_period', 'resigned', 'terminated'],
  active: ['confirmed', 'notice_period', 'resigned', 'terminated', 'inactive'],
  confirmed: ['notice_period', 'resigned', 'terminated', 'inactive'],
  notice_period: ['resigned', 'exited', 'terminated', 'active', 'confirmed'],
  resigned: ['notice_period', 'exited', 'active', 'confirmed'],
  terminated: ['exited'],
  internship_completed: ['probation', 'active'],
  inactive: ['active', 'confirmed', 'probation', 'exited'],
  exited: [],
}

export const allowedNext = (from: string): readonly EmployeeStatus[] => TRANSITIONS[from as EmployeeStatus] ?? []

/** True when `from → to` is allowed (staying put is always allowed). */
export const canTransition = (from: string, to: string) => from === to || allowedNext(from).includes(to as EmployeeStatus)

export const EXIT_STATUSES: readonly EmployeeStatus[] = ['exited', 'terminated', 'internship_completed']
export const NOTICE_STATUSES: readonly EmployeeStatus[] = ['notice_period', 'resigned']

export type TransitionInput = { from: string; to: string; exitDate?: string; resignationDate?: string; reason?: string }

/**
 * Field errors for a status change, or null when it is fine. Exits need a last
 * working day and a reason; notice needs the resignation date.
 */
export function transitionProblems(input: TransitionInput): Record<string, string> | null {
  const { from, to } = input
  if (from === to) return null
  const errors: Record<string, string> = {}
  if (!canTransition(from, to)) {
    const next = allowedNext(from).map(statusLabelOf)
    errors.status = next.length
      ? `${statusLabelOf(from)} can move to ${next.join(', ')}, not ${statusLabelOf(to)}.`
      : `${statusLabelOf(from)} is final. Rehiring someone means adding a new record.`
    return errors
  }
  if (EXIT_STATUSES.includes(to as EmployeeStatus)) {
    if (!input.exitDate) errors.exitDate = 'Enter the last working day.'
    if (!input.reason?.trim()) errors.reason = 'Say why they are leaving.'
  }
  if (NOTICE_STATUSES.includes(to as EmployeeStatus) && !input.resignationDate) errors.resignationDate = 'Enter the resignation date. Notice is counted from it.'
  return Object.keys(errors).length ? errors : null
}

/** Statuses accepted by "Remove from directory". */
export const REMOVE_STATUSES: readonly EmployeeStatus[] = ['exited', 'internship_completed', 'terminated', 'inactive']
