'use client'

import { useState } from 'react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { cancelIrn, generateEwb, generateIrn } from '@/modules/folio/einvoice/actions'
import { CANCEL_REASON_LABEL, TRANS_MODES } from '@/modules/folio/einvoice/payload'

export type EinvoiceView = {
  irn: string
  ackNo: string
  ackDate: string
  environment: string
  cancellable: boolean
  ewb: { ewbNo: string; ewbDate: string; validTill: string } | null
} | null

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3 py-1 text-[13px]">
    <span className="text-fg-2">{label}</span>
    <span className="min-w-0 break-all text-right text-white">{value}</span>
  </div>
)

function CancelForm({ id, onDone }: { id: string; onDone: () => void }) {
  return (
    <ActionForm action={cancelIrn} onDone={onDone} className="mt-3 space-y-3">
      <input type="hidden" name="id" value={id} />
      <FormField name="reason" label="Reason">
        <NativeSelect id="reason" name="reason" options={Object.entries(CANCEL_REASON_LABEL).map(([value, label]) => ({ value, label }))} defaultValue="data_entry_mistake" />
      </FormField>
      <FormField name="remark" label="Remark"><Input id="remark" name="remark" maxLength={100} /></FormField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Keep IRN</Button>
        <SubmitButton variant="danger">Cancel IRN</SubmitButton>
      </div>
    </ActionForm>
  )
}

function EwbForm({ id, onDone }: { id: string; onDone: () => void }) {
  return (
    <ActionForm action={generateEwb} onDone={onDone} className="mt-3 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <FormField name="mode" label="Mode">
        <NativeSelect id="mode" name="mode" options={Object.keys(TRANS_MODES).map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))} defaultValue="road" />
      </FormField>
      <FormField name="distanceKm" label="Distance (km)" help="0 lets the portal work it out."><Input id="distanceKm" name="distanceKm" inputMode="numeric" defaultValue="0" /></FormField>
      <FormField name="vehicleNo" label="Vehicle number"><Input id="vehicleNo" name="vehicleNo" placeholder="MP09AB1234" /></FormField>
      <FormField name="transporterId" label="Transporter ID"><Input id="transporterId" name="transporterId" /></FormField>
      <FormField name="transDocNo" label="Transport doc no."><Input id="transDocNo" name="transDocNo" /></FormField>
      <FormField name="transDocDate" label="Transport doc date"><Input id="transDocDate" name="transDocDate" type="date" /></FormField>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <SubmitButton>Generate e-way bill</SubmitButton>
      </div>
    </ActionForm>
  )
}

/** IRN, acknowledgement and e-way bill for an issued B2B invoice, with the actions that make them. */
export function EinvoicePanel({ id, view, ineligible, canAct, canCancel }: { id: string; view: EinvoiceView; ineligible: string | null; canAct: boolean; canCancel: boolean }) {
  const [open, setOpen] = useState<'cancel' | 'ewb' | null>(null)
  const [generate, generating] = useAction(generateIrn)
  if (!view) {
    return ineligible ? <p className="text-[13px] text-fg-2">{ineligible}</p> : canAct ? <Button size="sm" loading={generating} onClick={() => generate({ id })}>Generate IRN</Button> : <p className="text-[13px] text-fg-2">No IRN yet.</p>
  }
  return (
    <div>
      <Row label="IRN" value={view.irn} />
      <Row label="Ack no." value={view.ackNo} />
      <Row label="Ack date" value={view.ackDate} />
      {view.environment === 'sandbox' ? <Row label="Environment" value="Sandbox (not valid for tax)" /> : null}
      {view.ewb ? (
        <>
          <Row label="E-way bill" value={view.ewb.ewbNo} />
          <Row label="Valid till" value={view.ewb.validTill || '—'} />
        </>
      ) : null}
      {canAct && !open ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!view.ewb ? <Button size="sm" variant="secondary" onClick={() => setOpen('ewb')}>E-way bill</Button> : null}
          {canCancel && view.cancellable && !view.ewb ? <Button size="sm" variant="ghost" onClick={() => setOpen('cancel')}>Cancel IRN</Button> : null}
        </div>
      ) : null}
      {open === 'cancel' ? <CancelForm id={id} onDone={() => setOpen(null)} /> : null}
      {open === 'ewb' ? <EwbForm id={id} onDone={() => setOpen(null)} /> : null}
    </div>
  )
}
