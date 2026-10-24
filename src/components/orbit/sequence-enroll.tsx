'use client'

import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Dialog } from '@/components/ui/dialog'
import { Select, type SelectOption } from '@/components/ui/select'
import { enrollLeads } from '@/modules/orbit/sequences/actions'

/** "Enroll in sequence" for one lead or a selection. You become the sender of its emails. */
export function EnrollDialog({ ids, options, trigger, onDone }: { ids: string[]; options: SelectOption[]; trigger: ReactNode; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const title = ids.length === 1 ? 'Enroll in a sequence' : `Enroll ${ids.length} leads in a sequence`
  return (
    <Dialog open={open} onOpenChange={setOpen} title={title} description="Emails go from your Gmail if you connected it in Settings → Google, otherwise from Flowbit with replies coming to you. Closed leads, leads without an email and leads already in a sequence are skipped." size="sm" trigger={trigger}>
      {options.length ? (
        <ActionForm action={enrollLeads} className="space-y-4" onDone={() => { setOpen(false); onDone?.() }}>
          {ids.map((id) => <input key={id} type="hidden" name="ids[]" value={id} />)}
          <FormField name="sequenceId" label="Sequence" required><Select id="enroll-sequence" name="sequenceId" options={options} placeholder="Pick a sequence" /></FormField>
          <div className="flex justify-end"><SubmitButton pendingLabel="Enrolling…">Enroll</SubmitButton></div>
        </ActionForm>
      ) : (
        <p className="text-sm text-fg-2">No sequences yet. Create one in Orbit → Sequences first.</p>
      )}
    </Dialog>
  )
}
