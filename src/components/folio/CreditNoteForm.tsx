'use client'

import { useState } from 'react'
import { FileMinus } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/tabs'
import { formatINR } from '@/lib/money'
import type { SupplyType } from '@/modules/folio/engine/gst'
import { computeInvoice } from '@/modules/folio/engine/totals'
import { createCreditNoteAction } from '@/modules/folio/credit-notes/actions'
import { fitFullCredit } from '@/modules/folio/credit-notes/rules'
import { CREDIT_NOTE_REASONS, CREDIT_NOTE_REASON_LABELS } from '@/modules/folio/types'
import { Callout } from './SetupCallout'
import { TotalsPanel } from './TotalsPanel'
import { INSET } from './ui'

export type CreditableLine = { id: string; description: string; taxablePaise: number; creditedPaise: number; gstRatePercent: number }

type Props = {
  invoiceId: string
  invoiceNumber: string
  clientName: string
  documentType: string
  supplyType: SupplyType
  placeOfSupplyStateCode: string | null
  outstandingPaise: number
  lines: CreditableLine[]
  today: string
  roundOffTotal: boolean
  reverseCharge: boolean
  /** Shown when today is past the CGST Sec 34 deadline for this invoice. */
  section34Warning: string | null
}

/** Raise a credit note: in full, or by line, priced by the same engine as invoices. */
export function CreditNoteForm(p: Props) {
  const [mode, setMode] = useState<'full' | 'lines'>('full')
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState(false)
  const left = (l: CreditableLine) => Math.max(0, l.taxablePaise - l.creditedPaise)
  const credits = p.lines.map((l) => ({ line: l, credit: mode === 'full' ? left(l) : Math.round((Number(amounts[l.id]) || 0) * 100) })).filter((c) => c.credit > 0)
  const computed = computeInvoice({ lines: credits.map((c) => ({ description: c.line.description, quantity: 1, rate: c.credit, gstRatePercent: c.line.gstRatePercent })), supplyType: p.supplyType, reverseCharge: p.reverseCharge, roundOffTotal: p.roundOffTotal })
  const priced = mode === 'full' ? fitFullCredit(computed, p.outstandingPaise) : computed
  const over = priced.total > p.outstandingPaise
  const overIndex = p.lines.findIndex((l) => credits.some((c) => c.line === l && c.credit > left(l)))
  const formId = 'credit-note-form'
  // The submit button sits in the confirm dialog: close it on a refusal so the field errors behind it can be seen and fixed.
  const submit = async (data: FormData) => {
    const result = await createCreditNoteAction(data)
    if (!result.ok) setConfirm(false)
    return result
  }

  return (
    <ActionForm id={formId} action={submit} className="grid grid-cols-12 gap-4">
      <input type="hidden" name="invoiceId" value={p.invoiceId} />
      <input type="hidden" name="mode" value={mode} />
      <div className="col-span-12 space-y-4 xl:col-span-8">
        {p.section34Warning ? <Callout tone="warning" title="Past the GST time limit">{p.section34Warning}</Callout> : null}
        <Card variant="solid">
          <CardHeader label="What to credit" icon={<FileMinus />} description={`Against ${p.invoiceNumber} for ${p.clientName}. ${formatINR(p.outstandingPaise)} is still outstanding on it.`} actions={<Segmented options={[{ value: 'full', label: 'Full' }, { value: 'lines', label: 'By line' }]} value={mode} onChange={setMode} />} />
          <div className="space-y-2">
            {p.lines.map((l, i) => (
              <div key={l.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${INSET}`}>
                <input type="hidden" name={`lines.${i}.invoiceLineId`} value={l.id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{l.description}</p>
                  <p className="text-xs text-fg-2">Taxable {formatINR(l.taxablePaise)} · already credited {formatINR(l.creditedPaise)} · {l.gstRatePercent}% GST</p>
                </div>
                {mode === 'lines' ? (
                  <FormField name={`lines.${i}.taxable`} className="w-40">
                    <Input name={`lines.${i}.taxable`} inputMode="decimal" type="number" step="0.01" min="0" max={left(l) / 100} placeholder={`Up to ${(left(l) / 100).toFixed(2)}`} value={amounts[l.id] ?? ''} onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: e.target.value }))} aria-label="Credit ₹" />
                  </FormField>
                ) : (
                  <span className="text-sm tabular-nums text-fg">{formatINR(left(l))}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card variant="solid" className="grid gap-4 sm:grid-cols-2">
          <FormField name="noteDate" label="Note date" required>
            <DateInput id="noteDate" name="noteDate" defaultValue={p.today} max={p.today} />
          </FormField>
          <FormField name="reason" label="Reason" required>
            <NativeSelect id="reason" name="reason" defaultValue="post_sale_discount" options={CREDIT_NOTE_REASONS.map((r) => ({ value: r, label: CREDIT_NOTE_REASON_LABELS[r] }))} />
          </FormField>
          <FormField name="reasonText" label="Reason, as printed" required className="sm:col-span-2">
            <Textarea id="reasonText" name="reasonText" rows={2} maxLength={500} placeholder="Discount agreed for the delayed launch" />
          </FormField>
        </Card>
      </div>
      <aside className="col-span-12 xl:col-span-4">
        <TotalsPanel
          className="xl:sticky xl:top-4"
          title="Credit note"
          docLabel="Credit note"
          totals={{ documentType: p.documentType, supplyType: p.supplyType, placeOfSupplyStateCode: p.placeOfSupplyStateCode, subtotalPaise: priced.subtotal, discountPaise: 0, taxablePaise: priced.taxableValue, cgstPaise: priced.cgstAmount, sgstPaise: priced.sgstAmount, igstPaise: priced.igstAmount, roundOffPaise: priced.roundOff, totalPaise: priced.total, reverseCharge: p.reverseCharge }}
          footer={
            <div className="space-y-2">
              {overIndex >= 0 ? <p className="text-xs text-[#FF6A66]">Line {overIndex + 1} has only {formatINR(left(p.lines[overIndex]))} left to credit.</p> : null}
              {over ? <p className="text-xs text-[#FF6A66]">That is more than the {formatINR(p.outstandingPaise)} outstanding. Release a payment from the invoice first if the client needs a refund.</p> : null}
              <Dialog
                open={confirm}
                onOpenChange={setConfirm}
                size="sm"
                title="Issue this credit note?"
                description={`It takes the next credit-note number and reduces what ${p.clientName} owes on ${p.invoiceNumber} by ${formatINR(priced.total)}.`}
                trigger={<Button className="w-full" variant="primary" disabled={!credits.length || over || overIndex >= 0}>Issue credit note</Button>}
                footer={
                  <>
                    <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
                    <SubmitButton form={formId} pendingLabel="Issuing…">Issue credit note</SubmitButton>
                  </>
                }
              />
            </div>
          }
        />
      </aside>
    </ActionForm>
  )
}
