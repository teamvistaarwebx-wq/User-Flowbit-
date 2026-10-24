'use client'

import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { formatDate } from '@/lib/dates'
import { firstBillingDate, servicePeriodFor, type RetainerFrequency } from '@/modules/folio/engine/numbering'
import { saveRetainer } from '@/modules/folio/recurring/actions'
import { FREQUENCY_LABELS, RETAINER_FREQUENCIES } from '@/modules/folio/types'

export type RetainerValues = {
  id?: string
  clientId: string
  entityId: string
  name: string
  description: string
  hsnSac: string
  amount: string
  gstRatePercent: string
  frequency: RetainerFrequency
  startDate: string
  endDate: string
  billingDay: string
  billInAdvance: boolean
  autoGenerate: boolean
  paymentTermsDays: string
  hoursPerMonth: string
  notes: string
}

type Option = { value: string; label: string }

/** Create or edit a retainer. The hint shows the service period the first draft will cover. */
export function RetainerDialog({ trigger, values, clients, entities, taxRates }: { trigger: ReactNode; values: RetainerValues; clients: Option[]; entities: (Option & { kind: string })[]; taxRates: number[] }) {
  const [open, setOpen] = useState(false)
  const [entityId, setEntityId] = useState(values.entityId)
  const [frequency, setFrequency] = useState<RetainerFrequency>(values.frequency)
  const [startDate, setStartDate] = useState(values.startDate)
  const [billingDay, setBillingDay] = useState(values.billingDay)
  const [inAdvance, setInAdvance] = useState(values.billInAdvance)
  // The schedule fields are controlled, so reset them on every open: a new retainer must not inherit the last one's.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setEntityId(values.entityId)
      setFrequency(values.frequency)
      setStartDate(values.startDate)
      setBillingDay(values.billingDay)
      setInAdvance(values.billInAdvance)
    }
    setOpen(next)
  }
  const isTax = entities.find((e) => e.value === entityId)?.kind === 'gst'
  const day = Math.min(31, Math.max(1, Number(billingDay) || 1))
  const first = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? firstBillingDate(startDate, frequency, day) : null
  const period = first ? servicePeriodFor(first, frequency, day, inAdvance) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title={values.id ? 'Edit retainer' : 'New retainer'} description="Bills the same amount every period as a draft for you to review." trigger={trigger}>
      <ActionForm action={saveRetainer} onDone={() => setOpen(false)} className="grid gap-4 sm:grid-cols-2">
        {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
        <FormField name="clientId" label="Client" required>
          <NativeSelect id="clientId" name="clientId" defaultValue={values.clientId} placeholder="Choose a client" options={clients} />
        </FormField>
        <FormField name="entityId" label="Billing from" required>
          <NativeSelect id="entityId" name="entityId" value={entityId} onChange={(e) => setEntityId(e.target.value)} options={entities} />
        </FormField>
        <FormField name="name" label="Name" required className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={values.name} placeholder="Growth retainer" maxLength={120} />
        </FormField>
        <FormField name="description" label="Line description" help="Printed on each invoice; the name is used when blank." className="sm:col-span-2">
          <Textarea id="description" name="description" rows={2} defaultValue={values.description} maxLength={500} />
        </FormField>
        <FormField name="amount" label="Amount per period (₹)" required>
          <Input id="amount" name="amount" inputMode="decimal" defaultValue={values.amount} placeholder="75000" />
        </FormField>
        {isTax ? (
          <FormField name="gstRatePercent" label="GST %">
            <NativeSelect id="gstRatePercent" name="gstRatePercent" defaultValue={values.gstRatePercent} options={taxRates.map((r) => ({ value: String(r), label: `${r}%` }))} />
          </FormField>
        ) : (
          <input type="hidden" name="gstRatePercent" value="0" />
        )}
        <FormField name="hsnSac" label="SAC">
          <Input id="hsnSac" name="hsnSac" defaultValue={values.hsnSac} inputMode="numeric" maxLength={8} placeholder="998365" />
        </FormField>
        <FormField name="frequency" label="Every">
          <NativeSelect id="frequency" name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as RetainerFrequency)} options={RETAINER_FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))} />
        </FormField>
        <FormField name="startDate" label="Starts" required>
          <DateInput id="startDate" name="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField name="endDate" label="Ends" help="Blank runs until you end it">
          <DateInput id="endDate" name="endDate" defaultValue={values.endDate} />
        </FormField>
        <FormField name="billingDay" label="Billing day" help="1–31. A 31 bills on the 30th in April.">
          <Input id="billingDay" name="billingDay" type="number" min="1" max="31" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} />
        </FormField>
        <FormField name="paymentTermsDays" label="Payment terms (days)" help="Blank uses the client's, then the firm's">
          <Input id="paymentTermsDays" name="paymentTermsDays" type="number" min="0" max="365" defaultValue={values.paymentTermsDays} />
        </FormField>
        <FormField name="hoursPerMonth" label="Hours a month" help="Optional. The Clients page compares logged time with it.">
          <Input id="hoursPerMonth" name="hoursPerMonth" type="number" min="0" max="10000" step="0.5" defaultValue={values.hoursPerMonth} />
        </FormField>
        <div className="space-y-3 sm:col-span-2">
          <Switch name="billInAdvance" checked={inAdvance} onCheckedChange={setInAdvance} label="Bill in advance" description={period ? `First draft on ${formatDate(first)} covers ${formatDate(period.start)} to ${formatDate(period.end)}. A partial first period is not prorated.` : 'Pick a start date to see the first period.'} />
          <Switch name="autoGenerate" defaultChecked={values.autoGenerate} label="Create drafts automatically" description="The daily run drafts due periods; nothing is issued without you." />
        </div>
        <FormField name="notes" label="Internal notes" className="sm:col-span-2">
          <Textarea id="notes" name="notes" rows={2} defaultValue={values.notes} maxLength={2000} />
        </FormField>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton>{values.id ? 'Save retainer' : 'Add retainer'}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
