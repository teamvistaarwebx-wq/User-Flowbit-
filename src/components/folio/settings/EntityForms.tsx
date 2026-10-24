'use client'

import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { FileUpload } from '@/components/ui/file-upload'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { saveEntityTerms, saveSeries, saveSignatory } from '@/modules/folio/settings/entity-actions'

/** Per-entity inline forms on the settings tabs: series, default terms, signatory. */

export type SeriesValues = { invoicePrefix: string; creditNotePrefix: string; receiptPrefix: string; quotePrefix: string; proformaPrefix: string; padding: number; fyFormat: 'long' | 'short' }

const FY_FORMAT_OPTIONS = [{ value: 'short', label: '26-27' }, { value: 'long', label: '2026-27' }]

export function SeriesForm({ entityId, series }: { entityId: string; series: SeriesValues }) {
  const fields: [Exclude<keyof SeriesValues, 'padding' | 'fyFormat'>, string][] = [['invoicePrefix', 'Invoices'], ['creditNotePrefix', 'Credit notes'], ['receiptPrefix', 'Receipts'], ['quotePrefix', 'Quotes'], ['proformaPrefix', 'Proformas']]
  return (
    <ActionForm action={saveSeries} className="grid gap-3 sm:grid-cols-7">
      <input type="hidden" name="entityId" value={entityId} />
      {fields.map(([key, label]) => (
        <FormField key={key} name={key} label={label}>
          <Input name={key} defaultValue={String(series[key])} maxLength={12} className="uppercase" />
        </FormField>
      ))}
      <FormField name="padding" label="Digits">
        <NativeSelect name="padding" defaultValue={String(series.padding)} options={[3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))} />
      </FormField>
      <FormField name="fyFormat" label="Year">
        <NativeSelect name="fyFormat" defaultValue={series.fyFormat} options={FY_FORMAT_OPTIONS} />
      </FormField>
      <div className="flex justify-end sm:col-span-7"><SubmitButton size="sm">Save series</SubmitButton></div>
    </ActionForm>
  )
}

export type TermsValues = { paymentTermsDays: number; gstRatePercent: number; terms: string; notes: string; isTax: boolean }

export function TermsForm({ entityId, values, taxRates }: { entityId: string; values: TermsValues; taxRates: number[] }) {
  return (
    <ActionForm action={saveEntityTerms} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="entityId" value={entityId} />
      <FormField name="paymentTermsDays" label="Payment terms (days)"><Input name="paymentTermsDays" type="number" min="0" max="365" defaultValue={values.paymentTermsDays} /></FormField>
      {values.isTax ? (
        <FormField name="gstRatePercent" label="Default GST %">
          <NativeSelect name="gstRatePercent" defaultValue={String(values.gstRatePercent)} options={taxRates.map((r) => ({ value: String(r), label: `${r}%` }))} />
        </FormField>
      ) : (
        <input type="hidden" name="gstRatePercent" value="0" />
      )}
      <FormField name="terms" label="Default terms" className="sm:col-span-2"><Textarea name="terms" rows={3} defaultValue={values.terms} maxLength={2000} /></FormField>
      <FormField name="notes" label="Default notes" className="sm:col-span-2"><Textarea name="notes" rows={2} defaultValue={values.notes} maxLength={2000} /></FormField>
      <div className="flex justify-end sm:col-span-2"><SubmitButton size="sm">Save defaults</SubmitButton></div>
    </ActionForm>
  )
}

/** The company profile's default signatory, printed while the entity names none. */
export type SignatoryFallback = { name: string; designation: string } | null

export function SignatoryForm({ entityId, name, title, hasSignature, company }: { entityId: string; name: string; title: string; hasSignature: boolean; company?: SignatoryFallback }) {
  const inherits = !name && Boolean(company)
  return (
    <ActionForm action={saveSignatory} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="entityId" value={entityId} />
      <FormField name="signatoryName" label="Signatory name (override)" help={inherits ? 'Using company profile: its default signatory signs, with their signature and seal' : undefined}><Input name="signatoryName" defaultValue={name} maxLength={120} placeholder={company?.name || undefined} /></FormField>
      <FormField name="signatoryTitle" label="Title" help={inherits ? 'Using company profile' : 'Printed under the name; default Authorised Signatory'}><Input name="signatoryTitle" defaultValue={title} maxLength={120} placeholder={(inherits && company?.designation) || 'Authorised Signatory'} /></FormField>
      <FormField name="signature" label="Signature image" className="sm:col-span-2" help="PNG or JPEG up to 2 MB, on a white or clear background">
        <FileUpload name="signature" accept="image/png,image/jpeg" maxMb={2} hint={hasSignature ? 'A signature is set. Upload to replace it.' : 'Optional'} />
      </FormField>
      {hasSignature ? <Checkbox name="removeSignature" label="Remove the current signature" className="sm:col-span-2" /> : null}
      <div className="flex justify-end sm:col-span-2"><SubmitButton size="sm">Save signatory</SubmitButton></div>
    </ActionForm>
  )
}
