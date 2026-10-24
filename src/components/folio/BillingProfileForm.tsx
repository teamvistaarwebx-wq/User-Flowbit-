'use client'

import { useState } from 'react'
import { Plus, Settings2, Trash2 } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { saveBillingProfile } from '@/modules/folio/billing-profile/actions'
import { GST_STATE_OPTIONS } from '@/modules/folio/engine/states'
import { INSET } from './ui'

export type RecipientValues = { key?: string; id: string; name: string; email: string; phone: string; whatsapp: string; receivesInvoices: boolean; receivesReminders: boolean; isPrimary: boolean }

export type ProfileFormValues = {
  clientId: string
  defaultEntityId: string
  paymentTermsDays: string
  placeOfSupplyStateCode: string
  isExportClient: boolean
  defaultGstRatePercent: string
  creditLimit: string
  tdsApplicable: boolean
  tdsSection: string
  tdsPercent: string
  remindersPaused: boolean
  recipients: RecipientValues[]
  openingBalance: string
  openingBalanceOn: string
  notes: string
}

type Props = { values: ProfileFormValues; hasProfile: boolean; entities: { value: string; label: string }[]; canOpening: boolean; openingLocked: boolean }

const blankRecipient = (): RecipientValues => ({ key: Math.random().toString(36).slice(2), id: '', name: '', email: '', phone: '', whatsapp: '', receivesInvoices: true, receivesReminders: true, isPrimary: false })

/** Edit dialog for a client's billing terms. Money fields are rupees (never paise). */
export function BillingProfileDialog({ values, hasProfile, entities, canOpening, openingLocked }: Props) {
  const [open, setOpen] = useState(false)
  const [tds, setTds] = useState(values.tdsApplicable)
  const [recipients, setRecipients] = useState<RecipientValues[]>(() => values.recipients.map((r) => ({ ...r, key: r.id })))
  const update = (i: number, patch: Partial<RecipientValues>) => setRecipients((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : patch.isPrimary ? { ...r, isPrimary: false } : r)))

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="Billing settings"
      description="How this client is billed: firm, terms, tax, recipients and opening balance."
      trigger={<Button size="sm" variant={hasProfile ? 'secondary' : 'primary'} icon={<Settings2 className="size-4" />}>{hasProfile ? 'Edit' : 'Set up billing'}</Button>}
    >
      <ActionForm action={saveBillingProfile} onDone={() => setOpen(false)} className="space-y-5">
        <input type="hidden" name="clientId" value={values.clientId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="defaultEntityId" label="Bills from">
            <NativeSelect id="defaultEntityId" name="defaultEntityId" defaultValue={values.defaultEntityId} placeholder="Workspace default" options={entities} />
          </FormField>
          <FormField name="paymentTermsDays" label="Payment terms (days)" help="Blank uses the firm default">
            <Input id="paymentTermsDays" name="paymentTermsDays" type="number" min="0" max="365" defaultValue={values.paymentTermsDays} />
          </FormField>
          <FormField name="placeOfSupplyStateCode" label="Place of supply" help="Override only when the service is delivered elsewhere">
            <NativeSelect id="placeOfSupplyStateCode" name="placeOfSupplyStateCode" defaultValue={values.placeOfSupplyStateCode} placeholder="Same as billing state" options={GST_STATE_OPTIONS} />
          </FormField>
          <FormField name="defaultGstRatePercent" label="Default GST %" help="Blank uses the firm default">
            <Input id="defaultGstRatePercent" name="defaultGstRatePercent" type="number" min="0" max="100" step="0.01" defaultValue={values.defaultGstRatePercent} />
          </FormField>
          <FormField name="creditLimit" label="Credit limit (₹)" help="Blank means no limit">
            <Input id="creditLimit" name="creditLimit" inputMode="decimal" defaultValue={values.creditLimit} placeholder="No limit" />
          </FormField>
          <div className="space-y-3 pt-6">
            <Switch name="isExportClient" defaultChecked={values.isExportClient} label="Export client" description="Builder defaults to zero-rated export" />
            <Switch name="remindersPaused" defaultChecked={values.remindersPaused} label="Pause reminders" description="The automatic run skips this client" />
          </div>
        </div>

        <div className={`p-4 ${INSET}`}>
          <Switch name="tdsApplicable" checked={tds} onCheckedChange={setTds} label="Client deducts TDS" description="Shown beside the total as expected TDS; settled through receipts, never by credit notes" />
          {tds ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormField name="tdsSection" label="Section">
                <Input id="tdsSection" name="tdsSection" defaultValue={values.tdsSection} maxLength={10} />
              </FormField>
              <FormField name="tdsPercent" label="Rate %">
                <Input id="tdsPercent" name="tdsPercent" type="number" step="0.01" min="0" max="100" defaultValue={values.tdsPercent} />
              </FormField>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Billing recipients</p>
            <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setRecipients((rs) => [...rs, blankRecipient()])}>Add recipient</Button>
          </div>
          <FormField name="recipients" help={recipients.length === 0 ? 'None yet. Invoices go to the client’s primary contact.' : undefined}>
            <span className="sr-only">Recipients</span>
          </FormField>
          {recipients.map((r, i) => (
            <div key={r.key ?? r.id} className={`p-3.5 ${INSET}`}>
              {r.id ? <input type="hidden" name={`recipients.${i}.id`} value={r.id} /> : null}
              <div className="grid gap-2 sm:grid-cols-4">
                <FormField name={`recipients.${i}.name`} label="Name"><Input name={`recipients.${i}.name`} value={r.name} onChange={(e) => update(i, { name: e.target.value })} /></FormField>
                <FormField name={`recipients.${i}.email`} label="Email"><Input name={`recipients.${i}.email`} type="email" value={r.email} onChange={(e) => update(i, { email: e.target.value })} /></FormField>
                <FormField name={`recipients.${i}.phone`} label="Phone"><Input name={`recipients.${i}.phone`} value={r.phone} onChange={(e) => update(i, { phone: e.target.value })} /></FormField>
                <FormField name={`recipients.${i}.whatsapp`} label="WhatsApp"><Input name={`recipients.${i}.whatsapp`} value={r.whatsapp} onChange={(e) => update(i, { whatsapp: e.target.value })} /></FormField>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <Checkbox name={`recipients.${i}.receivesInvoices`} label="Invoices" checked={r.receivesInvoices} onCheckedChange={(v) => update(i, { receivesInvoices: v })} />
                <Checkbox name={`recipients.${i}.receivesReminders`} label="Reminders" checked={r.receivesReminders} onCheckedChange={(v) => update(i, { receivesReminders: v })} />
                <Checkbox name={`recipients.${i}.isPrimary`} label="Primary" checked={r.isPrimary} onCheckedChange={(v) => update(i, { isPrimary: v })} />
                <IconButton label="Remove recipient" size="sm" className="ml-auto" onClick={() => setRecipients((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="size-4" /></IconButton>
              </div>
            </div>
          ))}
        </div>

        {canOpening ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="openingBalance" label="Opening balance (₹)" help={openingLocked ? 'Payments are applied to it. Release them before changing it.' : 'What they owed before Folio. A credit belongs on a receipt instead.'}>
              <Input id="openingBalance" name="openingBalance" inputMode="decimal" defaultValue={values.openingBalance} disabled={openingLocked} />
            </FormField>
            <FormField name="openingBalanceOn" label="As on">
              <DateInput id="openingBalanceOn" name="openingBalanceOn" defaultValue={values.openingBalanceOn} disabled={openingLocked} />
            </FormField>
            {openingLocked ? (
              <>
                <input type="hidden" name="openingBalance" value={values.openingBalance} />
                <input type="hidden" name="openingBalanceOn" value={values.openingBalanceOn} />
              </>
            ) : null}
          </div>
        ) : null}

        <FormField name="notes" label="Internal notes">
          <Textarea id="notes" name="notes" rows={2} defaultValue={values.notes} maxLength={2000} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton>Save billing settings</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
