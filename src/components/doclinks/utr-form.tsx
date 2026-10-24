'use client'

import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { shareUtrAction } from '@/modules/doclinks/public-actions'

/** "I've paid": the client shares the UTR / UPI reference; the business verifies it and records the receipt. */
export function UtrForm({ token, balanceLabel }: { token: string; balanceLabel: string }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  if (done) return <p className="text-sm text-white/80">Thanks. The team will confirm once the payment shows in their bank.</p>
  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        I&apos;ve paid
      </Button>
    )
  }
  return (
    <ActionForm action={shareUtrAction} className="space-y-4" onDone={() => setDone(true)} noRefresh>
      <input type="hidden" name="token" value={token} />
      <FormField name="utr" label="UTR or UPI reference" required help="12 digits for UPI, up to 22 characters for a bank transfer.">
        <Input id="utr" name="utr" inputMode="text" autoComplete="off" maxLength={40} required />
      </FormField>
      <FormField name="amount" label="Amount paid (₹)" help={`${balanceLabel} is due.`}>
        <Input id="amount" name="amount" inputMode="decimal" autoComplete="off" />
      </FormField>
      <FormField name="note" label="Note (optional)">
        <Textarea id="note" name="note" rows={2} maxLength={500} />
      </FormField>
      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingLabel="Sending…">Send to the team</SubmitButton>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </ActionForm>
  )
}
