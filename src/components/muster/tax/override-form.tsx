'use client'

import { useState } from 'react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { clearTdsOverride, setTdsOverride } from '@/modules/muster/tax/actions'

/** Replace this month's computed TDS with Finance's own figure (reason required), or go back to the computed one. */
export function TdsOverrideControls({ cycleId, employeeId, overridden }: { cycleId: string; employeeId: string; overridden: boolean }) {
  const [open, setOpen] = useState(false)
  const [clear, clearing] = useAction(clearTdsOverride)
  if (!open) {
    return (
      <span className="inline-flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Override TDS</Button>
        {overridden ? <Button size="sm" variant="ghost" loading={clearing} onClick={() => clear({ id: cycleId, employeeId })}>Use computed</Button> : null}
      </span>
    )
  }
  return (
    <ActionForm action={setTdsOverride} onDone={() => setOpen(false)} className="grid gap-3 lit-edge rounded-[10px] bg-white/[0.035] p-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={cycleId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <FormField name="amount" label="TDS this month (₹)" required><Input id="amount" name="amount" inputMode="decimal" autoFocus /></FormField>
      <FormField name="reason" label="Reason" required><Textarea id="reason" name="reason" rows={1} placeholder="Employee asked for a higher deduction" /></FormField>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <SubmitButton>Set TDS</SubmitButton>
      </div>
    </ActionForm>
  )
}
