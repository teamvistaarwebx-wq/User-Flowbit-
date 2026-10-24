'use client'

import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { ChipGroup } from '@/components/ui/chip-group'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { saveReminderSettings, saveTaxSettings } from '@/modules/folio/settings/actions'
import { INSET } from '../ui'

/** Workspace-level forms: tax and invoicing, reminder cadence. */

const RATE_CHOICES = [0, 0.25, 3, 5, 12, 18, 28]

export function TaxSettingsForm({ taxRates, roundOffTotal, showTdsOnInvoice, defaultValidityDays }: { taxRates: number[]; roundOffTotal: boolean; showTdsOnInvoice: boolean; defaultValidityDays: number }) {
  const choices = [...new Set([...RATE_CHOICES, ...taxRates])].sort((a, b) => a - b)
  return (
    <ActionForm action={saveTaxSettings} className="space-y-5">
      <FormField name="taxRates" label="Allowed GST rates" help="Only these rates are offered on lines. Sale invoices always charge 0.">
        <ChipGroup name="taxRates" multiple defaultValue={taxRates.map(String)} options={choices.map((r) => ({ value: String(r), label: `${r}%` }))} />
      </FormField>
      <div className={`space-y-3 p-4 ${INSET}`}>
        <Switch name="roundOffTotal" defaultChecked={roundOffTotal} label="Round totals to the rupee" description="Adds a round-off line of −₹0.49 to +₹0.50" />
        <Switch name="showTdsOnInvoice" defaultChecked={showTdsOnInvoice} label="Show expected TDS on invoices" description="Prints Less: TDS and Net payable under the total when the client deducts TDS" />
      </div>
      <FormField name="defaultValidityDays" label="Quote validity (days)" className="max-w-xs">
        <Input name="defaultValidityDays" type="number" min="1" max="365" defaultValue={defaultValidityDays} />
      </FormField>
      <div className="flex justify-end"><SubmitButton>Save tax settings</SubmitButton></div>
    </ActionForm>
  )
}

export function RemindersForm({ enabled, offsetDays, channels, autoRetainerDrafts }: { enabled: boolean; offsetDays: number[]; channels: string[]; autoRetainerDrafts: boolean }) {
  const [on, setOn] = useState(enabled)
  return (
    <ActionForm action={saveReminderSettings} className="space-y-5">
      <Switch name="enabled" checked={on} onCheckedChange={setOn} label="Send reminders automatically" description="The daily run chases open invoices on this cadence. Only balances above zero are chased." />
      <FormField name="cadence" label="Cadence (days)" help="Days relative to the due date. Negative is before. Up to 8, from -30 to 365.">
        <Input name="cadence" defaultValue={offsetDays.join(', ')} placeholder="-3, 0, 7, 15, 30" disabled={!on} />
      </FormField>
      {!on ? <input type="hidden" name="cadence" value={offsetDays.join(', ')} /> : null}
      <FormField name="channels" label="Channels" help="WhatsApp messages are queued for a person to send from Collections.">
        <ChipGroup name="channels" multiple defaultValue={channels} options={[{ value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp' }]} />
      </FormField>
      <div className={`p-4 ${INSET}`}>
        <Switch name="autoRetainerDrafts" defaultChecked={autoRetainerDrafts} label="Automatic retainer drafts" description="Master switch for the daily run that drafts due retainer invoices" />
      </div>
      <div className="flex justify-end"><SubmitButton>Save reminders</SubmitButton></div>
    </ActionForm>
  )
}
