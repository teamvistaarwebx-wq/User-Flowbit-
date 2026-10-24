'use client'

import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, NativeSelect } from '@/components/ui/input'
import { saveEinvoiceSettings } from '@/modules/folio/einvoice/actions'

type Values = { enabled: boolean; turnoverAboveThreshold: boolean; environment: 'sandbox' | 'production'; baseUrl: string; clientId: string; username: string; secretHint: string; passwordHint: string }

/** One GST entity's e-invoice switch, turnover flag and GSP login. Secrets are write-only. */
export function EinvoiceSettingsForm({ entityId, values }: { entityId: string; values: Values }) {
  return (
    <ActionForm action={saveEinvoiceSettings} className="space-y-4">
      <input type="hidden" name="entityId" value={entityId} />
      <div className="flex flex-col gap-2">
        <Checkbox name="turnoverAboveThreshold" defaultChecked={values.turnoverAboveThreshold} label="Aggregate turnover is above ₹5 crore" description="E-invoicing is mandatory above this. Below it, leave e-invoicing off." />
        <Checkbox name="enabled" defaultChecked={values.enabled} label="Generate IRNs for B2B tax invoices" description="Adds Generate IRN and e-way bill buttons to issued invoices with a client GSTIN." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="environment" label="Environment">
          <NativeSelect id="environment" name="environment" options={[{ value: 'sandbox', label: 'Sandbox (testing)' }, { value: 'production', label: 'Production' }]} defaultValue={values.environment} />
        </FormField>
        <FormField name="baseUrl" label="GSP API address" help="The https:// base your GSP gave you. Blank uses NIC's address for the environment.">
          <Input id="baseUrl" name="baseUrl" defaultValue={values.baseUrl} placeholder="https://api.yourgsp.com" />
        </FormField>
        <FormField name="clientId" label="Client ID"><Input id="clientId" name="clientId" defaultValue={values.clientId} autoComplete="off" /></FormField>
        <FormField name="clientSecret" label="Client secret" help={values.secretHint ? 'Saved. Leave blank to keep it.' : undefined}>
          <Input id="clientSecret" name="clientSecret" type="password" autoComplete="new-password" />
        </FormField>
        <FormField name="username" label="API username"><Input id="username" name="username" defaultValue={values.username} autoComplete="off" /></FormField>
        <FormField name="password" label="API password" help={values.passwordHint ? 'Saved. Leave blank to keep it.' : undefined}>
          <Input id="password" name="password" type="password" autoComplete="new-password" />
        </FormField>
      </div>
      <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
    </ActionForm>
  )
}
