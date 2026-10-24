'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, ListOrdered, NotebookPen, Users } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/tabs'
import type { ActionResult } from '@/lib/action-types'
import { addDays, formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { SUPPLY_TYPE_LABELS } from '@/modules/folio/engine/gst'
import { GST_STATE_OPTIONS, stateLabelOf } from '@/modules/folio/engine/states'
import type { BuilderOptions } from '@/modules/folio/invoices/builder-data'
import { priceDocument } from '@/modules/folio/invoices/pricing'
import { BILLING_TYPE_LABELS, BUILDER_BILLING_TYPES, type SupplyMode } from '@/modules/folio/types'
import { Callout } from './SetupCallout'
import { LineEditor } from './LineEditor'
import type { LineState } from './line-state'
import { TotalsPanel } from './TotalsPanel'

/**
 * The invoice and quote builder. Prices live with the same engine the server
 * runs again on save, so the preview and the stored document agree.
 */

export type BuilderInitial = {
  id?: string
  entityId: string
  clientId: string
  date: string
  paymentTermsDays: string
  validUntil: string
  kind: 'quote' | 'proforma'
  subject: string
  billingType: string
  purchaseOrderRef: string
  bankAccountId: string
  placeOfSupplyStateCode: string
  supplyMode: SupplyMode
  reverseCharge: boolean
  periodStart: string
  periodEnd: string
  lines: LineState[]
  discountType: 'none' | 'percent' | 'amount'
  discountValue: string
  notes: string
  terms: string
  internalNotes: string
  dealId?: string
  quoteId?: string
}

type Props = { mode: 'invoice' | 'quote'; options: BuilderOptions; initial: BuilderInitial; action: (input: FormData) => Promise<ActionResult<{ id: string }>> }

const num = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function InvoiceBuilder({ mode, options, initial, action }: Props) {
  const isInvoice = mode === 'invoice'
  const [entityId, setEntityId] = useState(initial.entityId)
  const [clientId, setClientId] = useState(initial.clientId)
  const [date, setDate] = useState(initial.date)
  const [terms, setTerms] = useState(initial.paymentTermsDays)
  const [validUntil, setValidUntil] = useState(initial.validUntil)
  const [kind, setKind] = useState(initial.kind)
  const [place, setPlace] = useState(initial.placeOfSupplyStateCode)
  const [supplyMode, setSupplyMode] = useState<SupplyMode>(initial.supplyMode)
  const [reverseCharge, setReverseCharge] = useState(initial.reverseCharge)
  const [lines, setLines] = useState(initial.lines)
  const [discountType, setDiscountType] = useState(initial.discountType)
  const [discountValue, setDiscountValue] = useState(initial.discountValue)
  const [notes, setNotes] = useState(initial.notes)
  const [termsText, setTermsText] = useState(initial.terms)
  const [bankAccountId, setBankAccountId] = useState(initial.bankAccountId)

  const entity = options.entities.find((e) => e.id === entityId) ?? options.entities[0]
  const client = options.clients.find((c) => c.id === clientId)
  const isTax = entity?.kind === 'gst'
  const defaultGstRate = client?.gstRatePercent ?? entity?.gstRatePercent ?? 18

  const priced = useMemo(
    () =>
      priceDocument({
        entityKind: entity?.kind ?? 'gst',
        entityStateCode: entity?.stateCode ?? null,
        clientStateCode: client?.stateCode ?? null,
        placeOfSupplyStateCode: isTax ? place || null : null,
        supplyMode: isTax ? supplyMode : 'auto',
        lines: lines.map((l) => ({ description: l.description, quantity: num(l.quantity), unit: l.unit, ratePaise: Math.round(num(l.rate) * 100), discountPercent: num(l.discountPercent), gstRatePercent: isTax ? num(l.gstRatePercent) : 0 })),
        discountType: discountType === 'none' ? null : discountType,
        discountValue: discountType === 'amount' ? Math.round(num(discountValue) * 100) : num(discountValue),
        tdsPercent: isInvoice ? (client?.tdsPercent ?? 0) : 0,
        roundOffTotal: options.roundOffTotal,
        reverseCharge: isInvoice && isTax && reverseCharge && Boolean(client?.registered),
      }),
    [entity, client, isTax, place, supplyMode, lines, discountType, discountValue, isInvoice, options.roundOffTotal, reverseCharge],
  )

  const pickEntity = (id: string) => {
    const next = options.entities.find((e) => e.id === id)
    if (!next) return
    if (!notes || notes === entity?.notes) setNotes(next.notes)
    if (!termsText || termsText === entity?.terms) setTermsText(next.terms)
    setEntityId(id)
    setBankAccountId(next.banks.find((b) => b.isDefault)?.id ?? next.banks[0]?.id ?? '')
    if (next.kind !== 'gst') setReverseCharge(false)
  }

  const pickClient = (id: string) => {
    const next = options.clients.find((c) => c.id === id)
    setClientId(id)
    if (!next) return
    if (next.defaultEntityId && options.entities.some((e) => e.id === next.defaultEntityId)) pickEntity(next.defaultEntityId)
    const nextEntity = options.entities.find((e) => e.id === (next.defaultEntityId ?? entityId)) ?? entity
    setTerms(String(next.paymentTermsDays ?? nextEntity?.paymentTermsDays ?? 15))
    setSupplyMode(next.isExport ? 'export' : 'auto')
    setPlace('')
    if (!next.registered) setReverseCharge(false)
  }

  const overLimit = client?.creditLimitPaise != null && client.outstandingPaise + priced.totalPaise > client.creditLimitPaise
  const placeHint = `${SUPPLY_TYPE_LABELS[priced.supplyType]}. Defaults to the client's; override only when the service is delivered elsewhere.`

  return (
    <ActionForm action={action} className="grid grid-cols-12 gap-4">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial.dealId ? <input type="hidden" name="dealId" value={initial.dealId} /> : null}
      {initial.quoteId ? <input type="hidden" name="quoteId" value={initial.quoteId} /> : null}
      <div className="col-span-12 space-y-4 xl:col-span-8">
        <Card variant="solid">
          <CardHeader label="Who and when" icon={<Users />} />
          <div className="grid gap-4 sm:grid-cols-2">
            {!isInvoice ? (
              <FormField name="kind" label="Document" className="sm:col-span-2">
                <input type="hidden" name="kind" value={kind} />
                <Segmented options={[{ value: 'quote', label: 'Quotation' }, { value: 'proforma', label: 'Proforma invoice' }]} value={kind} onChange={setKind} />
              </FormField>
            ) : null}
            <FormField name="entityId" label="Billing from" required help={isTax ? 'Issues a Tax Invoice with a GST breakup.' : 'Issues a Sale Invoice. No tax is charged or shown.'}>
              <NativeSelect id="entityId" name="entityId" value={entityId} onChange={(e) => pickEntity(e.target.value)} options={options.entities.map((e) => ({ value: e.id, label: `${e.code} · ${e.name}${e.kind === 'gst' ? '' : ' (non-GST)'}` }))} />
            </FormField>
            <FormField name="clientId" label="Client" required>
              <NativeSelect id="clientId" name="clientId" value={clientId} onChange={(e) => pickClient(e.target.value)} placeholder="Choose a client" options={options.clients.map((c) => ({ value: c.id, label: c.name }))} />
            </FormField>
            <FormField name={isInvoice ? 'issueDate' : 'quoteDate'} label={isInvoice ? 'Invoice date' : 'Quote date'} required>
              <DateInput id={isInvoice ? 'issueDate' : 'quoteDate'} name={isInvoice ? 'issueDate' : 'quoteDate'} value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            {isInvoice ? (
              <FormField name="paymentTermsDays" label="Payment terms (days)" help={date ? `Due ${formatDate(addDays(date, Math.max(0, Math.round(num(terms)))))}` : undefined}>
                <Input id="paymentTermsDays" name="paymentTermsDays" type="number" min="0" max="365" value={terms} onChange={(e) => setTerms(e.target.value)} />
              </FormField>
            ) : (
              <FormField name="validUntil" label="Valid until" required>
                <DateInput id="validUntil" name="validUntil" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </FormField>
            )}
            <FormField name="subject" label="Subject" className="sm:col-span-2" help="What this document is for, in one line">
              <Input id="subject" name="subject" defaultValue={initial.subject} maxLength={200} placeholder="Website revamp — phase 1" />
            </FormField>
            {isInvoice ? (
              <>
                <FormField name="billingType" label="Billing type">
                  <NativeSelect id="billingType" name="billingType" defaultValue={initial.billingType} options={BUILDER_BILLING_TYPES.map((t) => ({ value: t, label: BILLING_TYPE_LABELS[t] }))} />
                </FormField>
                <FormField name="purchaseOrderRef" label="Client PO reference">
                  <Input id="purchaseOrderRef" name="purchaseOrderRef" defaultValue={initial.purchaseOrderRef} maxLength={60} />
                </FormField>
                <FormField name="bankAccountId" label="Bank account to print" className="sm:col-span-2">
                  <NativeSelect id="bankAccountId" name="bankAccountId" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} placeholder={entity?.banks.length ? 'Firm default' : 'No bank accounts on this firm'} options={(entity?.banks ?? []).map((b) => ({ value: b.id, label: b.label }))} />
                </FormField>
              </>
            ) : null}
            {isTax ? (
              <>
                <FormField name="placeOfSupplyStateCode" label="Place of supply" help={placeHint}>
                  <NativeSelect id="placeOfSupplyStateCode" name="placeOfSupplyStateCode" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={client?.stateCode ? `Client · ${stateLabelOf(client.stateCode)}` : 'From the client'} options={GST_STATE_OPTIONS} />
                </FormField>
                <FormField name="supplyMode" label="Supply">
                  <NativeSelect id="supplyMode" name="supplyMode" value={supplyMode} onChange={(e) => setSupplyMode(e.target.value as SupplyMode)} options={[{ value: 'auto', label: 'Auto (from the states)' }, { value: 'export', label: 'Export (zero-rated)' }, { value: 'sez', label: 'SEZ (zero-rated)' }]} />
                </FormField>
                {isInvoice ? (
                  <FormField name="reverseCharge" className="sm:col-span-2" help={client?.registered ? 'The client pays the GST directly to the government.' : 'Needs a client with a GSTIN.'}>
                    <Checkbox name="reverseCharge" label="Reverse charge applies" checked={reverseCharge} onCheckedChange={setReverseCharge} disabled={!client?.registered} />
                  </FormField>
                ) : null}
              </>
            ) : null}
            {isInvoice ? (
              <>
                <FormField name="periodStart" label="Service period from">
                  <DateInput id="periodStart" name="periodStart" defaultValue={initial.periodStart} />
                </FormField>
                <FormField name="periodEnd" label="Service period to">
                  <DateInput id="periodEnd" name="periodEnd" defaultValue={initial.periodEnd} />
                </FormField>
              </>
            ) : null}
          </div>
          {overLimit && client ? (
            <Callout tone="warning" className="mt-4" title="Over the credit limit">
              {client.name} owes {formatINR(client.outstandingPaise)} already. With this document that becomes {formatINR(client.outstandingPaise + priced.totalPaise)}, above the {formatINR(client.creditLimitPaise ?? 0)} limit.
            </Callout>
          ) : null}
        </Card>

        <Card variant="solid">
          <CardHeader label="What you are billing" icon={<ListOrdered />} />
          <LineEditor lines={lines} onChange={setLines} priced={priced.lines} isTax={isTax} taxRates={options.taxRates} services={options.services} defaultGstRate={defaultGstRate} placeCode={priced.placeOfSupplyStateCode} />
        </Card>

        <Card variant="solid">
          <CardHeader label="Discount and notes" icon={<NotebookPen />} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="discountType" label="Invoice discount" help="Applied across the lines before tax, in proportion to their value.">
              <NativeSelect id="discountType" name="discountType" value={discountType} onChange={(e) => setDiscountType(e.target.value as BuilderInitial['discountType'])} options={[{ value: 'none', label: 'None' }, { value: 'percent', label: 'Percentage' }, { value: 'amount', label: 'Flat amount (₹)' }]} />
            </FormField>
            <FormField name="discountValue" label={discountType === 'amount' ? 'Discount ₹' : 'Discount %'}>
              <Input id="discountValue" name="discountValue" type="number" step="0.01" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} disabled={discountType === 'none'} />
            </FormField>
            <FormField name="notes" label="Notes on the document" className="sm:col-span-2">
              <Textarea id="notes" name="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </FormField>
            <FormField name="terms" label="Terms" className="sm:col-span-2">
              <Textarea id="terms" name="terms" rows={3} value={termsText} onChange={(e) => setTermsText(e.target.value)} maxLength={2000} />
            </FormField>
            {isInvoice ? (
              <FormField name="internalNotes" label="Internal notes" className="sm:col-span-2" help="Never printed. For whoever picks this up next.">
                <Textarea id="internalNotes" name="internalNotes" rows={2} defaultValue={initial.internalNotes} maxLength={2000} />
              </FormField>
            ) : null}
          </div>
        </Card>
      </div>

      <aside className="col-span-12 xl:col-span-4">
        <TotalsPanel
          className="xl:sticky xl:top-4"
          totals={{ ...priced, reverseCharge: isInvoice && isTax && reverseCharge && Boolean(client?.registered) }}
          docLabel={isInvoice ? undefined : kind === 'proforma' ? 'Proforma' : 'Quotation'}
          footer={
            <div className="space-y-2">
              <SubmitButton className="w-full" icon={<CalendarClock className="size-4" />}>
                {isInvoice ? (initial.id ? 'Save draft' : 'Create draft') : 'Save quote'}
              </SubmitButton>
              <p className="text-center text-xs text-fg-2">{isInvoice ? 'Saved as a draft. It gets a number only when it is issued.' : 'Quotes stay editable until they are converted to an invoice.'}</p>
            </div>
          }
        />
      </aside>
    </ActionForm>
  )
}

