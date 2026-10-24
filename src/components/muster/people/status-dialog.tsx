'use client'

import { ArrowRightLeft } from 'lucide-react'
import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, NativeSelect, Textarea } from '@/components/ui/input'
import { changeEmployeeStatus } from '@/modules/muster/people/actions'
import { allowedNext, EXIT_STATUSES, LIFECYCLE, NOTICE_STATUSES, type EmployeeStatus } from '@/modules/muster/people/lifecycle'
import { startsWork } from '@/modules/muster/people/onboarding'
import { Note } from '../ui/note'

type Onboarding = { percent: number; threshold: number; missing: string[] }
type Props = { employeeId: string; name: string; status: string; today: string; onboarding: Onboarding; canOverride: boolean }

/** Lifecycle move from the profile: only allowed targets; exits ask for the last day and a reason; starting work checks joining documents. */
export function StatusDialog({ employeeId, name, status, today, onboarding, canOverride }: Props) {
  const options = allowedNext(status)
  const [open, setOpen] = useState(false)
  const [picked, setTarget] = useState<EmployeeStatus | ''>(options[0] ?? '')
  // After a status change the allowed moves change too; fall back to the first one rather than keep a stale pick.
  const target: EmployeeStatus | '' = picked && options.includes(picked) ? picked : (options[0] ?? '')
  if (!options.length) return null
  const exiting = EXIT_STATUSES.includes(target as EmployeeStatus)
  const notice = NOTICE_STATUSES.includes(target as EmployeeStatus)
  const blocked = Boolean(target) && startsWork(status, target) && onboarding.percent < onboarding.threshold
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="secondary" icon={<ArrowRightLeft className="size-4" />}>Change status</Button>}
      title={`Change ${name}'s status`}
      description={`Now ${LIFECYCLE[status as EmployeeStatus]?.label ?? status}. Every change is recorded with its reason.`}
    >
      <ActionForm action={changeEmployeeStatus} onDone={() => setOpen(false)} className="space-y-4">
        <input type="hidden" name="id" value={employeeId} />
        <FormField name="status" label="New status" required help={target ? LIFECYCLE[target].meaning : undefined}>
          <NativeSelect id="status" name="status" value={target} onChange={(e) => setTarget(e.target.value as EmployeeStatus)} options={options.map((s) => ({ value: s, label: LIFECYCLE[s].label }))} />
        </FormField>
        {exiting ? (
          <FormField name="exitDate" label="Last working day" required help="May be in the future.">
            <DateInput id="exitDate" name="exitDate" defaultValue={today} />
          </FormField>
        ) : null}
        {notice ? (
          <FormField name="resignationDate" label="Resignation date" required>
            <DateInput id="resignationDate" name="resignationDate" defaultValue={today} />
          </FormField>
        ) : null}
        {blocked ? (
          <Note tone="warning" title={`Joining documents are ${onboarding.percent}% complete; ${onboarding.threshold}% is needed to start.`}>
            <p>Missing: {onboarding.missing.join(', ')}.</p>
            {!canOverride ? <p className="mt-1">Upload them first, or ask an HR admin to start {name} anyway.</p> : null}
          </Note>
        ) : null}
        {blocked && canOverride ? (
          <FormField name="onboardingOverride" label="Start anyway: why?" required help="Recorded in the audit log with the missing documents.">
            <Textarea id="onboardingOverride" name="onboardingOverride" rows={2} placeholder="Joining today; documents promised by Friday" />
          </FormField>
        ) : null}
        <FormField name="reason" label="Reason" required={exiting}>
          <Textarea id="reason" name="reason" rows={3} placeholder={exiting ? 'Why they are leaving' : 'Optional note for the record'} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton disabled={blocked && !canOverride}>{exiting ? 'Record exit' : blocked ? 'Start anyway' : 'Change status'}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
