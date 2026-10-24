'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, CircleSlash, Undo2 } from 'lucide-react'
import { formatINR, paiseToRupees } from '@/lib/money'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { allocateReceiptAction, bounceReceiptAction, cancelReceiptAction, unallocateReceiptAction } from '@/modules/folio/receipts/actions'

/** Mark bounced (date + reason) and Cancel receipt (reason), each behind a confirmation. */
export function ReceiptActions({ receiptId, today }: { receiptId: string; today: string }) {
  const router = useRouter()
  const [bouncing, setBouncing] = useState(false)
  return (
    <>
      <Dialog
        open={bouncing}
        onOpenChange={setBouncing}
        title="Mark this payment bounced?"
        description="Every invoice it settled becomes owed again and returns to the collections list. Nothing is deleted — the record stands, marked bounced."
        trigger={<Button variant="danger" icon={<Ban className="size-4" />}>Mark bounced</Button>}
      >
        <ActionForm action={bounceReceiptAction} onDone={() => setBouncing(false)} className="space-y-4">
          <input type="hidden" name="receiptId" value={receiptId} />
          <FormField name="bouncedOn" label="Bounced on" required>
            <DateInput id="bouncedOn" name="bouncedOn" defaultValue={today} max={today} />
          </FormField>
          <FormField name="reason" label="Reason" required>
            <Input id="reason" name="reason" placeholder="Insufficient funds" />
          </FormField>
          <div className="flex justify-end"><SubmitButton variant="danger" pendingLabel="Marking…">Mark bounced</SubmitButton></div>
        </ActionForm>
      </Dialog>
      <ConfirmDialog
        trigger={<Button variant="ghost" icon={<CircleSlash className="size-4" />}>Cancel receipt</Button>}
        title="Cancel this receipt?"
        description="For a payment entered by mistake. Every invoice it settled becomes owed again. The number stays on the record; record the payment again if the details were wrong."
        confirmLabel="Cancel receipt"
        reason={{ label: 'Reason', placeholder: 'Entered twice by mistake', required: true }}
        onConfirm={async (reason) => {
          const res = await cancelReceiptAction({ receiptId, reason: reason ?? '' })
          if (res.ok) router.refresh()
          return res
        }}
      />
    </>
  )
}

/** Release one allocation row back to unapplied credit. */
export function ReleaseButton({ receiptId, allocationId, invoiceNumber }: { receiptId: string; allocationId: string; invoiceNumber: string }) {
  const router = useRouter()
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />}>Release</Button>}
      title={`Release from ${invoiceNumber}?`}
      description={`${invoiceNumber} becomes owed again, and this money returns to unapplied credit. The payment itself is untouched.`}
      confirmLabel="Release"
      tone="primary"
      onConfirm={async () => {
        const res = await unallocateReceiptAction({ receiptId, allocationId })
        if (res.ok) router.refresh()
        return res
      }}
    />
  )
}

type ApplyOption = { invoiceId: string; number: string; dueDate: string; owedPaise: number; tdsLeftPaise: number }

/** "Apply the remaining ₹X": pick one open invoice of the same client and entity, amount prefilled. */
export function ApplyPanel({ receiptId, unappliedPaise, options, today, showTds }: { receiptId: string; unappliedPaise: number; options: ApplyOption[]; today: string; showTds: boolean }) {
  const [invoiceId, setInvoiceId] = useState(options[0]?.invoiceId ?? '')
  const chosen = options.find((o) => o.invoiceId === invoiceId)
  const prefill = chosen ? Math.min(chosen.owedPaise, unappliedPaise) : 0
  if (!options.length) return <p className="text-[13px] text-fg-2">This client has nothing outstanding. The credit waits here until they do.</p>
  return (
    <ActionForm action={allocateReceiptAction} className="space-y-4">
      <input type="hidden" name="receiptId" value={receiptId} />
      <FormField name="invoiceId" label="Invoice" required>
        <Select
          name="invoiceId"
          value={invoiceId || undefined}
          onValueChange={setInvoiceId}
          options={options.map((o) => ({ value: o.invoiceId, label: o.number, hint: `${formatINR(o.owedPaise)} owed${o.dueDate < today ? ' · overdue' : ''}` }))}
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="amount" label="Amount (₹)" required>
          <Input key={`a-${invoiceId}`} id="amount" name="amount" inputMode="decimal" defaultValue={prefill ? String(paiseToRupees(prefill)) : ''} />
        </FormField>
        {showTds ? (
          <FormField name="tds" label="TDS (₹)" help={chosen?.tdsLeftPaise ? `${formatINR(chosen.tdsLeftPaise)} TDS expected` : undefined}>
            <Input key={`t-${invoiceId}`} id="tds" name="tds" inputMode="decimal" />
          </FormField>
        ) : null}
      </div>
      <SubmitButton className="w-full" pendingLabel="Applying…">Apply</SubmitButton>
    </ActionForm>
  )
}
