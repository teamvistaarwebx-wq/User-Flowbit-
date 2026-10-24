'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { STATE_OPTIONS, stateOfGstin } from '@/lib/india-states'
import { CLIENT_STATUS_LABEL } from '@/lib/client-status'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ChipGroup } from '@/components/ui/chip-group'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { createClient, updateClient } from '@/modules/clients/actions'
import type { ClientValues } from '@/modules/clients/values'
import type { Option } from '@/modules/orbit/record-types'

export type ClientFormProps = { values: ClientValues; owners: Option[]; sources: Option[] | null; sectors: Option[] | null; canEdit: boolean; compact?: boolean }

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="contents">
    <legend className="section-label col-span-full mt-2">{title}</legend>
    {children}
  </fieldset>
)

/** Create or edit a client (shared by Work, Orbit and Folio). */
export function ClientForm({ values: v, owners, sources, sectors, canEdit, compact }: ClientFormProps) {
  const router = useRouter()
  const editing = Boolean(v.id)
  const [gstin, setGstin] = useState(v.gstin)
  const [state, setState] = useState(v.state)
  const onGstin = (value: string) => {
    const upper = value.toUpperCase()
    setGstin(upper)
    const fromGstin = stateOfGstin(upper)
    if (fromGstin && !state) setState(fromGstin.code2)
  }
  const cols = compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'

  return (
    <ActionForm action={editing ? updateClient : createClient} className={`grid gap-4 ${cols}`}>
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <fieldset disabled={!canEdit} className="contents">
        <FormField name="kind" label="Kind" className="col-span-full">
          <ChipGroup name="kind" defaultValue={v.kind} options={[{ value: 'company', label: 'Company' }, { value: 'individual', label: 'Individual' }]} size="sm" disabled={!canEdit} />
        </FormField>
        <FormField name="name" label="Name" required><Input id="cl-name" name="name" defaultValue={v.name} maxLength={120} placeholder="Kesar & Clay Ceramics Pvt Ltd" /></FormField>
        <FormField name="displayName" label="Display name"><Input id="cl-display" name="displayName" defaultValue={v.displayName} maxLength={120} placeholder="Kesar & Clay" /></FormField>
        <FormField name="status" label="Status">
          <Select id="cl-status" name="status" defaultValue={v.status} options={[{ value: 'active', label: 'Active' }, { value: 'lead', label: CLIENT_STATUS_LABEL.lead }, ...(editing ? [{ value: 'inactive', label: 'Inactive' }] : [])]} disabled={!canEdit} />
        </FormField>
        <FormField name="email" label="Email"><Input id="cl-email" name="email" type="email" defaultValue={v.email} /></FormField>
        <FormField name="phone" label="Phone"><Input id="cl-phone" name="phone" defaultValue={v.phone} inputMode="tel" /></FormField>
        <FormField name="website" label="Website"><Input id="cl-web" name="website" defaultValue={v.website} placeholder="kesarclay.in" /></FormField>

        <Section title="Tax">
          <FormField name="gstin" label="GSTIN" help="15 characters; fills the state"><Input id="cl-gstin" name="gstin" value={gstin} onChange={(e) => onGstin(e.target.value)} maxLength={15} className="uppercase" placeholder="23ABCDE1234F1Z5" /></FormField>
          <FormField name="pan" label="PAN"><Input id="cl-pan" name="pan" defaultValue={v.pan} maxLength={10} className="uppercase" placeholder="ABCDE1234F" /></FormField>
          <FormField name="state" label="State"><Select id="cl-state" name="state" value={state || undefined} onValueChange={setState} options={STATE_OPTIONS} placeholder="Pick a state" disabled={!canEdit} /></FormField>
        </Section>

        <Section title="Billing address">
          <FormField name="billingAddress.line1" label="Line 1"><Input id="cl-l1" name="billingAddress.line1" defaultValue={v.billingAddress.line1} /></FormField>
          <FormField name="billingAddress.line2" label="Line 2"><Input id="cl-l2" name="billingAddress.line2" defaultValue={v.billingAddress.line2} /></FormField>
          <FormField name="billingAddress.city" label="City"><Input id="cl-city" name="billingAddress.city" defaultValue={v.billingAddress.city} /></FormField>
          <FormField name="billingAddress.state" label="Address state"><Select id="cl-astate" name="billingAddress.state" defaultValue={v.billingAddress.state || undefined} options={STATE_OPTIONS} placeholder="Same as above" disabled={!canEdit} /></FormField>
          <FormField name="billingAddress.pincode" label="PIN code"><Input id="cl-pin" name="billingAddress.pincode" defaultValue={v.billingAddress.pincode} inputMode="numeric" maxLength={6} /></FormField>
          <FormField name="billingAddress.country" label="Country"><Input id="cl-country" name="billingAddress.country" defaultValue={v.billingAddress.country || 'India'} /></FormField>
        </Section>

        <Section title="Relationship">
          <FormField name="ownerId" label="Owner"><Select id="cl-owner" name="ownerId" defaultValue={v.ownerId || undefined} options={owners} placeholder="Me" disabled={!canEdit} /></FormField>
          <FormField name="source" label="Source">
            {sources ? <Select id="cl-source" name="source" defaultValue={v.source || undefined} options={sources} placeholder="Optional" disabled={!canEdit} /> : <Input id="cl-source" name="source" defaultValue={v.source} placeholder="Referral" />}
          </FormField>
          <FormField name="sector" label="Sector">
            {sectors ? <Select id="cl-sector" name="sector" defaultValue={v.sector || undefined} options={sectors} placeholder="Optional" disabled={!canEdit} /> : <Input id="cl-sector" name="sector" defaultValue={v.sector} placeholder="D2C" />}
          </FormField>
          <FormField name="tags" label="Tags" help="Comma separated" className="col-span-full"><Input id="cl-tags" name="tags" defaultValue={v.tags.join(', ')} placeholder="retainer, priority" /></FormField>
          <FormField name="notes" label="Notes" className="col-span-full"><Textarea id="cl-notes" name="notes" rows={3} defaultValue={v.notes} maxLength={2000} /></FormField>
        </Section>

        {!editing ? (
          <Section title="First contact (optional)">
            <FormField name="firstContact.name" label="Name"><Input id="fc-name" name="firstContact.name" maxLength={80} /></FormField>
            <FormField name="firstContact.role" label="Role"><Input id="fc-role" name="firstContact.role" maxLength={60} placeholder="Finance head" /></FormField>
            <FormField name="firstContact.email" label="Email"><Input id="fc-email" name="firstContact.email" type="email" /></FormField>
            <FormField name="firstContact.phone" label="Phone"><Input id="fc-phone" name="firstContact.phone" inputMode="tel" /></FormField>
          </Section>
        ) : null}
      </fieldset>
      {canEdit ? (
        <div className="col-span-full flex justify-end gap-2">
          {!editing ? <Button variant="ghost" onClick={() => router.back()}>Cancel</Button> : null}
          <SubmitButton>{editing ? 'Save changes' : 'Add client'}</SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  )
}
