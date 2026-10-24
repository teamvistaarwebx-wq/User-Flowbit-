'use client'

import { CalendarClock, Plus, Stamp } from 'lucide-react'
import { useState } from 'react'
import type { StatutorySettings } from '@/modules/muster/payroll/statutory'
import { confirmStatutoryVersion, setVersionPayrollMonth } from '@/modules/muster/payroll/settings-actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/input'
import { StatutoryForm } from './statutory-form'

/** `unreadable` names the sections ("PF", "ESI") the latest version could not supply, so they start from the standard rates. */
export function AddStatutoryVersion({ base, fromVersion, unreadable, today }: { base: StatutorySettings; fromVersion: boolean; unreadable: readonly string[]; today: string }) {
  const [open, setOpen] = useState(false)
  const source = !fromVersion
    ? 'Filled in with the standard rates; check each one.'
    : unreadable.length
      ? `Copied from the latest version, except ${unreadable.join(' and ')}, which could not be read there and start${unreadable.length === 1 ? 's' : ''} from the standard rates.`
      : 'Copied from the latest version.'
  return (
    <Dialog open={open} onOpenChange={setOpen} size="xl" trigger={<Button variant="primary" icon={<Plus className="size-4" />}>Add version</Button>} title="New statutory rates" description={`${source} It is saved as a proposal; confirm it once your CA has checked it.`}>
      <StatutoryForm base={base} today={today} onDone={() => setOpen(false)} />
    </Dialog>
  )
}

export function ConfirmVersion({ id, label }: { id: string; label: string }) {
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="primary" icon={<Stamp className="size-3.5" />}>Confirm</Button>}
      title={`Confirm the rates effective ${label}?`}
      description="Confirmed rates can never be edited; corrections become a new version. Payroll uses them from their payroll month."
      confirmLabel="Confirm rates"
      tone="primary"
      onConfirm={() => confirmStatutoryVersion({ id })}
    />
  )
}

export function SetPayrollMonth({ id, current }: { id: string; current: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} size="sm" trigger={<Button size="sm" variant="secondary" icon={<CalendarClock className="size-3.5" />}>Set payroll month</Button>} title="Which payroll month applies these rates?">
      <ActionForm action={setVersionPayrollMonth} onDone={() => setOpen(false)} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        <FormField name="payrollFrom" label="From the 1st of" required>
          <DateInput id="payrollFrom" name="payrollFrom" defaultValue={current} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton>Save</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
