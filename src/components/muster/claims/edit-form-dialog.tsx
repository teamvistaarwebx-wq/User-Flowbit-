'use client'

import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { updateClaimForm } from '@/modules/muster/claims/form-actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, Textarea } from '@/components/ui/input'

/** Rename a form, change its description or move its deadline (not before today). */
export function EditFormDialog({ id, name, description, closesOn, today }: { id: string; name: string; description: string; closesOn: string; today: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={<Button variant="secondary" icon={<Pencil className="size-4" />}>Edit</Button>} title="Edit claim form">
      <ActionForm action={updateClaimForm} onDone={() => setOpen(false)} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        <FormField name="name" label="Name" required>
          <Input id="name" name="name" defaultValue={name} />
        </FormField>
        <FormField name="description" label="Description">
          <Textarea id="description" name="description" rows={3} defaultValue={description} />
        </FormField>
        <FormField name="closesOn" label="Deadline" required>
          <DateInput id="closesOn" name="closesOn" defaultValue={closesOn} min={today} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton>Save</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
