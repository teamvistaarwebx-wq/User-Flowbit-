'use client'

import { FileText } from 'lucide-react'
import { STATE_OPTIONS } from '@/lib/india-states'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { saveBillingDetails } from '@/modules/subscription/checkout-actions'

export type BillingDefaults = {
  legalName: string
  email: string
  phone: string
  gstin: string
  address: { line1: string; line2: string; city: string; stateCode: string; pincode: string }
}

/** Who Flowbit's GST invoices are addressed to; required before the first payment. */
export function BillingDetailsForm({ defaults, saved }: { defaults: BillingDefaults; saved: boolean }) {
  return (
    <Card variant="solid" id="billing-details">
      <CardHeader
        label="Billing details"
        icon={<FileText />}
        description={saved ? 'Changes apply to future invoices only.' : 'Needed before you pay. Prefilled from your Company profile; change them here only if Flowbit should bill someone else.'}
      />
      <ActionForm action={saveBillingDetails} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FormField name="legalName" label="Name on the invoice" required>
          <Input id="legalName" name="legalName" defaultValue={defaults.legalName} maxLength={120} />
        </FormField>
        <FormField name="email" label="Billing email" required help="Invoices are emailed here.">
          <Input id="email" name="email" type="email" defaultValue={defaults.email} />
        </FormField>
        <FormField name="phone" label="Mobile" help="Optional. Prefills Razorpay.">
          <Input id="phone" name="phone" inputMode="tel" defaultValue={defaults.phone} maxLength={10} />
        </FormField>
        <FormField name="gstin" label="GSTIN" help="Add it to claim input tax credit.">
          <Input id="gstin" name="gstin" defaultValue={defaults.gstin} className="uppercase" maxLength={15} />
        </FormField>
        <FormField name="address.line1" label="Address" required className="sm:col-span-2">
          <Input id="address.line1" name="address.line1" defaultValue={defaults.address.line1} maxLength={120} />
        </FormField>
        <FormField name="address.line2" label="Address line 2" className="sm:col-span-2">
          <Input id="address.line2" name="address.line2" defaultValue={defaults.address.line2} maxLength={120} />
        </FormField>
        <FormField name="address.city" label="City" required>
          <Input id="address.city" name="address.city" defaultValue={defaults.address.city} maxLength={60} />
        </FormField>
        <FormField name="address.stateCode" label="State (place of supply)" required>
          <Select name="address.stateCode" defaultValue={defaults.address.stateCode || undefined} options={STATE_OPTIONS} placeholder="Choose a state" />
        </FormField>
        <FormField name="address.pincode" label="PIN code" required>
          <Input id="address.pincode" name="address.pincode" defaultValue={defaults.address.pincode} inputMode="numeric" maxLength={6} />
        </FormField>
        <div className="flex items-end justify-end">
          <SubmitButton>Save billing details</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  )
}
