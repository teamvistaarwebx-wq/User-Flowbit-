import { BriefcaseBusiness, IndianRupee, ShieldCheck } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { TONE_TEXT } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { KeyValue } from '@/components/ui/key-value'
import { Department } from '@/models/muster/Department'
import { Employee } from '@/models/muster/Employee'
import { currentSalary } from '@/modules/muster/people/foreign'
import { EMPLOYMENT_TYPE_LABEL, statusLabelOf, WORK_MODE_LABEL, workModeOf, type EmploymentType } from '@/modules/muster/people/lifecycle'
import { getPolicy } from '@/modules/muster/settings/queries'
import { Facts } from '../../ui/facts'
import type { TabProps } from './types'

/** Covered / not covered as a coloured word, the way the Figma table sets priority: no row of pills. */
const yesNo = (on: boolean | null | undefined, yes = 'Covered', no = 'Not covered') => <span className={on ? TONE_TEXT.success : 'text-fg-2'}>{on ? yes : no}</span>

/** Job tab: role, dates, notice terms, coverage and (with payroll.read) current salary. */
export async function JobTab({ ctx, employee: e }: TabProps) {
  const seesPay = ctx.can('payroll.read') && ctx.hasFeature('muster.payroll')
  const [dept, manager, policy, salary] = await Promise.all([
    e.departmentId ? ctx.db(Department).findById(e.departmentId, { name: 1 }).lean() : null,
    e.managerId ? ctx.db(Employee).findById(e.managerId, { fullName: 1 }).lean() : null,
    getPolicy(ctx),
    seesPay ? currentSalary(ctx, String(e._id)) : Promise.resolve(null),
  ])
  const policyNotice = e.status === 'intern' ? policy.notice.internDays : e.status === 'probation' ? policy.notice.probationDays : policy.notice.confirmedDays
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 lg:col-span-8">
        <CardHeader label="Role and dates" icon={<BriefcaseBusiness />} />
        <KeyValue items={[
          { label: 'Employee code', value: <span className="font-mono">{e.code}</span> },
          { label: 'Status', value: statusLabelOf(e.status) },
          { label: 'Department', value: dept?.name },
          { label: 'Designation', value: e.designation },
          { label: 'Reporting manager', value: manager?.fullName },
          { label: 'Employment type', value: EMPLOYMENT_TYPE_LABEL[e.employmentType as EmploymentType] },
          { label: 'Joining date', value: formatDate(e.joinDate) },
          { label: 'Original joining date', value: e.originalJoiningDate ? formatDate(e.originalJoiningDate) : null },
          { label: 'Last working day', value: e.exitDate ? formatDate(e.exitDate) : null },
          { label: 'Work location', value: e.workLocation },
          { label: 'Work mode', value: WORK_MODE_LABEL[workModeOf(e.workMode)] },
          { label: 'Biometric device id', value: e.biometricId ? <span className="font-mono">{e.biometricId}</span> : null },
          { label: 'Notice period', value: e.noticePeriodDays != null ? `${e.noticePeriodDays} days (contract)` : `${policyNotice} days (policy)` },
          { label: 'Professional tax state', value: e.ptState },
        ]} />
      </Card>
      <Card className="col-span-12 lg:col-span-4">
        <CardHeader label="Statutory coverage" icon={<ShieldCheck />} />
        <Facts
          items={[
            { label: 'Provident fund', value: yesNo(e.statutory?.pfCovered) },
            { label: 'ESI', value: yesNo(e.statutory?.esiCovered) },
            { label: 'Professional tax', value: e.statutory?.ptExempt ? 'Exempt' : 'Deducted' },
            { label: 'Overtime', value: yesNo(e.isOvertimeEligible, 'Eligible', 'Not eligible') },
          ]}
        />
      </Card>
      {seesPay ? (
        <Card className="col-span-12">
          <CardHeader label="Current salary" icon={<IndianRupee />} actions={ctx.can('people.salary') ? <Button size="sm" variant="secondary" href={`/app/hr/payroll/structures?employee=${e._id}`}>Edit salary</Button> : null} />
          {salary ? (
            <KeyValue columns={3} items={[{ label: 'Monthly gross', value: formatINR(salary.monthlyGross) }, { label: 'CTC per year', value: formatINR(salary.ctcAnnual) }, { label: 'Effective from', value: formatDate(salary.effectiveFrom) }]} />
          ) : (
            <p className="text-sm text-fg-2">No salary structure yet, so payroll skips {e.firstName} until one is added.</p>
          )}
        </Card>
      ) : null}
    </div>
  )
}
