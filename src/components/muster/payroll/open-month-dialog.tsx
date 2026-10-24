'use client'

import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { openPayrollMonth } from '@/modules/muster/payroll/cycle-actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/input'

/** Opens a payroll month (or goes to it when it is already open). */
export function OpenMonthDialog({ defaultMonth }: { defaultMonth: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="primary" icon={<CalendarPlus className="size-4" />}>Open a month</Button>}
      title="Open a payroll month"
      description="Open the month once its attendance is locked, or earlier to start collecting claims for it."
      size="sm"
    >
      <ActionForm action={openPayrollMonth} onDone={() => setOpen(false)} className="space-y-4">
        <FormField name="month" label="Month" required>
          <DateInput id="month" name="month" type="month" defaultValue={defaultMonth} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Opening…">Open month</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
