'use client'

import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { FileUpload } from '@/components/ui/file-upload'
import { Input, NativeSelect } from '@/components/ui/input'
import { RadioCards } from '@/components/ui/radio-cards'
import { Switch } from '@/components/ui/switch'
import { isValidGstin, stateCodeOfGstin } from '@/modules/folio/engine/gst'
import { GST_STATE_OPTIONS } from '@/modules/folio/engine/states'
import { saveEntity } from '@/modules/folio/settings/entity-actions'
import { INSET } from '../ui'

export type EntityValues = {
  id?: string
  code: string
  legalName: string
  tradeName: string
  kind: 'gst' | 'non_gst'
  gstin: string
  pan: string
  cinLlpin: string
  address: { line1: string; line2: string; city: string; stateCode: string; pincode: string }
  email: string
  phone: string
  website: string
  hasLogo: boolean
  isDefault: boolean
  isActive: boolean
}

/** What a blank logo, email, phone or website falls back to (Settings → Company profile). */
export type CompanyFallback = { email: string; phone: string; website: string; hasLogo: boolean }

const USING_PROFILE = 'Using company profile'
const inheritHelp = (own: string, fallback: string, help?: string) => (!own && fallback ? `${USING_PROFILE}${help ? `. ${help}` : ''}` : help)

/** Add or edit a billing entity. The GSTIN is checked live against the state. */
export function EntityDialog({ trigger, values, kindLocked, company }: { trigger: ReactNode; values: EntityValues; kindLocked: boolean; company?: CompanyFallback }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState(values.kind)
  const [gstin, setGstin] = useState(values.gstin)
  const [stateCode, setStateCode] = useState(values.address.stateCode)
  const g = gstin.trim().toUpperCase()
  const gstinHint = !g ? 'Required for a GST firm' : !isValidGstin(g) ? 'That is not a valid GSTIN. It should be 15 characters, like 27AABCA1234B1Z9.' : stateCode && stateCodeOfGstin(g) !== stateCode ? `Registered in state ${stateCodeOfGstin(g)}, but the address is in state ${stateCode}.` : 'Looks right.'

  return (
    <Dialog open={open} onOpenChange={setOpen} size="lg" title={values.id ? `Edit ${values.code}` : 'Add a firm'} description="A business you bill from, on the letterhead. Each firm keeps its own number series and bank accounts; a blank email, phone, website, logo or signatory uses the Company profile." trigger={trigger}>
      <ActionForm action={saveEntity} onDone={() => setOpen(false)} className="space-y-4">
        {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
        <FormField name="kind" label="Registration" help={kindLocked ? 'Locked: this firm has issued documents, so its registration cannot change.' : 'This decides Tax Invoice vs Sale Invoice and cannot change once documents exist.'}>
          {kindLocked ? <input type="hidden" name="kind" value={kind} /> : null}
          <RadioCards
            name={kindLocked ? undefined : 'kind'}
            value={kind}
            onValueChange={(v) => !kindLocked && setKind(v as EntityValues['kind'])}
            columns={2}
            options={[
              { value: 'gst', title: 'GST registered', description: 'Issues tax invoices with CGST/SGST or IGST', disabled: kindLocked && kind !== 'gst' },
              { value: 'non_gst', title: 'Not registered', description: 'Issues sale invoices with no tax', disabled: kindLocked && kind !== 'non_gst' },
            ]}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField name="code" label="Code" required help="2–10 letters, e.g. VWX">
            <Input id="code" name="code" defaultValue={values.code} maxLength={10} className="uppercase" />
          </FormField>
          <FormField name="legalName" label="Legal name" required className="sm:col-span-2">
            <Input id="legalName" name="legalName" defaultValue={values.legalName} maxLength={160} />
          </FormField>
          <FormField name="tradeName" label="Trade name" className="sm:col-span-3" help="The brand, if different from the legal name">
            <Input id="tradeName" name="tradeName" defaultValue={values.tradeName} maxLength={160} />
          </FormField>
          {kind === 'gst' ? (
            <FormField name="gstin" label="GSTIN" required help={gstinHint}>
              <Input id="gstin" name="gstin" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15} />
            </FormField>
          ) : null}
          <FormField name="pan" label="PAN">
            <Input id="pan" name="pan" defaultValue={values.pan} maxLength={10} className="uppercase" />
          </FormField>
          <FormField name="cinLlpin" label="CIN / LLPIN">
            <Input id="cinLlpin" name="cinLlpin" defaultValue={values.cinLlpin} maxLength={30} />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="address.line1" label="Address line 1" required className="sm:col-span-2"><Input name="address.line1" defaultValue={values.address.line1} /></FormField>
          <FormField name="address.line2" label="Address line 2" className="sm:col-span-2"><Input name="address.line2" defaultValue={values.address.line2} /></FormField>
          <FormField name="address.city" label="City" required><Input name="address.city" defaultValue={values.address.city} /></FormField>
          <FormField name="address.pincode" label="PIN" required><Input name="address.pincode" defaultValue={values.address.pincode} inputMode="numeric" maxLength={6} /></FormField>
          <FormField name="address.stateCode" label="State" required className="sm:col-span-2">
            <NativeSelect name="address.stateCode" value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="Choose a state" options={GST_STATE_OPTIONS} />
          </FormField>
          <FormField name="email" label="Email" help={inheritHelp(values.email, company?.email ?? '', 'Reply-to on reminders')}><Input name="email" type="email" defaultValue={values.email} placeholder={company?.email || undefined} /></FormField>
          <FormField name="phone" label="Phone" help={inheritHelp(values.phone, company?.phone ?? '')}><Input name="phone" defaultValue={values.phone} placeholder={company?.phone || undefined} /></FormField>
          <FormField name="website" label="Website" className="sm:col-span-2" help={inheritHelp(values.website, company?.website ?? '')}><Input name="website" defaultValue={values.website} placeholder={company?.website || undefined} /></FormField>
          <FormField name="logo" label="Logo" className="sm:col-span-2" help={!values.hasLogo && company?.hasLogo ? `${USING_PROFILE}: its logo prints until you upload one here` : 'PNG or JPEG, printed on the letterhead'}>
            <FileUpload name="logo" accept="image/png,image/jpeg" maxMb={2} hint={values.hasLogo ? 'A logo is set. Upload to replace it.' : 'PNG or JPEG up to 2 MB'} />
          </FormField>
          {values.hasLogo ? <Checkbox name="removeLogo" label="Remove the current logo" className="sm:col-span-2" /> : null}
        </div>
        <div className={`space-y-3 p-4 ${INSET}`}>
          <Switch name="isDefault" defaultChecked={values.isDefault} label="Default firm" description="Builders preselect it when a client has no default of its own" />
          {values.id ? <Switch name="isActive" defaultChecked={values.isActive} label="Active" description="Inactive firms are hidden from builders" /> : <input type="hidden" name="isActive" value="true" />}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton>{values.id ? 'Save firm' : 'Add firm'}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
