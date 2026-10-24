'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { gstinMatchesState, stateOfGstin, STATE_OPTIONS } from '@/lib/india-states'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RadioCards } from '@/components/ui/radio-cards'
import { Select } from '@/components/ui/select'
import { saveCompanyProfile } from '@/modules/settings/company-actions'

export type ProfileValues = {
  legalName: string
  tradeName: string
  gstRegistered: boolean
  gstin: string
  pan: string
  cinLlpin: string
  website: string
  email: string
  phone: string
  line1: string
  line2: string
  city: string
  state: string
  pincode: string
}

const GSTIN_SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/** The live hint under the GSTIN: shape first, then the state it was issued in against the address state. */
function gstinHint(gstin: string, state: string): string {
  const g = gstin.trim().toUpperCase()
  if (!g) return 'Required when GST registered. 15 characters, starting with the state code.'
  if (!GSTIN_SHAPE.test(g)) return 'That is not a valid GSTIN. It should be 15 characters, like 23AABCA1234B1Z9.'
  if (state && !gstinMatchesState(g, state)) return `This GSTIN is registered in ${stateOfGstin(g)?.name ?? 'another state'}, but the address is in ${STATE_OPTIONS.find((s) => s.value === state)?.label ?? state}.`
  return 'Looks right.'
}

/** Legal name, registration, contact details and the address: the letterhead of every PDF. */
export function CompanyProfileForm({ values }: { values: ProfileValues }) {
  const [registered, setRegistered] = useState(values.gstRegistered ? 'yes' : 'no')
  const [gstin, setGstin] = useState(values.gstin)
  const [state, setState] = useState(values.state)
  return (
    <Card variant="solid">
      <CardHeader label="Company details" icon={<Building2 />} description="Printed in the header of every PDF: payslips, letters, Form 130, receipts, statements and Folio documents without their own details." />
      <ActionForm action={saveCompanyProfile} className="grid gap-4 sm:grid-cols-2">
        <FormField name="legalName" label="Legal name" required help="As registered, e.g. Sanskaar Webx Services LLP">
          <Input id="legalName" name="legalName" defaultValue={values.legalName} maxLength={160} />
        </FormField>
        <FormField name="tradeName" label="Trade name" help="The brand, if different">
          <Input id="tradeName" name="tradeName" defaultValue={values.tradeName} maxLength={160} />
        </FormField>
        <FormField name="gstRegistered" label="GST registration" className="sm:col-span-2">
          <RadioCards
            name="gstRegistered"
            value={registered}
            onValueChange={setRegistered}
            columns={2}
            options={[
              { value: 'yes', title: 'GST registered', description: 'The GSTIN prints on every document' },
              { value: 'no', title: 'Not registered', description: 'Documents say “Not registered under GST”' },
            ]}
          />
        </FormField>
        {registered === 'yes' ? (
          <FormField name="gstin" label="GSTIN" required help={gstinHint(gstin, state)}>
            <Input id="gstin" name="gstin" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15} className="uppercase" />
          </FormField>
        ) : null}
        <FormField name="pan" label="PAN" help={registered === 'yes' ? 'Characters 3–12 of the GSTIN' : undefined}>
          <Input id="pan" name="pan" defaultValue={values.pan} maxLength={10} className="uppercase" />
        </FormField>
        <FormField name="cinLlpin" label="CIN / LLPIN" help="Optional. A company's CIN or an LLP's LLPIN">
          <Input id="cinLlpin" name="cinLlpin" defaultValue={values.cinLlpin} maxLength={21} className="uppercase" />
        </FormField>
        <FormField name="website" label="Website">
          <Input id="website" name="website" defaultValue={values.website} maxLength={200} placeholder="www.example.com" />
        </FormField>
        <FormField name="email" label="Contact email">
          <Input id="email" name="email" type="email" defaultValue={values.email} maxLength={160} />
        </FormField>
        <FormField name="phone" label="Phone">
          <Input id="phone" name="phone" defaultValue={values.phone} inputMode="tel" maxLength={20} />
        </FormField>
        <FormField name="line1" label="Address line 1" required className="sm:col-span-2">
          <Input id="line1" name="line1" defaultValue={values.line1} maxLength={120} />
        </FormField>
        <FormField name="line2" label="Address line 2" className="sm:col-span-2">
          <Input id="line2" name="line2" defaultValue={values.line2} maxLength={120} />
        </FormField>
        <FormField name="city" label="City" required>
          <Input id="city" name="city" defaultValue={values.city} maxLength={60} />
        </FormField>
        <FormField name="state" label="State" required>
          <Select id="state" name="state" value={state || undefined} onValueChange={setState} options={STATE_OPTIONS} placeholder="Choose a state" />
        </FormField>
        <FormField name="pincode" label="PIN code" required>
          <Input id="pincode" name="pincode" defaultValue={values.pincode} inputMode="numeric" maxLength={6} />
        </FormField>
        <p className="self-center text-xs text-fg-3">Country: India</p>
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton>Save company profile</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  )
}
