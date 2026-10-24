'use client'

import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { adjustLeaveBalance } from '@/modules/muster/leave/actions'

/** Credit or debit a leave balance (opening balance from an earlier system, or a correction), with a reason. */
export function AdjustBalanceDialog({ employees, types, yearLabel }: { employees: { value: string; label: string }[]; types: { value: string; label: string }[]; yearLabel: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={<Button variant="secondary" icon={<SlidersHorizontal className="size-4" />}>Adjust a balance</Button>} title="Adjust a leave balance" description={`Applies to the ${yearLabel} leave year. Use a minus sign to take days away.`}>
      <ActionForm action={adjustLeaveBalance} onDone={() => setOpen(false)} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
        <FormField name="employeeId" label="Employee" required className="sm:col-span-2"><NativeSelect id="employeeId" name="employeeId" options={employees} placeholder="Choose a person" defaultValue="" /></FormField>
        <FormField name="leaveTypeId" label="Leave type" required><NativeSelect id="leaveTypeId" name="leaveTypeId" options={types} defaultValue={types[0]?.value} /></FormField>
        <FormField name="days" label="Days" required help="e.g. 2.5 or -1"><Input id="days" name="days" inputMode="decimal" /></FormField>
        <FormField name="kind" label="Kind"><NativeSelect id="kind" name="kind" defaultValue="adjustment" options={[{ value: 'adjustment', label: 'Correction' }, { value: 'opening', label: 'Opening balance' }]} /></FormField>
        <FormField name="reason" label="Reason" required><Input id="reason" name="reason" placeholder="Brought forward from the old system" /></FormField>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton>Save adjustment</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
