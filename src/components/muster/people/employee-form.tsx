'use client'

import { BriefcaseBusiness, IdCard, Landmark, ShieldCheck, PhoneCall, StickyNote } from 'lucide-react'
import type { ReactNode } from 'react'
import { STATE_OPTIONS } from '@/lib/india-states'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { DateInput, fieldBase, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { createEmployee, updateEmployee } from '@/modules/muster/people/actions'
import { allowedNext, EMPLOYMENT_TYPE_LABEL, EMPLOYMENT_TYPES, LIFECYCLE, statusesByStage, WORK_MODE_LABEL, WORK_MODES, workModeOf } from '@/modules/muster/people/lifecycle'

type Option = { value: string; label: string }

export type EmployeeFormValues = {
  id?: string
  code?: string
  fullName?: string
  workEmail?: string
  personalEmail?: string | null
  phone?: string | null
  gender?: string | null
  dob?: string | null
  address?: string | null
  departmentId?: string | null
  designationId?: string | null
  managerId?: string | null
  workLocation?: string | null
  workMode?: string | null
  biometricId?: string | null
  employmentType?: string
  status?: string
  joinDate?: string
  originalJoiningDate?: string | null
  probationEndDate?: string | null
  exitDate?: string | null
  exitReason?: string | null
  resignationDate?: string | null
  noticePeriodDays?: number | null
  ptState?: string | null
  pfCovered?: boolean
  esiCovered?: boolean
  ptExempt?: boolean
  isOvertimeEligible?: boolean
  pan?: string | null
  uan?: string | null
  aadhaar?: string | null
  pfAccountNumber?: string | null
  esicNumber?: string | null
  bank?: { bankName?: string | null; accountName?: string | null; accountNumber?: string | null; ifsc?: string | null }
  emergencyContact?: { name?: string | null; phone?: string | null; relation?: string | null }
  notes?: string | null
  /** The record's updatedAt when the form was opened, so a save never overwrites a newer edit. */
  version?: string
}

type Props = {
  values: EmployeeFormValues
  codeHint: string
  departments: Option[]
  designations: Option[]
  managers: Option[]
  canSensitive: boolean
  /** HR admins may start someone before their joining documents are in, with a reason. */
  canOverrideOnboarding: boolean
  cancelHref: string
}

/** The same chevron NativeSelect draws, for the grouped status select. */
const SELECT_CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23858386' stroke-width='1.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")"

const v = (x: string | number | null | undefined) => (x === null || x === undefined ? undefined : String(x))

function Field({ name, label, required, help, className, children }: { name: string; label: string; required?: boolean; help?: string; className?: string; children: ReactNode }) {
  return (
    <FormField name={name} label={label} required={required} help={help} className={className}>
      {children}
    </FormField>
  )
}

/** Add / edit employee: identity, job, coverage, bank & statutory (sensitive), emergency contact, notes. */
export function EmployeeForm({ values, codeHint, departments, designations, managers, canSensitive, canOverrideOnboarding, cancelHref }: Props) {
  // Editing offers only the moves the lifecycle allows from the current status (as Change status does).
  const allowed = values.id && values.status ? new Set<string>([values.status, ...allowedNext(values.status)]) : null
  const editing = Boolean(values.id)
  return (
    <ActionForm action={editing ? updateEmployee : createEmployee} className="grid grid-cols-12 gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {values.version ? <input type="hidden" name="version" value={values.version} /> : null}
      <Card variant="solid" className="col-span-12 xl:col-span-6 xl:col-start-1 xl:row-start-1">
        <CardHeader label="Identity" icon={<IdCard />} description="Who they are and how to reach them." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="fullName" label="Full name" required><Input id="fullName" name="fullName" defaultValue={v(values.fullName)} placeholder="Aditi Singh" autoComplete="off" /></Field>
          <Field name="code" label="Employee code" help={editing ? undefined : `Leave blank to use ${codeHint}`}><Input id="code" name="code" defaultValue={v(values.code)} placeholder={codeHint} /></Field>
          <Field name="workEmail" label="Work email" required><Input id="workEmail" name="workEmail" type="email" defaultValue={v(values.workEmail)} placeholder="aditi@company.in" /></Field>
          <Field name="personalEmail" label="Personal email"><Input id="personalEmail" name="personalEmail" type="email" defaultValue={v(values.personalEmail)} /></Field>
          <Field name="phone" label="Phone"><Input id="phone" name="phone" inputMode="tel" defaultValue={v(values.phone)} placeholder="98765 43210" /></Field>
          <Field name="dob" label="Date of birth"><DateInput id="dob" name="dob" defaultValue={v(values.dob)} /></Field>
          <Field name="gender" label="Gender">
            <NativeSelect id="gender" name="gender" defaultValue={v(values.gender) ?? ''} placeholder="Not set" options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }, { value: 'undisclosed', label: 'Prefer not to say' }]} />
          </Field>
          <Field name="address" label="Home address" className="sm:col-span-2"><Textarea id="address" name="address" rows={3} maxLength={400} defaultValue={v(values.address)} /></Field>
        </div>
      </Card>

      <Card variant="solid" className="col-span-12 xl:col-span-6 xl:col-start-7 xl:row-span-3 xl:row-start-1">
        <CardHeader label="Job" icon={<BriefcaseBusiness />} description="Role, reporting line and employment dates." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="departmentId" label="Department"><NativeSelect id="departmentId" name="departmentId" defaultValue={v(values.departmentId) ?? ''} placeholder="No department" options={departments} /></Field>
          <Field name="designationId" label="Designation"><NativeSelect id="designationId" name="designationId" defaultValue={v(values.designationId) ?? ''} placeholder="No designation" options={designations} /></Field>
          <Field name="managerId" label="Reporting manager"><NativeSelect id="managerId" name="managerId" defaultValue={v(values.managerId) ?? ''} placeholder="Nobody" options={managers.filter((m) => m.value !== values.id)} /></Field>
          <Field name="workLocation" label="Work location"><Input id="workLocation" name="workLocation" defaultValue={v(values.workLocation)} placeholder="Indore" /></Field>
          <Field name="workMode" label="Work mode" help="Remote people are never asked for their location at check-in.">
            <NativeSelect id="workMode" name="workMode" defaultValue={workModeOf(values.workMode)} options={WORK_MODES.map((m) => ({ value: m, label: WORK_MODE_LABEL[m] }))} />
          </Field>
          <Field name="biometricId" label="Biometric device id" help="Their user id on the attendance device. Leave blank when it is the employee code."><Input id="biometricId" name="biometricId" maxLength={32} defaultValue={v(values.biometricId)} placeholder="e.g. 17" /></Field>
          <Field name="employmentType" label="Employment type" required>
            <NativeSelect id="employmentType" name="employmentType" defaultValue={values.employmentType ?? 'full_time'} options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABEL[t] }))} />
          </Field>
          <Field name="status" label="Status" required help={values.status ? LIFECYCLE[values.status as keyof typeof LIFECYCLE]?.meaning : undefined}>
            <select id="status" name="status" defaultValue={values.status ?? 'probation'} className={cn(fieldBase, 'h-10 appearance-none rounded-full bg-[size:16px] bg-[position:right_14px_center] bg-no-repeat px-4 pr-10 text-sm')} style={{ backgroundImage: SELECT_CHEVRON }}>
              {statusesByStage().map((g) => ({ ...g, statuses: g.statuses.filter((s) => !allowed || allowed.has(s)) })).filter((g) => g.statuses.length).map((g) => (
                <optgroup key={g.stage} label={g.label} className="bg-bg-2">
                  {g.statuses.map((s) => <option key={s} value={s} className="bg-bg-2">{LIFECYCLE[s].label}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field name="joinDate" label="Joining date" required><DateInput id="joinDate" name="joinDate" defaultValue={v(values.joinDate)} /></Field>
          <Field name="probationEndDate" label="Probation ends" help="HR and the manager are reminded 15 days before"><DateInput id="probationEndDate" name="probationEndDate" defaultValue={v(values.probationEndDate)} /></Field>
          <Field name="originalJoiningDate" label="Original joining date" help="Continuous service for gratuity"><DateInput id="originalJoiningDate" name="originalJoiningDate" defaultValue={v(values.originalJoiningDate)} /></Field>
          <Field name="resignationDate" label="Resignation date" help="Notice is counted from here"><DateInput id="resignationDate" name="resignationDate" defaultValue={v(values.resignationDate)} /></Field>
          <Field name="exitDate" label="Last working day"><DateInput id="exitDate" name="exitDate" defaultValue={v(values.exitDate)} /></Field>
          <Field name="exitReason" label="Reason for leaving" className="sm:col-span-2" help="Needed when the status says they have left"><Input id="exitReason" name="exitReason" defaultValue={v(values.exitReason)} /></Field>
          <Field name="noticePeriodDays" label="Notice period (days)" help="Blank follows the leave policy"><Input id="noticePeriodDays" name="noticePeriodDays" inputMode="numeric" defaultValue={v(values.noticePeriodDays)} /></Field>
          {canOverrideOnboarding ? (
            <Field name="onboardingOverride" label="Start before documents are in" className="sm:col-span-2" help="Only if this makes someone active, on probation or an intern before their joining documents reach the threshold. Say why; it is audited.">
              <Input id="onboardingOverride" name="onboardingOverride" placeholder="Leave blank unless needed" />
            </Field>
          ) : null}
          <Field name="ptState" label="Professional tax state"><NativeSelect id="ptState" name="ptState" defaultValue={v(values.ptState) ?? ''} placeholder="Not set" options={STATE_OPTIONS} /></Field>
        </div>
      </Card>

      <Card variant="solid" className="col-span-12 xl:col-span-6 xl:col-start-1 xl:row-start-2">
        <CardHeader label="Statutory coverage" icon={<ShieldCheck />} description="Payroll deducts PF, ESI and PT only where these say so." />
        <div className="grid gap-3 sm:grid-cols-2">
          <Checkbox name="pfCovered" defaultChecked={values.pfCovered} label="PF covered" description="Employee and employer PF" />
          <Checkbox name="esiCovered" defaultChecked={values.esiCovered} label="ESI covered" description="Within the ESI wage limit" />
          <Checkbox name="ptExempt" defaultChecked={values.ptExempt} label="PT exempt" description="No professional tax" />
          <Checkbox name="isOvertimeEligible" defaultChecked={values.isOvertimeEligible} label="Overtime eligible" />
        </div>
      </Card>

      <Card variant="solid" className="col-span-12 xl:col-span-6 xl:col-start-1 xl:row-start-3">
        <CardHeader label="Emergency contact" icon={<PhoneCall />} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="emergencyContact.name" label="Name"><Input id="emergencyContact.name" name="emergencyContact.name" defaultValue={v(values.emergencyContact?.name)} /></Field>
          <Field name="emergencyContact.phone" label="Phone"><Input id="emergencyContact.phone" name="emergencyContact.phone" inputMode="tel" defaultValue={v(values.emergencyContact?.phone)} /></Field>
          <Field name="emergencyContact.relation" label="Relation"><Input id="emergencyContact.relation" name="emergencyContact.relation" defaultValue={v(values.emergencyContact?.relation)} placeholder="Mother" /></Field>
        </div>
      </Card>

      {canSensitive ? (
        <Card variant="solid" className="col-span-12">
          <input type="hidden" name="sensitive" value="true" />
          <CardHeader label="Bank & statutory" icon={<Landmark />} description="Visible only to people who may see PAN, UAN and bank details." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field name="pan" label="PAN"><Input id="pan" name="pan" defaultValue={v(values.pan)} placeholder="ABCDE1234F" className="uppercase" /></Field>
            <Field name="uan" label="UAN"><Input id="uan" name="uan" inputMode="numeric" defaultValue={v(values.uan)} placeholder="12 digits" /></Field>
            <Field name="esicNumber" label="ESIC number"><Input id="esicNumber" name="esicNumber" inputMode="numeric" defaultValue={v(values.esicNumber)} /></Field>
            <Field name="aadhaar" label="Aadhaar"><Input id="aadhaar" name="aadhaar" inputMode="numeric" defaultValue={v(values.aadhaar)} placeholder="12 digits" /></Field>
            <Field name="pfAccountNumber" label="PF number"><Input id="pfAccountNumber" name="pfAccountNumber" defaultValue={v(values.pfAccountNumber)} /></Field>
            <Field name="bank.bankName" label="Bank"><Input id="bank.bankName" name="bank.bankName" defaultValue={v(values.bank?.bankName)} placeholder="HDFC Bank" /></Field>
            <Field name="bank.accountName" label="Account holder"><Input id="bank.accountName" name="bank.accountName" defaultValue={v(values.bank?.accountName)} /></Field>
            <Field name="bank.accountNumber" label="Account number"><Input id="bank.accountNumber" name="bank.accountNumber" inputMode="numeric" defaultValue={v(values.bank?.accountNumber)} /></Field>
            <Field name="bank.ifsc" label="IFSC"><Input id="bank.ifsc" name="bank.ifsc" defaultValue={v(values.bank?.ifsc)} placeholder="HDFC0001234" className="uppercase" /></Field>
          </div>
        </Card>
      ) : null}

      <Card variant="solid" className="col-span-12">
        <CardHeader label="Notes" icon={<StickyNote />} />
        <FormField name="notes"><Textarea id="notes" name="notes" rows={3} defaultValue={v(values.notes)} placeholder="Anything HR should know" /></FormField>
      </Card>

      <div className="col-span-12 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" href={cancelHref}>Cancel</Button>
        <SubmitButton pendingLabel={editing ? 'Saving…' : 'Adding…'}>{editing ? 'Save changes' : 'Add employee'}</SubmitButton>
      </div>
    </ActionForm>
  )
}
