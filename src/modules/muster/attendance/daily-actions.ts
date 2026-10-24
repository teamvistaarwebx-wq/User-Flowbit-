'use server'

import { revalidatePath } from 'next/cache'
import { Types } from 'mongoose'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { isoDate, objectId, optionalText } from '@/lib/validation'
import { recordUsage } from '@/lib/usage'
import { OWN_RECORD_REFUSAL } from '../leave/approvals'
import { mayDecideOwn, ownEmployeeId, visibleEmployeeIds } from '../people/scope'
import { getDaySheet } from './day-sheet'
import { assertMonthsOpen } from './lock'
import { writeMarks, type MarkWrite } from './marks'
import { getRegister } from './queries'
import { CELL_META, isUnmarked, isWorkingRow, needsReason, OVERRIDE_STATUSES, type Cell } from './register'

const REGISTER = '/app/hr/attendance'
const OPTS = { product: 'muster', perm: 'attendance.manage' } as const
const MAX_MARKS = 500

const SOURCE_WORDS: Partial<Record<Cell['source'], string>> = { punch: 'from their check-in', leave: 'on approved leave', override: 'as marked earlier', calendar: 'on the calendar' }

async function assertDayEditable(ctx: Ctx, date: string): Promise<string | null> {
  if (date > todayIST()) return 'That day has not happened yet. Mark it once it has.'
  await assertMonthsOpen(ctx, [date], 'attendance for that day')
  return null
}

const toWrite = (row: { employeeId: string; memberId: string | null }, date: string, status: MarkWrite['status'], reason: string): MarkWrite => ({
  employeeId: new Types.ObjectId(row.employeeId), memberId: row.memberId ? new Types.ObjectId(row.memberId) : null, date, status, reason,
})

function markedMessage(writes: readonly MarkWrite[], names: Map<string, string>, date: string): string {
  const statuses = new Set(writes.map((w) => w.status))
  const label = statuses.size === 1 ? CELL_META[writes[0].status].label : null
  if (writes.length === 1) return `${names.get(String(writes[0].employeeId))} marked ${label} for ${formatDate(date)}.`
  return label ? `${writes.length} people marked ${label} for ${formatDate(date)}.` : `${writes.length} attendance marks saved for ${formatDate(date)}.`
}

/** The daily sheet: set one or more people's status for a day. Replacing a recorded status needs a reason. */
export const markAttendance = action(
  z.object({
    date: isoDate,
    marks: z.array(z.object({ employeeId: objectId, status: z.enum(OVERRIDE_STATUSES, { error: 'Choose a status' }), reason: optionalText(280) })).min(1, 'Pick someone to mark').max(MAX_MARKS),
  }),
  async ({ date, marks }, ctx) => {
    const problem = await assertDayEditable(ctx, date)
    if (problem) return fail(problem)
    const ids = [...new Set(marks.map((m) => m.employeeId))]
    const visible = await visibleEmployeeIds(ctx)
    if (visible !== null && ids.some((id) => !visible.includes(id))) throw new NotFoundError('That employee')
    const own = ownEmployeeId(ctx)
    if (own && ids.includes(own) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const register = await getRegister(ctx, { start: date, end: date }, { employeeIds: ids })
    const rowBy = new Map(register.rows.map((r) => [r.employeeId, r]))
    const writes: MarkWrite[] = []
    for (const m of marks) {
      const row = rowBy.get(m.employeeId)
      const cell = row?.cells[0]
      if (!row || !cell || cell.status === 'na') return fail(`${row?.name ?? 'That person'} was not employed on ${formatDate(date)}, so there is nothing to mark.`)
      if (cell.source === 'override' && cell.status === m.status) continue
      if (needsReason(cell, m.status) && !m.reason) {
        const message = `${row.name} is ${CELL_META[cell.status].label.toLowerCase()} on ${formatDate(date)} ${SOURCE_WORDS[cell.source] ?? ''}. Say why you are changing it.`.replace(/\s+\./, '.')
        return fail(message, { reason: 'Say why you are changing it' })
      }
      writes.push(toWrite(row, date, m.status, m.reason ?? 'Marked on the daily sheet'))
    }
    if (!writes.length) return ok('Nothing changed; those marks were already saved.')
    await writeMarks(ctx, writes, 'daily')
    recordUsage({ kind: 'attendance_marked', orgId: ctx.orgId, userId: ctx.userId, product: 'muster', meta: { marks: writes.length } })
    const names = new Map(register.rows.map((r) => [r.employeeId, r.name]))
    const summary = markedMessage(writes, names, date)
    await audit(ctx, { action: 'attendance.marked', entity: 'AttendanceDay', entityId: date, summary: summary.replace(/\.$/, ''), product: 'muster', meta: { date, marks: writes.map((w) => ({ employeeId: String(w.employeeId), status: w.status, reason: w.reason })) } })
    revalidatePath(REGISTER)
    return ok(summary)
  },
  OPTS,
)

/** "Mark remaining N present": everyone still unmarked on a working day. */
export const markRemainingPresent = action(
  z.object({ date: isoDate, departmentId: objectId.optional() }),
  async ({ date, departmentId }, ctx) => {
    const problem = await assertDayEditable(ctx, date)
    if (problem) return fail(problem)
    const sheet = await getDaySheet(ctx, date, { departmentId })
    const own = ownEmployeeId(ctx)
    const skipOwn = Boolean(own) && !mayDecideOwn(ctx)
    const unmarked = sheet.rows.filter((r) => isWorkingRow(r.cell) && isUnmarked(r.cell))
    const targets = unmarked.filter((r) => !(skipOwn && r.employeeId === own))
    if (!targets.length) return ok(`Everyone working on ${formatDate(date)} is already marked.`)
    const writes = targets.map((r) => toWrite(r, date, 'present', 'Marked present with the rest of the day'))
    await writeMarks(ctx, writes, 'daily')
    await audit(ctx, { action: 'attendance.marked', entity: 'AttendanceDay', entityId: date, summary: `${writes.length} people marked Present for ${formatDate(date)} (the remaining unmarked)`, product: 'muster', meta: { date, employeeIds: targets.map((t) => t.employeeId) } })
    revalidatePath(REGISTER)
    const left = targets.length < unmarked.length ? ' Your own day was left for someone else to mark.' : ''
    return ok(`${writes.length} ${writes.length === 1 ? 'person' : 'people'} marked present for ${formatDate(date)}.${left}`)
  },
  OPTS,
)
