import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { formatSeq, nextSeq, prefixFrom } from '@/lib/sequence'
import { Department } from '@/models/muster/Department'
import { Designation } from '@/models/muster/Designation'
import { Employee } from '@/models/muster/Employee'
import { isInDirectory } from './lifecycle'
import { duplicateRefusal, sensitivePatch, splitName, type EmployeeInput } from './validation'

/** Helpers shared by the create and edit actions. */

const CODE_ATTEMPTS = 20

/** The next free employee code, e.g. VW-0007. */
export async function nextEmployeeCode(ctx: Ctx): Promise<string> {
  const prefix = prefixFrom(ctx.org.name)
  for (let i = 0; i < CODE_ATTEMPTS; i += 1) {
    const code = formatSeq(await nextSeq(ctx.orgId, 'employee'), { prefix: `${prefix}-`, pad: 4 })
    if (!(await ctx.db(Employee).exists({ code }))) return code
  }
  throw new UserError('Could not find a free employee code. Enter one yourself.')
}

/** Refuses a code or work email another record already holds, naming whose it is. */
export async function assertUnique(ctx: Ctx, code: string, workEmailLower: string, exceptId?: string): Promise<void> {
  const not = exceptId ? { _id: { $ne: new Types.ObjectId(exceptId) } } : {}
  const [byCode, byEmail] = await Promise.all([
    ctx.db(Employee).findOne({ code, ...not }, { fullName: 1, status: 1 }).lean(),
    ctx.db(Employee).findOne({ workEmailLower, ...not }, { fullName: 1, status: 1 }).lean(),
  ])
  const clash = byEmail ? (['workEmail', byEmail] as const) : byCode ? (['code', byCode] as const) : null
  if (!clash) return
  const refusal = duplicateRefusal(clash[0], { fullName: clash[1].fullName, inDirectory: isInDirectory(clash[1].status) })
  throw new UserError(refusal.message, { [refusal.field]: refusal.message })
}

/** Checks the referenced department, designation and manager belong to this org; returns the designation title. */
export async function resolveRefs(ctx: Ctx, input: EmployeeInput, selfId?: string): Promise<{ designation: string | null }> {
  const [dept, desig, manager] = await Promise.all([
    input.departmentId ? ctx.db(Department).findOne({ _id: input.departmentId, deletedAt: null }).lean() : null,
    input.designationId ? ctx.db(Designation).findOne({ _id: input.designationId, deletedAt: null }).lean() : null,
    input.managerId ? ctx.db(Employee).findById(input.managerId, { _id: 1 }).lean() : null,
  ])
  if (input.departmentId && !dept) throw new UserError('Choose a department from the list.', { departmentId: 'Choose a department from the list.' })
  if (input.designationId && !desig) throw new UserError('Choose a designation from the list.', { designationId: 'Choose a designation from the list.' })
  if (input.managerId && !manager) throw new UserError('Choose a manager from the list.', { managerId: 'Choose a manager from the list.' })
  if (selfId && input.managerId === selfId) throw new UserError('Someone cannot report to themselves.', { managerId: 'Someone cannot report to themselves.' })
  return { designation: desig?.title ?? null }
}

/** The document fields every write sets (sensitive fields only when the writer may see them). */
export function employeeFields(ctx: Ctx, input: EmployeeInput, designation: string | null) {
  const names = splitName(input.fullName)
  const base = {
    ...names,
    workEmail: input.workEmail,
    workEmailLower: input.workEmail.toLowerCase(),
    personalEmail: input.personalEmail ?? null,
    phone: input.phone ?? null,
    gender: input.gender ?? null,
    dob: input.dob ?? null,
    address: { text: input.address?.replace(/\r\n/g, '\n') ?? null },
    departmentId: input.departmentId ?? null,
    designationId: input.designationId ?? null,
    designation,
    managerId: input.managerId ?? null,
    workLocation: input.workLocation ?? null,
    ...(input.workMode ? { workMode: input.workMode } : {}),
    biometricId: input.biometricId ?? null,
    employmentType: input.employmentType,
    status: input.status,
    joinDate: input.joinDate,
    probationEndDate: input.probationEndDate ?? null,
    exitDate: input.exitDate ?? null,
    exitReason: input.exitReason ?? null,
    resignationDate: input.resignationDate ?? null,
    noticePeriodDays: input.noticePeriodDays ?? null,
    ptState: input.ptState ?? null,
    statutory: { pfCovered: input.pfCovered, esiCovered: input.esiCovered, ptExempt: input.ptExempt },
    isOvertimeEligible: input.isOvertimeEligible,
    emergencyContact: { name: input.emergencyContact?.name ?? null, phone: input.emergencyContact?.phone ?? null, relation: input.emergencyContact?.relation ?? null },
    notes: input.notes ?? null,
  }
  const sensitive = ctx.can('people.read_sensitive') && input.sensitive
  return {
    ...base,
    ...(sensitive ? sensitivePatch(input) : {}),
    // A blank continuous-service date is only a clear when the writer could see the old value.
    ...(input.originalJoiningDate ? { originalJoiningDate: input.originalJoiningDate } : sensitive ? { originalJoiningDate: null } : {}),
  }
}
