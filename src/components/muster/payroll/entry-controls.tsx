'use client'

import { Ban, CirclePause, CirclePlay, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { addPayrollAdjustment, releasePayrollHold, setPayrollHold, voidPayrollAdjustment } from '@/modules/muster/payroll/entry-actions'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'

/** Hold, exclude or release one person's pay for the month (reason kept in the audit log). */
export function HoldControls({ cycleId, employeeId, name, status }: { cycleId: string; employeeId: string; name: string; status: string }) {
  const [release, releasing] = useAction(releasePayrollHold)
  if (status !== 'ready') {
    return (
      <Button size="sm" variant="ghost" icon={<CirclePlay className="size-3.5" />} loading={releasing} onClick={() => release({ id: cycleId, employeeId })}>
        Release
      </Button>
    )
  }
  return (
    <span className="inline-flex gap-1">
      <ConfirmDialog
        trigger={<IconButton label={`Hold ${name}'s pay`} size="sm"><CirclePause className="size-3.5" /></IconButton>}
        title={`Hold ${name}'s pay?`}
        description="The entry stays in the register but is not paid, nor its payslip published, until you release it."
        confirmLabel="Hold pay"
        tone="primary"
        reason={{ label: 'Reason', required: true, placeholder: 'Bank details being verified' }}
        onConfirm={(reason) => setPayrollHold({ id: cycleId, employeeId, kind: 'hold', reason: reason ?? '' })}
      />
      <ConfirmDialog
        trigger={<IconButton label={`Exclude ${name}`} size="sm"><Ban className="size-3.5" /></IconButton>}
        title={`Exclude ${name} from this month?`}
        description="They are left out of payroll for this month. Regenerate to drop them from the register."
        confirmLabel="Exclude"
        reason={{ label: 'Reason', required: true, placeholder: 'Paid through full and final settlement' }}
        onConfirm={(reason) => setPayrollHold({ id: cycleId, employeeId, kind: 'exclude', reason: reason ?? '' })}
      />
    </span>
  )
}

/** One-time earning or deduction for this person and month; applied at the next regeneration. */
export function AdjustmentForm({ cycleId, employeeId }: { cycleId: string; employeeId: string }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setOpen(true)}>
        Add adjustment
      </Button>
    )
  }
  return (
    <ActionForm action={addPayrollAdjustment} onDone={() => setOpen(false)} resetOnSuccess className="grid gap-3 lit-edge rounded-[10px] bg-white/[0.035] p-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={cycleId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <FormField name="label" label="Label" required>
        <Input id="label" name="label" placeholder="Diwali bonus" autoFocus />
      </FormField>
      <FormField name="lineType" label="Type" required>
        <NativeSelect id="lineType" name="lineType" options={[{ value: 'earning', label: 'Earning (adds to pay)' }, { value: 'deduction', label: 'Deduction (recovers)' }]} defaultValue="earning" />
      </FormField>
      <FormField name="amount" label="Amount (₹)" required>
        <Input id="amount" name="amount" inputMode="decimal" placeholder="5000" />
      </FormField>
      <FormField name="reason" label="Reason" required>
        <Textarea id="reason" name="reason" rows={1} placeholder="Festival bonus approved by the founder" />
      </FormField>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <SubmitButton>Add adjustment</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function VoidAdjustment({ cycleId, adjustmentId, label }: { cycleId: string; adjustmentId: string; label: string }) {
  return (
    <ConfirmDialog
      trigger={<IconButton label={`Remove ${label}`} size="sm"><Trash2 className="size-3.5" /></IconButton>}
      title={`Remove ${label}?`}
      description="It is kept on record as removed. Regenerate payroll to apply the change."
      confirmLabel="Remove"
      reason={{ label: 'Reason', required: true }}
      onConfirm={(reason) => voidPayrollAdjustment({ id: cycleId, adjustmentId, reason: reason ?? '' })}
    />
  )
}
