import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/ctx'
import { PageHeader } from '@/components/ui/page-header'
import { EmployeeForm } from '@/components/muster/people/employee-form'
import { Employee, WITHOUT_SENSITIVE } from '@/models/muster/Employee'
import { ONBOARDING_OVERRIDE_PERM } from '@/modules/muster/people/onboarding-gate'
import { peopleOptions } from '@/modules/muster/people/queries'
import { visibleEmployeeIds } from '@/modules/muster/people/scope'

export const metadata: Metadata = { title: 'Edit employee' }

const idOrNull = (x: unknown) => (x ? String(x) : null)

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'muster', perm: 'people.write' })
  if (!isValidObjectId(id)) notFound()
  const visible = await visibleEmployeeIds(ctx)
  if (visible !== null && !visible.includes(id)) notFound()
  const canSensitive = ctx.can('people.read_sensitive')
  const [e, options] = await Promise.all([ctx.db(Employee).findById(id, canSensitive ? undefined : WITHOUT_SENSITIVE).lean(), peopleOptions(ctx)])
  if (!e) notFound()
  const base = `/app/hr/people/${id}`
  return (
    <>
      <PageHeader title={`Edit ${e.fullName}`} description={`${e.code} · changes are recorded in the audit log.`} back={{ href: base, label: e.fullName }} />
      <EmployeeForm
        values={{
          id, code: e.code, fullName: e.fullName, workEmail: e.workEmail, personalEmail: e.personalEmail, phone: e.phone, gender: e.gender, dob: e.dob, address: e.address?.text,
          departmentId: idOrNull(e.departmentId), designationId: idOrNull(e.designationId), managerId: idOrNull(e.managerId), workLocation: e.workLocation, workMode: e.workMode, biometricId: e.biometricId,
          employmentType: e.employmentType, status: e.status, joinDate: e.joinDate, probationEndDate: e.probationEndDate, originalJoiningDate: e.originalJoiningDate, exitDate: e.exitDate, exitReason: e.exitReason,
          resignationDate: e.resignationDate, noticePeriodDays: e.noticePeriodDays, ptState: e.ptState, pfCovered: e.statutory?.pfCovered, esiCovered: e.statutory?.esiCovered,
          ptExempt: e.statutory?.ptExempt, isOvertimeEligible: e.isOvertimeEligible, pan: e.pan, uan: e.uan, aadhaar: e.aadhaar, pfAccountNumber: e.pfAccountNumber, esicNumber: e.esicNumber,
          bank: e.bank ? { bankName: e.bank.bankName, accountName: e.bank.accountName, accountNumber: e.bank.accountNumber, ifsc: e.bank.ifsc } : undefined,
          emergencyContact: e.emergencyContact ? { name: e.emergencyContact.name, phone: e.emergencyContact.phone, relation: e.emergencyContact.relation } : undefined,
          notes: e.notes, version: e.updatedAt ? new Date(e.updatedAt).toISOString() : undefined,
        }}
        codeHint={e.code}
        departments={options.departments}
        designations={options.designations}
        managers={options.managers}
        canSensitive={canSensitive}
        canOverrideOnboarding={ctx.can(ONBOARDING_OVERRIDE_PERM)}
        cancelHref={base}
      />
    </>
  )
}
