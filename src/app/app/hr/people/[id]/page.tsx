import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { BriefcaseBusiness, CalendarDays, FileSignature, Hash, Mail, Pencil, Phone, UserRound } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LinkTabs } from '@/components/ui/tabs'
import { Facts } from '@/components/muster/ui/facts'
import { StatusDialog } from '@/components/muster/people/status-dialog'
import { AttendanceTab } from '@/components/muster/people/tabs/attendance'
import { BankTab } from '@/components/muster/people/tabs/bank'
import { DocumentsTab } from '@/components/muster/people/tabs/documents'
import { JobTab } from '@/components/muster/people/tabs/job'
import { KudosTab } from '@/components/muster/people/tabs/kudos'
import { LeaveTab } from '@/components/muster/people/tabs/leave'
import { LettersTab } from '@/components/muster/people/tabs/letters'
import { NomineesTab } from '@/components/muster/people/tabs/nominees'
import { PayslipsTab } from '@/components/muster/people/tabs/payslips'
import { ProfileTab } from '@/components/muster/people/tabs/profile'
import { RemarksTab } from '@/components/muster/people/tabs/remarks'
import type { TabProps } from '@/components/muster/people/tabs/types'
import { Department } from '@/models/muster/Department'
import { Employee, WITHOUT_SENSITIVE } from '@/models/muster/Employee'
import { EMPLOYMENT_TYPE_LABEL, statusLabelOf, statusToneOf, type EmploymentType } from '@/modules/muster/people/lifecycle'
import { ONBOARDING_OVERRIDE_PERM, onboardingFor } from '@/modules/muster/people/onboarding-gate'
import { mayDecideOwn, ownEmployeeId, visibleEmployeeIds } from '@/modules/muster/people/scope'
import { docLabel } from '@/modules/muster/settings/defaults'

export const metadata: Metadata = { title: 'Employee' }

type TabDef = { key: string; label: string; show: boolean; render: (p: TabProps) => Promise<ReactNode> }

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ product: 'muster', perm: 'people.read' })
  if (!isValidObjectId(id)) notFound()
  const visible = await visibleEmployeeIds(ctx)
  if (visible !== null && !visible.includes(id)) notFound()
  const sensitive = ctx.can('people.read_sensitive')
  const employee = await ctx.db(Employee).findOne({ _id: id, deletedAt: null }, sensitive ? undefined : WITHOUT_SENSITIVE).lean()
  if (!employee) notFound()
  const [dept, manager, onboarding] = await Promise.all([
    employee.departmentId ? ctx.db(Department).findById(employee.departmentId, { name: 1 }).lean() : null,
    employee.managerId ? ctx.db(Employee).findById(employee.managerId, { fullName: 1 }).lean() : null,
    onboardingFor(ctx, employee._id),
  ])

  const tabs: TabDef[] = [
    { key: 'profile', label: 'Profile', show: true, render: ProfileTab },
    { key: 'job', label: 'Job', show: true, render: JobTab },
    { key: 'documents', label: 'Documents', show: true, render: DocumentsTab },
    { key: 'kudos', label: 'Kudos', show: ctx.has('work'), render: KudosTab },
    { key: 'nominees', label: 'Nominees', show: sensitive, render: NomineesTab },
    { key: 'bank', label: 'Bank & statutory', show: sensitive, render: BankTab },
    { key: 'remarks', label: 'Remarks', show: ctx.can('people.write') && !(ownEmployeeId(ctx) === id && !mayDecideOwn(ctx)), render: RemarksTab },
    { key: 'attendance', label: 'Attendance', show: ctx.can('attendance.read') || ownEmployeeId(ctx) === id, render: AttendanceTab },
    { key: 'leave', label: 'Leave', show: ctx.can('leave.read') || ownEmployeeId(ctx) === id, render: LeaveTab },
    { key: 'letters', label: 'Letters', show: ctx.can('letters.read'), render: LettersTab },
    { key: 'payslips', label: 'Payslips', show: ctx.can('payroll.read') && ctx.hasFeature('muster.payroll'), render: PayslipsTab },
  ].filter((t) => t.show)
  const requested = first(sp.tab) ?? 'profile'
  const active = tabs.find((t) => t.key === requested) ?? tabs[0]
  const base = `/app/hr/people/${id}`
  const canWrite = ctx.can('people.write')
  const own = ownEmployeeId(ctx) === id && !mayDecideOwn(ctx)

  return (
    <>
      <Card className="mb-5 rounded-[14px] lit-edge-bright animate-slide-up">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_1px_minmax(260px,360px)] lg:gap-8">
          <div className="flex min-w-0 flex-col justify-between gap-5">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar name={employee.fullName} size="lg" ring />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="truncate text-xl font-medium leading-7 text-white">{employee.fullName}</h1>
                  <Badge tone={statusToneOf(employee.status)}>{statusLabelOf(employee.status)}</Badge>
                </div>
                <p className="mt-1 text-sm text-white/70">{[employee.designation, dept?.name].filter(Boolean).join(' · ') || 'No role set'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canWrite ? <Button variant="primary" icon={<Pencil className="size-4" />} href={`${base}/edit`}>Edit</Button> : null}
              {canWrite && !own ? (
                <StatusDialog
                  employeeId={id}
                  name={employee.fullName}
                  status={employee.status}
                  today={todayIST()}
                  onboarding={{ percent: onboarding.percent, threshold: onboarding.threshold, missing: onboarding.missing.map(docLabel) }}
                  canOverride={ctx.can(ONBOARDING_OVERRIDE_PERM)}
                />
              ) : null}
              {ctx.can('letters.write') ? <Button variant="secondary" icon={<FileSignature className="size-4" />} href={`/app/hr/letters/new?employee=${id}`}>Draft letter</Button> : null}
            </div>
          </div>
          <span aria-hidden className="hidden bg-[#6B676C] lg:block" />
          <Facts
            className="border-t border-white/[0.12] pt-4 lg:border-0 lg:pt-0"
            items={[
              { icon: <Hash />, label: 'Code', value: <span className="font-mono text-[13px]">{employee.code}</span> },
              { icon: <BriefcaseBusiness />, label: 'Type', value: EMPLOYMENT_TYPE_LABEL[employee.employmentType as EmploymentType] },
              { icon: <CalendarDays />, label: 'Joined', value: formatDate(employee.joinDate) },
              { icon: <UserRound />, label: 'Reports to', value: manager?.fullName, hidden: !manager },
              { icon: <Mail />, label: 'Email', value: <a href={`mailto:${employee.workEmail}`} className="transition-colors hover:text-blush">{employee.workEmail}</a> },
              { icon: <Phone />, label: 'Phone', value: employee.phone, hidden: !employee.phone },
            ]}
          />
        </div>
      </Card>
      <LinkTabs className="mb-5" tabs={tabs.map((t) => ({ href: t.key === 'profile' ? base : `${base}?tab=${t.key}`, label: t.label }))} />
      <div className="animate-fade-in">{await active.render({ ctx, employee, sp })}</div>
    </>
  )
}
