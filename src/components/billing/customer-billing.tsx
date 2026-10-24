'use client'

import { useState } from 'react'
import { BadgeIndianRupee, Repeat, XCircle } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { FileUpload } from '@/components/ui/file-upload'
import { DateInput, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { startAutopay, stopAutopay, submitOfflinePayment } from '@/modules/billing/customer-actions'
import { OFFLINE_MODE_LABEL, OFFLINE_MODES } from '@/modules/billing/rules'

/** Settings → Plan & billing: offline payment submission and the autopay buttons. */

export type DueBillOption = { id: string; label: string; amountRupees: string; tdsDeclared: boolean }

export function OfflinePaymentDialog({ bills, today }: { bills: DueBillOption[]; today: string }) {
  const [open, setOpen] = useState(false)
  const [billId, setBillId] = useState(bills[0]?.id ?? '')
  const bill = bills.find((b) => b.id === billId)
  return (
    <Dialog open={open} onOpenChange={setOpen} title="I paid by bank transfer or UPI" description="Share the UTR (bank reference) and a screenshot. The workspace stays open for 7 days while Flowbit matches it with the bank statement." trigger={<Button size="sm" variant="secondary" icon={<BadgeIndianRupee className="size-4" />}>Paid offline?</Button>}>
      <ActionForm action={submitOfflinePayment} onDone={() => setOpen(false)} className="space-y-4">
        <FormField name="billId" label="Bill" required>
          <Select name="billId" options={bills.map((b) => ({ value: b.id, label: b.label }))} value={billId} onValueChange={setBillId} />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="utr" label="UTR / reference" required help="12 digits for UPI and IMPS, 16–22 characters for NEFT and RTGS">
            <Input id="utr" name="utr" autoComplete="off" maxLength={40} />
          </FormField>
          <FormField name="amount" label="Amount paid (₹)" required>
            <Input key={billId} id="amount" name="amount" inputMode="decimal" defaultValue={bill?.amountRupees ?? ''} />
          </FormField>
          <FormField name="paidOn" label="Paid on" required>
            <DateInput id="paidOn" name="paidOn" defaultValue={today} max={today} />
          </FormField>
          <FormField name="mode" label="Mode" required>
            <Select name="mode" options={OFFLINE_MODES.map((m) => ({ value: m, label: OFFLINE_MODE_LABEL[m] }))} defaultValue="upi" />
          </FormField>
        </div>
        <Checkbox key={`tds-${billId}`} name="tdsDeclared" defaultChecked={bill?.tdsDeclared} label="We deducted 2% TDS" description="Pay at least 98% and send the TDS certificate once it is filed." />
        <FormField name="screenshot" label="Payment screenshot" required>
          <FileUpload name="screenshot" accept="image/png,image/jpeg,image/webp,application/pdf" hint="PNG, JPG or PDF" />
        </FormField>
        <div className="flex justify-end"><SubmitButton pendingLabel="Sending…">Send for verification</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}

export function AutopayButtons({ state }: { state: 'off' | 'pending' | 'on' }) {
  const [start, starting] = useAction(startAutopay, { noRefresh: true, onDone: (result) => { if (result.data?.url) window.location.href = result.data.url } })
  const [stop, stopping] = useAction(stopAutopay)
  if (state === 'on') return <Button size="sm" variant="ghost" icon={<XCircle className="size-4" />} loading={stopping} onClick={() => void stop({})}>Cancel autopay</Button>
  return <Button size="sm" variant="primary" icon={<Repeat className="size-4" />} loading={starting} onClick={() => void start({})}>{state === 'pending' ? 'Approve the mandate' : 'Set up autopay'}</Button>
}
