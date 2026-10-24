'use client'

import { useState } from 'react'
import { CalendarClock, RotateCcw } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, NativeSelect } from '@/components/ui/input'
import { STATE_OPTIONS } from '@/lib/india-states'
import { overrideDueDateAction, removeOverrideAction, saveComplianceSettingsAction } from '@/modules/compliance/actions'
import { COMPLIANCE_ITEMS, ITEM_LABELS, type ComplianceItem } from '@/modules/compliance/rules'

export function ComplianceSettingsForm({ filerType, state, items, ptDay, ptDefault, canEdit }: { filerType: string; state: string; items: readonly ComplianceItem[]; ptDay: number | null; ptDefault: number | null; canEdit: boolean }) {
  return (
    <ActionForm action={saveComplianceSettingsAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField name="filerType" label="GST returns">
          <NativeSelect id="filerType" name="filerType" defaultValue={filerType} options={[{ value: 'monthly', label: 'Monthly filer' }, { value: 'qrmp', label: 'Quarterly (QRMP)' }]} disabled={!canEdit} />
        </FormField>
        <FormField name="state" label="State" help="QRMP GSTR-3B and professional tax follow it">
          <NativeSelect id="state" name="state" defaultValue={state} placeholder="Pick a state" options={STATE_OPTIONS} disabled={!canEdit} />
        </FormField>
        <FormField name="ptDay" label="Professional tax: day of next month" help={ptDefault ? `Blank uses ${ptDefault}, the usual day in your state. 0 turns it off.` : 'Blank or 0: not tracked. Check your state’s rule.'}>
          <Input id="ptDay" name="ptDay" inputMode="numeric" defaultValue={ptDay ?? ''} disabled={!canEdit} />
        </FormField>
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-sm text-fg">What applies to you</legend>
        {COMPLIANCE_ITEMS.map((item) => (
          <Checkbox key={item} name="items" value={item} defaultChecked={items.includes(item)} label={ITEM_LABELS[item]} disabled={!canEdit} />
        ))}
      </fieldset>
      <SubmitButton pendingLabel="Saving…" disabled={!canEdit}>Save</SubmitButton>
    </ActionForm>
  )
}

/** "Extended?": move one occurrence to the new date, with a note; or put it back. */
export function OverrideControl({ item, period, dueDate, extended, canEdit }: { item: ComplianceItem; period: string; dueDate: string; extended: boolean; canEdit: boolean }) {
  const [open, setOpen] = useState(false)
  const [reset, resetting] = useAction(removeOverrideAction)
  if (!canEdit) return null
  if (extended && !open) return <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} loading={resetting} onClick={() => void reset({ item, period })}>Standard date</Button>
  if (!open) return <Button size="sm" variant="ghost" icon={<CalendarClock className="size-3.5" />} onClick={() => setOpen(true)}>Extended?</Button>
  return (
    <ActionForm action={overrideDueDateAction} onDone={() => setOpen(false)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="item" value={item} />
      <input type="hidden" name="period" value={period} />
      <FormField name="dueDate" label="New date"><Input id={`d-${item}-${period}`} name="dueDate" type="date" defaultValue={dueDate} /></FormField>
      <FormField name="note" label="Notification (optional)"><Input id={`n-${item}-${period}`} name="note" maxLength={200} placeholder="CBIC notification 12/2026" /></FormField>
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </ActionForm>
  )
}
