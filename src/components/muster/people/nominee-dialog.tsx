'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, NativeSelect } from '@/components/ui/input'
import { addNominee } from '@/modules/muster/people/record-actions'
import { NOMINEE_SCHEME_LABEL } from '@/modules/muster/settings/defaults'

/** Add a nominee for PF, gratuity, insurance or another scheme. */
export function NomineeDialog({ employeeId, today }: { employeeId: string; today: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={<Button variant="violet" size="sm" icon={<Plus className="size-4" />}>Add nominee</Button>} title="Add a nominee" description="Live shares of one scheme add up to at most 100%.">
      <ActionForm action={addNominee} onDone={() => setOpen(false)} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="employeeId" value={employeeId} />
        <FormField name="scheme" label="Scheme" required>
          <NativeSelect id="scheme" name="scheme" defaultValue="pf" options={Object.entries(NOMINEE_SCHEME_LABEL).map(([value, label]) => ({ value, label }))} />
        </FormField>
        <FormField name="sharePercent" label="Share (%)" required><Input id="sharePercent" name="sharePercent" inputMode="decimal" defaultValue="100" /></FormField>
        <FormField name="name" label="Name" required><Input id="name" name="name" /></FormField>
        <FormField name="relationship" label="Relationship" required><Input id="relationship" name="relationship" placeholder="Spouse" /></FormField>
        <FormField name="dob" label="Date of birth"><DateInput id="dob" name="dob" max={today} /></FormField>
        <FormField name="phone" label="Phone"><Input id="phone" name="phone" inputMode="tel" /></FormField>
        <FormField name="address" label="Address" className="sm:col-span-2"><Input id="address" name="address" /></FormField>
        <FormField name="effectiveFrom" label="Effective from" required><DateInput id="effectiveFrom" name="effectiveFrom" defaultValue={today} /></FormField>
        <div className="flex items-end justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton>Add nominee</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
