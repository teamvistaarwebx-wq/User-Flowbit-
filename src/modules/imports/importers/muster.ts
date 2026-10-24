import 'server-only'
import { Types } from 'mongoose'
import { IMPORT_COLUMNS as EMPLOYEE_COLUMNS, SENSITIVE_COLUMNS, TEMPLATE_EXAMPLE, type CheckedRow as EmployeeRow } from '@/modules/muster/import/employees'
import { checkEmployees, commitEmployees, payrollCount } from '@/modules/muster/import/employee-run'
import { IMPORT_COLUMNS as ATTENDANCE_COLUMNS, MAX_IMPORT_ROWS, TEMPLATE_ROWS } from '@/modules/muster/attendance/import'
import { checkAttendance, commitAttendance } from '@/modules/muster/attendance/import-run'
import type { MarkWrite } from '@/modules/muster/attendance/marks'
import { sheetRows } from '../sheet'
import type { Importer } from '../types'

/** The existing Muster importers, wrapped for Settings → Import and the Console (they record a batch and can be undone). */

const REQUIRED_EMPLOYEE = new Set(['full_name', 'work_email', 'date_of_joining', 'employment_type'])

export const employeesImporter: Importer<EmployeeRow> = {
  kind: 'employees',
  label: 'Employees',
  description: 'Muster people: joining date, department, designation, manager, and (with access) PAN and bank.',
  product: 'muster',
  perm: 'people.import',
  maxRows: 500,
  columns: EMPLOYEE_COLUMNS.map((key) => ({ key, required: REQUIRED_EMPLOYEE.has(key), example: TEMPLATE_EXAMPLE[key] ?? '', help: SENSITIVE_COLUMNS.has(key) ? 'Needs access to sensitive people data.' : undefined })),
  check: async (sheet, ctx) => {
    const { headers, rows } = sheetRows(sheet)
    const result = await checkEmployees(ctx, headers, rows)
    if ('error' in result) return { error: result.error }
    return { ignored: [...result.headers.ignored, ...result.headers.withheld], rows: result.rows.map((r) => ({ line: r.line, label: r.name, errors: r.errors, warnings: r.warnings, record: r.record ? r : null })) }
  },
  seats: (records) => ({ employees: payrollCount(records) }),
  commit: async (records, ctx) => {
    const ids = await commitEmployees(ctx, records)
    return { created: [{ model: 'Employee', ids }], count: ids.length }
  },
}

export const attendanceImporter: Importer<MarkWrite> = {
  kind: 'attendance',
  label: 'Attendance',
  description: 'Muster attendance marks: one row per person and day, with a status or in/out times.',
  product: 'muster',
  perm: 'attendance.manage',
  maxRows: MAX_IMPORT_ROWS,
  columns: ATTENDANCE_COLUMNS.map((key) => ({ key, required: key === 'code' || key === 'date', example: TEMPLATE_ROWS[0][key] })),
  check: async (sheet, ctx) => {
    const { headers, rows } = sheetRows(sheet)
    const result = await checkAttendance(ctx, headers, rows)
    if (typeof result === 'string') return { error: result }
    return {
      ignored: result.ignored,
      rows: result.rows.map((r) => ({
        line: r.line,
        label: `${r.name ?? r.code} · ${r.date}`,
        errors: r.errors,
        warnings: r.warnings,
        record: r.record
          ? { employeeId: new Types.ObjectId(r.record.employeeId), memberId: result.memberOf.get(r.record.employeeId) ?? null, date: r.record.date, status: r.record.status, reason: r.record.note ?? 'Imported', times: r.record.in ? { in: r.record.in, out: r.record.out } : undefined }
          : null,
      })),
    }
  },
  commit: (records, ctx) => commitAttendance(ctx, records),
}
