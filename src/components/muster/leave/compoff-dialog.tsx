'use client'

import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, NativeSelect } from '@/components/ui/input'
import { raiseCompOff } from '@/modules/muster/leave/compoff-actions'

/** Claim a comp-off for a worked weekly off or holiday (for yourself, or someone else with people.write). */
export function CompOffDialog({ employees, today, hint }: { employees: { value: string; label: string }[]; today: string; hint: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={<Button variant="primary" icon={<CalendarPlus className="size-4" />}>Raise comp-off</Button>} title="Raise a comp-off" description={`For working a day that was off. The work must already be on the register. ${hint}`}>
      <ActionForm action={raiseCompOff} onDone={() => setOpen(false)} resetOnSuccess className="space-y-4">
        {employees.length > 1 ? (
          <FormField name="employeeId" label="Who" required><NativeSelect id="employeeId" name="employeeId" options={employees} placeholder="Choose a person" defaultValue="" /></FormField>
        ) : employees[0] ? <input type="hidden" name="employeeId" value={employees[0].value} /> : null}
        <FormField name="workedOn" label="Day worked" required><DateInput id="workedOn" name="workedOn" max={today} defaultValue={today} /></FormField>
        <FormField name="reason" label="What was the work?"><Input id="reason" name="reason" placeholder="Release support for the Nimbus launch" /></FormField>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton>Send for approval</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
