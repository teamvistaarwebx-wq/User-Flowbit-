import { ClipboardCheck, Contact, DoorOpen, PhoneCall } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Badge, TONE_TEXT } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { KeyValue } from '@/components/ui/key-value'
import { Progress } from '@/components/ui/progress'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { checklistProgress, checklistSteps } from '@/modules/muster/people/checklist'
import { employeesWithSalary } from '@/modules/muster/people/foreign'
import { EXIT_STATUSES, hasLeft, LIFECYCLE, NOTICE_STATUSES, statusLabelOf, type EmployeeStatus } from '@/modules/muster/people/lifecycle'
import { onboardingStatus } from '@/modules/muster/people/onboarding'
import { completedService, formatService } from '@/modules/muster/people/tenure'
import { getPolicy } from '@/modules/muster/settings/queries'
import { docLabel } from '@/modules/muster/settings/defaults'
import { linkableMembers, linkedMember, statutoryFlags } from '@/modules/muster/people/queries'
import { mayManageLogins } from '@/modules/muster/people/scope'
import { AccessCard } from '../access-card'
import type { TabProps } from './types'

const filled = (v: unknown) => typeof v === 'string' ? v.trim().length > 0 : Boolean(v)

/** Profile tab: contact, emergency contact, onboarding (joining documents and details), exit details and Flowbit access. */
export async function ProfileTab({ ctx, employee: e }: TabProps) {
  const [docTypes, salary, linked, members, flags, policy] = await Promise.all([
    ctx.db(EmployeeDocument).distinct('docType', { employeeId: e._id, deletedAt: null }),
    employeesWithSalary(ctx),
    linkedMember(ctx, e.memberId),
    // Loaded even when memberId is set: it may point at a revoked invite that no longer exists.
    ctx.can('people.write') ? linkableMembers(ctx) : Promise.resolve([]),
    statutoryFlags(ctx, e._id),
    getPolicy(ctx),
  ])
  const steps = checklistSteps({
    personalEmail: filled(e.personalEmail), phone: filled(e.phone), dob: filled(e.dob), address: filled(e.address?.text),
    emergency: filled(e.emergencyContact?.name) && filled(e.emergencyContact?.phone), department: Boolean(e.departmentId), designation: Boolean(e.designationId), manager: Boolean(e.managerId),
    pan: flags.pan, bank: flags.bank, uan: flags.uan, employmentType: e.employmentType,
    documentTypes: docTypes.map(String), mandatoryDocuments: policy.onboarding.mandatoryDocuments, hasSalary: salary.has(String(e._id)), hasLogin: Boolean(linked),
  })
  const otherMissing = checklistProgress(steps).missing.filter((m) => m.group !== 'Documents')
  const onboarding = onboardingStatus(policy.onboarding, docTypes.map(String))
  const preJoining = LIFECYCLE[e.status as EmployeeStatus]?.stage === 'pre_joining'
  const leaving = hasLeft(e.status) || EXIT_STATUSES.includes(e.status as EmployeeStatus) || NOTICE_STATUSES.includes(e.status as EmployeeStatus)

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 lg:col-span-7">
        <CardHeader label="Contact" icon={<Contact />} />
        <KeyValue items={[
          { label: 'Work email', value: e.workEmail },
          { label: 'Personal email', value: e.personalEmail },
          { label: 'Phone', value: e.phone },
          { label: 'Date of birth', value: e.dob ? formatDate(e.dob) : null },
          { label: 'Gender', value: e.gender ? e.gender.charAt(0).toUpperCase() + e.gender.slice(1) : null },
          { label: 'Address', value: e.address?.text ? <span className="whitespace-pre-line">{e.address.text}</span> : null },
        ]} />
      </Card>
      <Card className="col-span-12 lg:col-span-5">
        <CardHeader
          label="Onboarding"
          icon={<ClipboardCheck />}
          title={`Onboarding ${onboarding.percent}% complete`}
          description={preJoining ? (onboarding.ready ? 'Enough joining documents are in to start work.' : `${onboarding.threshold}% of the joining documents are needed before they can start.`) : undefined}
          actions={<Badge tone={onboarding.percent === 100 ? 'success' : onboarding.ready ? 'info' : 'warning'}>{onboarding.percent === 100 ? 'Complete' : onboarding.ready ? 'Ready to start' : 'Waiting on documents'}</Badge>}
        />
        <Progress size="lg" value={onboarding.percent} label={`${onboarding.done} of ${onboarding.total} documents`} />
        {onboarding.missing.length ? (
          <div className="mt-4">
            <p className="mb-2 text-[13px] text-fg-2">Documents still needed</p>
            <div className="flex flex-wrap gap-1.5">{onboarding.missing.map((d) => <Badge key={d} tone="warning">{docLabel(d)}</Badge>)}</div>
          </div>
        ) : <p className={cn('mt-4 text-sm', TONE_TEXT.success)}>Every mandatory document is on file.</p>}
        {otherMissing.length ? (
          <div className="mt-4">
            <p className="mb-2 text-[13px] text-fg-2">Details still needed</p>
            <div className="flex flex-wrap gap-1.5">{otherMissing.map((m) => <Badge key={m.key} tone="neutral">{m.label}</Badge>)}</div>
          </div>
        ) : null}
      </Card>
      <Card className="col-span-12 lg:col-span-7">
        <CardHeader label="Emergency contact" icon={<PhoneCall />} />
        <KeyValue columns={3} items={[{ label: 'Name', value: e.emergencyContact?.name }, { label: 'Phone', value: e.emergencyContact?.phone }, { label: 'Relation', value: e.emergencyContact?.relation }]} />
      </Card>
      <div className="col-span-12 lg:col-span-5">
        <AccessCard employeeId={String(e._id)} name={e.fullName} workEmail={e.workEmail} linked={linked} members={linked ? [] : members} canWrite={mayManageLogins(ctx)} />
      </div>
      {leaving ? (
        <Card className="col-span-12">
          <CardHeader label="Exit details" icon={<DoorOpen />} />
          <KeyValue columns={3} items={[
            { label: 'Status', value: statusLabelOf(e.status) },
            { label: 'Resignation date', value: e.resignationDate ? formatDate(e.resignationDate) : null },
            { label: 'Last working day', value: e.exitDate ? formatDate(e.exitDate) : null },
            { label: 'Reason', value: e.exitReason },
            { label: 'Served', value: servedFor(e.joinDate, e.exitDate) },
          ]} />
        </Card>
      ) : null}
    </div>
  )
}

function servedFor(joinDate: string, exitDate?: string | null): string | null {
  return exitDate ? formatService(completedService(joinDate, exitDate)) : null
}
