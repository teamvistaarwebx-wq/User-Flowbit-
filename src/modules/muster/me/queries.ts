import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { Department } from '@/models/muster/Department'
import { Employee } from '@/models/muster/Employee'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { SalaryStructure } from '@/models/muster/SalaryStructure'
import { checklistProgress, checklistSteps } from '@/modules/muster/people/checklist'
import { ownEmployeeId } from '@/modules/muster/people/scope'
import { getPolicy } from '@/modules/muster/settings/queries'

/**
 * Self-service always works from the session's own employee id, never one
 * from the URL. Every /app/me page starts here.
 */
export async function myEmployee(ctx: Ctx) {
  const id = ownEmployeeId(ctx)
  if (!id) return null
  return ctx.db(Employee).findOne({ _id: id, deletedAt: null }).lean()
}
export type MyEmployee = NonNullable<Awaited<ReturnType<typeof myEmployee>>>

export async function myContext(ctx: Ctx, employee: MyEmployee) {
  const [department, manager] = await Promise.all([
    employee.departmentId ? ctx.db(Department).findById(employee.departmentId, { name: 1 }).lean() : null,
    employee.managerId ? ctx.db(Employee).findById(employee.managerId, { fullName: 1 }).lean() : null,
  ])
  return { department: department?.name ?? null, manager: manager?.fullName ?? null }
}

/** The person's own part of the joining checklist (Contact, Statutory, Documents). */
export async function myChecklist(ctx: Ctx, e: MyEmployee) {
  const [docs, hasSalary, policy] = await Promise.all([
    ctx.db(EmployeeDocument).distinct('docType', { employeeId: e._id, deletedAt: null }),
    ctx.db(SalaryStructure).exists({ employeeId: e._id, effectiveTo: null }),
    getPolicy(ctx),
  ])
  const steps = checklistSteps({
    personalEmail: Boolean(e.personalEmail),
    phone: Boolean(e.phone),
    dob: Boolean(e.dob),
    address: Boolean(e.address?.text?.trim()),
    emergency: Boolean(e.emergencyContact?.name && e.emergencyContact?.phone),
    department: Boolean(e.departmentId),
    designation: Boolean(e.designation || e.designationId),
    manager: Boolean(e.managerId),
    pan: Boolean(e.pan),
    bank: Boolean(e.bank?.accountNumber && e.bank?.ifsc),
    uan: Boolean(e.uan),
    employmentType: e.employmentType,
    documentTypes: docs.map(String),
    mandatoryDocuments: policy.onboarding.mandatoryDocuments,
    hasSalary: Boolean(hasSalary),
    hasLogin: Boolean(e.memberId),
  }).filter((s) => s.group === 'Contact' || s.group === 'Statutory' || s.group === 'Documents')
  return { steps, progress: checklistProgress(steps) }
}
