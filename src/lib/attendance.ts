import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { AttendanceDay } from '@/models/AttendanceDay'
import { BREAK_LABEL, breakRefusal, cleanBreakMinutes, mergeBreakPolicies, payableMinutes, type BreakPolicies, type BreakType } from './break-types'
import { allowedPunches, computeDay, DEFAULT_OFFICE_HOURS, type OfficeHours, type PunchType, type TodayState } from './attendance-core'
import { geoSettingsOf, type GeoRecord, type GeoSettings } from './geo'
import { Employee } from '@/models/muster/Employee'
import { workModeOf } from '@/modules/muster/people/lifecycle'

export * from './attendance-core'


export const officeHoursOf = (ctx: Pick<Ctx, 'org'>): OfficeHours => ({ ...DEFAULT_OFFICE_HOURS, ...(ctx.org.officeHours ?? {}) }) as OfficeHours

/** The workspace's break types (paid or unpaid, daily limits) over the defaults. */
export const breakPoliciesOf = (ctx: Pick<Ctx, 'org'>): BreakPolicies => mergeBreakPolicies(ctx.org.breakTypes)

/** The workspace's location-at-check-in settings (lib/geo) over the defaults. */
export const geoSettingsFor = (ctx: Pick<Ctx, 'org'>): GeoSettings => geoSettingsOf(ctx.org.attendanceGeo as Parameters<typeof geoSettingsOf>[0])

/** Whether the signed-in member's employee record says they work remotely (no record counts as office). */
export async function isRemoteWorker(ctx: Ctx): Promise<boolean> {
  if (!ctx.member.employeeId) return false
  const employee = await ctx.db(Employee).findOne({ _id: ctx.member.employeeId }, { workMode: 1 }).lean()
  return workModeOf(employee?.workMode) === 'remote'
}

/**
 * The location rule for the signed-in member: the workspace's settings, with the mode off for a remote worker.
 * The check-in widget and the punch action both read it, so a browser cannot skip the check by claiming to be remote.
 */
export async function checkInGeoFor(ctx: Ctx): Promise<{ settings: GeoSettings; remote: boolean }> {
  const settings = geoSettingsFor(ctx)
  const remote = await isRemoteWorker(ctx)
  return { settings: remote ? { ...settings, mode: 'off' } : settings, remote }
}

/** The signed-in member's attendance today, ready for the check-in widget. */
export async function todayState(ctx: Ctx): Promise<TodayState> {
  const date = todayIST()
  const day = await AttendanceDay.findOne({ orgId: ctx.orgId, memberId: ctx.memberId, date }).lean()
  const result = computeDay({ punches: day?.punches ?? [], status: day?.status }, officeHoursOf(ctx))
  return {
    date,
    state: result.state,
    stateSince: result.stateSince?.toISOString() ?? null,
    workedMinutes: result.workedMinutes,
    breakMinutes: result.breakMinutes,
    breakByType: result.breakByType,
    breakType: result.breakType,
    payableMinutes: payableMinutes(result.workedMinutes, result.breakByType, breakPoliciesOf(ctx)),
    firstIn: result.firstIn?.toISOString() ?? null,
    lastOut: result.lastOut?.toISOString() ?? null,
    allowed: day?.locked ? [] : allowedPunches(result.state),
    locked: Boolean(day?.locked),
    status: result.status,
  }
}

/**
 * Checking in on a day of approved leave: the day shows as worked, but payroll still counts the leave until HR
 * cancels it, so the person is told (R1 2.10).
 */
export function leaveDayWarning(type: PunchType, status: string | null | undefined): string {
  if (type !== 'in' || (status !== 'leave' && status !== 'sick_leave')) return ''
  return '. You are on approved leave today: payroll still counts it as leave unless HR cancels the leave.'
}

export const PUNCH_RACE_MESSAGE = 'Your attendance changed a moment ago, maybe from another device. Refresh and try again.'

/**
 * The write only lands on the day as it was read: with the same number of punches. A day not yet created is
 * upserted. Pure, so the guard is testable.
 */
export function punchWriteFilter<T extends Record<string, unknown>>(day: T, readCount: number | null): Record<string, unknown> {
  if (readCount === null) return day
  // A day HR marked without punches may have no punches field at all.
  if (readCount === 0) return { ...day, $or: [{ punches: { $size: 0 } }, { punches: { $exists: false } }] }
  return { ...day, punches: { $size: readCount } }
}

const PUNCH_LABEL: Record<PunchType, string> = { in: 'Checked in', break_start: 'Break started', break_end: 'Back from break', out: 'Checked out' }

/** `breakType`: what kind of break a break_start is (lib/break-types); refused once its daily limit is used up. */
/** `remote`: a check-in or check-out by a remote worker, kept on the punch so the day sheet says why it has no location. */
export type PunchOptions = Readonly<{ source?: 'web' | 'whatsapp'; geo?: Readonly<GeoRecord> | null; breakType?: BreakType; remote?: boolean }>

/** Records a punch (web check-in widget, or the WhatsApp bot with a shared location) for the member and recomputes the day. */
export async function punch(ctx: Ctx, type: PunchType, note?: string, opts: PunchOptions = {}): Promise<{ state: TodayState; message: string }> {
  const date = todayIST()
  const now = new Date()
  const existing = await AttendanceDay.findOne({ orgId: ctx.orgId, memberId: ctx.memberId, date }).lean()
  if (existing?.locked) throw new UserError('Attendance for today is locked. Ask HR to make a correction.')
  const current = computeDay({ punches: existing?.punches ?? [], status: existing?.status }, officeHoursOf(ctx), now)
  if (!allowedPunches(current.state).includes(type)) {
    throw new UserError(current.state === 'out' ? 'Check in first.' : 'That step does not follow your last punch. Refresh and try again.')
  }
  const breakType = type === 'break_start' ? opts.breakType : undefined
  if (breakType) {
    const refusal = breakRefusal(breakType, current.breakByType, breakPoliciesOf(ctx))
    if (refusal) throw new UserError(refusal)
  }
  const punches = [...(existing?.punches ?? []), { type, at: now, source: opts.source ?? 'web', note, ...(breakType ? { breakType } : {}), ...(opts.geo ? { geo: { ...opts.geo } } : {}), ...(opts.remote && (type === 'in' || type === 'out') ? { remote: true } : {}) }]
  const next = computeDay({ punches, status: existing?.status }, officeHoursOf(ctx), now)
  const written = await AttendanceDay.updateOne(
    punchWriteFilter({ orgId: ctx.orgId, memberId: ctx.memberId, date }, existing ? (existing.punches?.length ?? 0) : null),
    {
      $set: {
        punches,
        status: next.status,
        workedMinutes: next.workedMinutes,
        breakMinutes: next.breakMinutes,
        breakByType: cleanBreakMinutes(next.breakByType),
        firstIn: next.firstIn ?? undefined,
        lastOut: next.lastOut ?? undefined,
        employeeId: ctx.member.employeeId ?? undefined,
      },
    },
    { upsert: !existing },
  )
  // Another punch (a double tap, or web and phone together) landed between the read and this write.
  if (existing && !written.matchedCount) throw new UserError(PUNCH_RACE_MESSAGE)
  const base = breakType ? `${BREAK_LABEL[breakType]} started` : PUNCH_LABEL[type]
  return { state: await todayState(ctx), message: `${base}${leaveDayWarning(type, existing?.status)}` }
}
