import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { withTransaction } from '@/lib/db'
import type { CreateInput, RawOf } from '@/lib/db/scoped'
import { UserError } from '@/lib/errors'
import { Department } from '@/models/muster/Department'
import { Designation } from '@/models/muster/Designation'
import { Employee } from '@/models/muster/Employee'
import { isOnPayroll } from '../people/lifecycle'
import { linkByWorkEmail } from '../people/login-links'
import { onboardingFor } from '../people/onboarding-gate'
import { nextEmployeeCode } from '../people/save'
import { splitName } from '../people/validation'
import { deviceKey } from '../attendance/biometric/punches'
import type { CsvRow } from './csv'
import { mapHeaders, MAX_ROWS, validateRows, type CheckedRow, type ImportContext } from './employees'

/** Employee import, shared by Muster's own wizard and Settings → Import / the Console (server-only). */

export async function employeeImportContext(ctx: Ctx): Promise<ImportContext> {
  const [employees, departments, designations, onboarding] = await Promise.all([
    ctx.db(Employee).find({}, { code: 1, workEmailLower: 1, fullName: 1, deletedAt: 1, biometricId: 1 }).lean(),
    ctx.db(Department).find({ deletedAt: null }, { name: 1, code: 1 }).lean(),
    ctx.db(Designation).find({ deletedAt: null }, { title: 1 }).lean(),
    onboardingFor(ctx, null),
  ])
  const live = employees.filter((e) => !e.deletedAt)
  return {
    existingCodes: new Set(employees.map((e) => e.code)),
    existingEmails: new Map(employees.map((e) => [e.workEmailLower, e.fullName])),
    departments: new Map(departments.flatMap((d) => [[d.name.toLowerCase(), String(d._id)], [d.code.toLowerCase(), String(d._id)]] as [string, string][])),
    designations: new Map(designations.map((d) => [d.title.toLowerCase(), { id: String(d._id), title: d.title }])),
    managers: new Map(live.flatMap((e) => [[e.code.toLowerCase(), String(e._id)], [e.workEmailLower, String(e._id)]] as [string, string][])),
    existingBiometricIds: new Map(live.flatMap((e) => (e.biometricId ? [[deviceKey(e.biometricId), e.fullName] as [string, string]] : []))),
    canSensitive: ctx.can('people.read_sensitive'),
    onboarding,
  }
}

export type EmployeeCheck = { rows: CheckedRow[]; headers: ReturnType<typeof mapHeaders> } | { error: string }

export async function checkEmployees(ctx: Ctx, headers: string[], rows: CsvRow[]): Promise<EmployeeCheck> {
  if (rows.length > MAX_ROWS) return { error: `The file has ${rows.length} rows. Import at most ${MAX_ROWS} at a time.` }
  const mapped = mapHeaders(headers, ctx.can('people.read_sensitive'))
  return { rows: validateRows(rows, await employeeImportContext(ctx)), headers: mapped }
}

/** People the ready rows put on payroll (they take seats). */
export const payrollCount = (ready: readonly CheckedRow[]) => ready.filter((r) => r.record && isOnPayroll(r.record.status)).length

/**
 * Inserts the ready rows in one transaction; returns the new ids. Anyone whose work email already signs in to
 * this workspace is then linked to that login, so their check-ins reach the register (people/login-links).
 */
export async function commitEmployees(ctx: Ctx, ready: readonly CheckedRow[]): Promise<Types.ObjectId[]> {
  const docs: Array<CreateInput<RawOf<typeof Employee>>> = []
  for (const row of ready) {
    const r = row.record!
    const { firstName, lastName, fullName } = splitName(r.fullName)
    docs.push({
      ...r, code: r.code || (await nextEmployeeCode(ctx)), firstName, lastName, fullName, workEmailLower: r.workEmail,
      address: {}, statutory: { pfCovered: false, esiCovered: false, ptExempt: false }, isOvertimeEligible: false,
    })
  }
  let ids: Types.ObjectId[]
  try {
    const inserted = await withTransaction(async (session) => ctx.db(Employee).insertMany(docs, { session }))
    ids = inserted.map((d) => d._id as Types.ObjectId)
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new UserError('Someone in that file was added by another person while you were reviewing it. Check the file again and retry.')
    throw error
  }
  // The people are in; a link that fails is left for "Link logins" rather than failing the import.
  await linkByWorkEmail(ctx, ids).catch((error) => console.error('[import] linking logins by work email failed', error))
  return ids
}
