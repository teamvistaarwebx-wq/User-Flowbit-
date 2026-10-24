'use client'

import { UserPlus } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ContactDialog } from '@/components/clients/contact-dialog'
import { updateDeal } from '@/modules/orbit/deals.actions'
import type { Option, OrbitChoices } from '@/modules/orbit/record-types'

export type DealDetailsValues = {
  id: string
  title: string
  valuePaise: number
  probability: number
  expectedCloseDate: string | null
  contactId: string | null
  source: string | null
  sector: string | null
  ownerId: string
  ownerName: string
  notes: string
  clientId: string | null
  open: boolean
}

const withCurrent = (opts: Option[], value: string | null, label: string) => (!value || opts.some((o) => o.value === value) ? opts : [{ value, label }, ...opts])

/** Inline deal details editor. */
export function DealDetailsForm({ values: v, contacts, choices, canEdit, canAssign, canAddContact }: { values: DealDetailsValues; contacts: Option[]; choices: Pick<OrbitChoices, 'sources' | 'sectors' | 'owners'>; canEdit: boolean; canAssign: boolean; canAddContact: boolean }) {
  return (
    <div className="relative">
    <ActionForm action={updateDeal} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={v.id} />
      <fieldset disabled={!canEdit} className="contents">
        <FormField name="title" label="Title" required className="sm:col-span-2"><Input id="dd-title" name="title" defaultValue={v.title} maxLength={140} /></FormField>
        <FormField name="valueRupees" label="Value (₹)" required><Input id="dd-value" name="valueRupees" inputMode="decimal" defaultValue={String(v.valuePaise / 100)} /></FormField>
        <FormField name="probability" label="Probability (%)" help={v.open ? undefined : 'Fixed once closed'}><Input id="dd-prob" name="probability" inputMode="numeric" defaultValue={String(v.probability)} disabled={!v.open} /></FormField>
        <FormField name="expectedCloseDate" label="Expected close"><DateInput id="dd-close" name="expectedCloseDate" defaultValue={v.expectedCloseDate ?? ''} /></FormField>
        <FormField name="contactId" label="Contact">
          <Select id="dd-contact" name="contactId" defaultValue={v.contactId ?? undefined} options={contacts} placeholder={contacts.length ? 'Pick a contact' : 'No contacts yet'} disabled={!canEdit || !contacts.length} />
        </FormField>
        <FormField name="source" label="Source"><Select id="dd-source" name="source" defaultValue={v.source ?? undefined} options={withCurrent(choices.sources.map((s) => ({ value: s.key, label: s.label })), v.source, v.source ?? '')} placeholder="Optional" disabled={!canEdit} /></FormField>
        <FormField name="sector" label="Sector"><Select id="dd-sector" name="sector" defaultValue={v.sector ?? undefined} options={withCurrent(choices.sectors.map((s) => ({ value: s.key, label: s.label })), v.sector, v.sector ?? '')} placeholder="Optional" disabled={!canEdit} /></FormField>
        {canAssign ? (
          <FormField name="ownerId" label="Owner" className="sm:col-span-2"><Select id="dd-owner" name="ownerId" defaultValue={v.ownerId} options={withCurrent(choices.owners, v.ownerId, v.ownerName)} /></FormField>
        ) : (
          <div className="text-sm sm:col-span-2"><p className="font-medium text-white">Owner</p><p className="mt-1 text-fg-2">{v.ownerName}</p></div>
        )}
        <FormField name="notes" label="Notes" className="sm:col-span-2"><Textarea id="dd-notes" name="notes" rows={3} defaultValue={v.notes} maxLength={2000} /></FormField>
      </fieldset>
      {canEdit ? <div className="flex justify-end sm:col-span-2"><SubmitButton size="sm">Save changes</SubmitButton></div> : null}
    </ActionForm>
    {/* Outside the form: a dialog's form would otherwise bubble its submit into this one. */}
    {/* Sits on the Save row's left (the form's last row), so it reads as part of the card, not an afterthought. */}
    {canAddContact && v.clientId ? <div className={canEdit ? 'absolute bottom-0 left-0' : 'mt-2'}><ContactDialog clientId={v.clientId} trigger={<Button size="sm" variant="ghost" className="-ml-3" icon={<UserPlus className="size-4" />}>Add contact</Button>} /></div> : null}
    </div>
  )
}
