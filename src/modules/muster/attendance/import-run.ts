import 'server-only'
import { Types } from 'mongoose'
import { officeHoursOf } from '@/lib/attendance'
import type { Ctx } from '@/lib/ctx'
import { withTransaction } from '@/lib/db'
import { todayIST } from '@/lib/dates'
import { AttendanceDay } from '@/models/AttendanceDay'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { AttendancePeriod } from '@/models/muster/AttendancePeriod'
import { Employee } from '@/models/muster/Employee'
import type { CsvRow } from '../import/csv'
import { OWN_RECORD_REFUSAL } from '../leave/approvals'
import { mayDecideOwn, ownEmployeeId, visibleEmployeeIds, visibleFilter } from '../people/scope'
import { checkAttendanceRows, mapColumns, MAX_IMPORT_ROWS, type CheckedRow, type ImportEmployee } from './import'
import { assertMonthsOpen } from './lock'
import { writeMarks, type MarkWrite } from './marks'

/** Attendance import, shared by Muster's import panel and Settings → Import / the Console (server-only). */

const PRE_JOINING = ['candidate', 'offered', 'joining_pending']

export type AttendanceCheck = { rows: CheckedRow[]; ignored: string[]; memberOf: Map<string, Types.ObjectId | null> }

export type ScopeEmployee = ImportEmployee & { biometricId: string | null; memberId: Types.ObjectId | null }

/** Who an import may mark (visible, not pre-joining), the locked months and the importer's own code when they may not mark themselves. */
export type AttendanceScope = { employees: ScopeEmployee[]; lockedMonths: Set<string>; ownCode: string | null }

export async function attendanceScope(ctx: Ctx): Promise<AttendanceScope> {
  const visible = await visibleEmployeeIds(ctx)
  const [employees, locked] = await Promise.all([
    ctx.db(Employee).find({ deletedAt: null, status: { $nin: PRE_JOINING }, ...visibleFilter(visible) }, { code: 1, fullName: 1, joinDate: 1, exitDate: 1, memberId: 1, biometricId: 1 }).lean(),
    ctx.db(AttendancePeriod).distinct('period', { status: 'locked' }),
  ])
  const ownId = mayDecideOwn(ctx) ? null : ownEmployeeId(ctx)
  return {
    employees: employees.map((e) => ({ id: String(e._id), code: e.code, name: e.fullName, joinDate: e.joinDate, exitDate: e.exitDate, biometricId: e.biometricId ?? null, memberId: e.memberId ?? null })),
    lockedMonths: new Set(locked.map(String)),
    ownCode: employees.find((e) => String(e._id) === ownId)?.code.toLowerCase() ?? null,
  }
}

export type CheckOptions = { maxRows?: number; allowAfterMidnight?: boolean }

/** Checks rows against a loaded scope: codes, employment windows, locked months, own record. */
export function checkWithScope(ctx: Ctx, scope: AttendanceScope, headers: string[], rows: CsvRow[], options: CheckOptions = {}): AttendanceCheck | string {
  const maxRows = options.maxRows ?? MAX_IMPORT_ROWS
  if (!rows.length) return 'The file has a header but no rows. Add one row per person and day.'
  if (rows.length > maxRows) return `The file has ${rows.length} rows. Import at most ${maxRows} at a time.`
  const { columns, missing, ignored } = mapColumns(headers)
  if (missing.length) return `The file needs a ${missing.join(' and a ')} column. Download the template to see the layout.`
  const { ownCode } = scope
  const checked = checkAttendanceRows(rows, columns, {
    employees: new Map(scope.employees.map((e) => [e.code.toLowerCase(), e])),
    lockedMonths: scope.lockedMonths,
    today: todayIST(),
    officeHours: officeHoursOf(ctx),
    allowAfterMidnight: options.allowAfterMidnight,
  }).map((r) => (ownCode && r.code.toLowerCase() === ownCode ? { ...r, errors: [...r.errors, OWN_RECORD_REFUSAL], record: undefined } : r))
  return { rows: checked, ignored, memberOf: new Map(scope.employees.map((e) => [e.id, e.memberId])) }
}

/** Re-reads the rows against today's records: codes, employment windows, locked months, own record. */
export async function checkAttendance(ctx: Ctx, headers: string[], rows: CsvRow[]): Promise<AttendanceCheck | string> {
  if (!rows.length) return 'The file has a header but no rows. Add one row per person and day.'
  if (rows.length > MAX_IMPORT_ROWS) return `The file has ${rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`
  return checkWithScope(ctx, await attendanceScope(ctx), headers, rows)
}

export function marksOf(result: AttendanceCheck): MarkWrite[] {
  return result.rows.flatMap((r) => (r.record ? [r.record] : [])).map((r) => ({
    employeeId: new Types.ObjectId(r.employeeId), memberId: result.memberOf.get(r.employeeId) ?? null, date: r.date, status: r.status,
    reason: r.note ?? 'Imported from CSV', times: r.in ? { in: r.in, out: r.out } : undefined,
  }))
}

/**
 * Writes the marks in one transaction and returns what an undo needs: the new
 * overrides and core days (deleted on undo), and the approved overrides and
 * existing core days as they were before (put back on undo).
 */
export async function commitAttendance(ctx: Ctx, writes: readonly MarkWrite[]) {
  const pairs = writes.map((w) => ({ employeeId: w.employeeId, date: w.date }))
  const dayPairs = writes.filter((w) => w.memberId).map((w) => ({ memberId: w.memberId, date: w.date }))
  return withTransaction(async (session) => {
    await assertMonthsOpen(ctx, writes.map((w) => w.date), 'the import', session)
    const [superseded, days] = await Promise.all([
      ctx.db(AttendanceCorrection).find({ status: 'approved', $or: pairs }, null, { session }).lean(),
      dayPairs.length ? ctx.db(AttendanceDay).find({ $or: dayPairs }, null, { session }).lean() : Promise.resolve([]),
    ])
    const written = await writeMarks(ctx, writes, 'import', session)
    return {
      count: writes.length,
      created: [
        { model: 'AttendanceCorrection' as const, ids: written.correctionIds },
        { model: 'AttendanceDay' as const, ids: written.newDayIds },
      ],
      restore: [
        { model: 'AttendanceCorrection' as const, docs: superseded as unknown as Record<string, unknown>[] },
        { model: 'AttendanceDay' as const, docs: days as unknown as Record<string, unknown>[] },
      ],
    }
  })
}
