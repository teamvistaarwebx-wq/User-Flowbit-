'use client'

import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { reviewProofs } from '@/modules/muster/tax/actions'
import type { DeclaredAmounts } from '@/modules/muster/tax/worksheet'
import { AmountFields } from './amount-fields'

/** HR verifies proofs (adjusting amounts to what the proofs show) or sends them back with a note. */
export function ReviewForm({ fy, employeeId, values }: { fy: string; employeeId: string; values: DeclaredAmounts & { landlordName?: string } }) {
  const [mode, setMode] = useState<'verify' | 'reject' | null>(null)
  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setMode('verify')}>Verify proofs</Button>
        <Button size="sm" variant="secondary" onClick={() => setMode('reject')}>Send back</Button>
      </div>
    )
  }
  return (
    <ActionForm action={reviewProofs} onDone={() => setMode(null)} className="space-y-4">
      <input type="hidden" name="fy" value={fy} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="decision" value={mode} />
      {mode === 'verify' ? <AmountFields prefix="verified" values={values} /> : null}
      <FormField name="note" label={mode === 'verify' ? 'Note (optional)' : 'What is missing'} required={mode === 'reject'}>
        <Textarea id="note" name="note" rows={2} />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
        <SubmitButton>{mode === 'verify' ? 'Verify with these amounts' : 'Send back'}</SubmitButton>
      </div>
    </ActionForm>
  )
}
