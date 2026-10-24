'use client'

import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Input, Textarea } from '@/components/ui/input'
import { submitMyProofs } from '@/modules/muster/tax/actions'

/** Upload one proof at a time (rent receipts, premium receipts, a home loan certificate). */
export function ProofForm({ fy }: { fy: string }) {
  return (
    <ActionForm action={submitMyProofs} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="fy" value={fy} />
      <FormField name="file" label="Proof (PDF or image)" required>
        <Input id="file" name="file" type="file" accept="application/pdf,image/*" />
      </FormField>
      <FormField name="note" label="Note for HR">
        <Textarea id="note" name="note" rows={1} placeholder="Rent receipts April to December" />
      </FormField>
      <div className="flex justify-end sm:col-span-2"><SubmitButton>Upload proof</SubmitButton></div>
    </ActionForm>
  )
}
