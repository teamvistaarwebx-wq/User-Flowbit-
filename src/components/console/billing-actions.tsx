'use client'

import { useState, type ReactNode } from 'react'
import { BadgeCheck, Ban, FilePlus2, FileMinus2, Landmark, Send, ShieldCheck, XCircle } from 'lucide-react'
import type { ActionResult } from '@/lib/action-types'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { FileUpload } from '@/components/ui/file-upload'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cancelBill, createBill, issueCreditNoteByStaff, recordOfflineByStaff, rejectOfflineByStaff, resendBill, updateTds, verifyOfflineByStaff } from '@/modules/billing/console-actions'
import { CREDIT_REASON_LABEL, CREDIT_REASONS, OFFLINE_MODE_LABEL, OFFLINE_MODES, TDS_CERT_LABEL } from '@/modules/billing/rules'

/** Console billing buttons and dialogs. The server checks every role again. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = (input: FormData) => Promise<ActionResult<any>>

function FormDialog({ label, icon, variant = 'secondary', title, description, action, hidden, submit, children }: { label: string; icon: ReactNode; variant?: ButtonProps['variant']; title: string; description?: string; action: AnyAction; hidden: Record<string, string>; submit: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} title={title} description={description} trigger={<Button size="sm" variant={variant} icon={icon}>{label}</Button>}>
      <ActionForm action={action} onDone={() => setOpen(false)} className="space-y-4">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {children}
        <div className="flex justify-end"><SubmitButton variant={variant === 'danger' ? 'danger' : 'primary'}>{submit}</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}

const ReasonField = () => (
  <FormField name="reason" label="Reason" required help="5–300 characters. Saved in the audit log.">
    <Textarea id="reason" name="reason" rows={2} maxLength={300} />
  </FormField>
)

export function CreateBillDialog({ orgId, hasPlan, defaultCycle, defaultSeats }: { orgId: string; hasPlan: boolean; defaultCycle: string; defaultSeats: number }) {
  const [plan, setPlan] = useState(hasPlan ? 'current' : 'suite')
  return (
    <FormDialog label="Create bill" icon={<FilePlus2 className="size-4" />} variant="primary" title="Bill this workspace" description="Amounts come from the price table. A workspace's first yearly bill gets the first-year discount from Settings as its own line. The bill goes out by email (PDF, link, Pay button) and WhatsApp where the owner opted in. The GST tax invoice is issued on payment." action={createBill} hidden={{ orgId }} submit="Create and send">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="plan" label="Plan">
          <Select name="plan" value={plan} onValueChange={setPlan} options={[...(hasPlan ? [{ value: 'current', label: 'Current plan' }] : []), { value: 'suite', label: 'Suite' }]} />
        </FormField>
        {plan === 'suite' ? <FormField name="seats" label="People" required><Input id="seats" name="seats" inputMode="numeric" defaultValue={String(defaultSeats)} /></FormField> : null}
        <FormField name="cycle" label="Cycle"><Select name="cycle" defaultValue={defaultCycle} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} /></FormField>
        <FormField name="dueDays" label="Due in (days)"><Input id="dueDays" name="dueDays" inputMode="numeric" defaultValue="7" /></FormField>
        <FormField name="billType" label="Document"><Select name="billType" defaultValue="bill" options={[{ value: 'bill', label: 'Bill' }, { value: 'proforma', label: 'Proforma invoice' }]} /></FormField>
      </div>
      <Checkbox name="tdsDeclared" label="Customer deducts 2% TDS" description="The payment link asks for the total less 2% of the taxable value; the certificate is tracked on the Billing page." />
    </FormDialog>
  )
}

export function RecordOfflineDialog({ billId, number, amountRupees, today, tdsDeclared }: { billId: string; number: string; amountRupees: string; today: string; tdsDeclared: boolean }) {
  return (
    <FormDialog label="Record payment" icon={<Landmark className="size-3.5" />} title={`Record a bank payment for ${number}`} description="Activation is provisional for 7 days. Someone else in Accounts must verify it against the bank statement." action={recordOfflineByStaff} hidden={{ billId }} submit="Record">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="utr" label="UTR / reference" required><Input id="utr" name="utr" autoComplete="off" /></FormField>
        <FormField name="amount" label="Amount (₹)" required><Input id="amount" name="amount" inputMode="decimal" defaultValue={amountRupees} /></FormField>
        <FormField name="paidOn" label="Paid on" required><DateInput id="paidOn" name="paidOn" defaultValue={today} max={today} /></FormField>
        <FormField name="mode" label="Mode"><Select name="mode" defaultValue="neft" options={OFFLINE_MODES.map((m) => ({ value: m, label: OFFLINE_MODE_LABEL[m] }))} /></FormField>
      </div>
      <Checkbox name="tdsDeclared" defaultChecked={tdsDeclared} label="Customer deducted 2% TDS" />
      <FormField name="screenshot" label="Screenshot or advice (optional)"><FileUpload name="screenshot" accept="image/png,image/jpeg,image/webp,application/pdf" /></FormField>
    </FormDialog>
  )
}

export function BillRowActions({ billId, number, canSend, canCancel }: { billId: string; number: string; canSend: boolean; canCancel: boolean }) {
  const [resend, sending] = useAction(resendBill)
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {canSend ? <Button size="sm" variant="ghost" icon={<Send className="size-3.5" />} loading={sending} onClick={() => void resend({ billId })}>Send again</Button> : null}
      {canCancel ? <FormDialog label="Cancel" icon={<XCircle className="size-3.5" />} variant="ghost" title={`Cancel bill ${number}?`} description="The payment link is cancelled too. A payment that still arrives is flagged for Accounts." action={cancelBill} hidden={{ billId }} submit="Cancel bill"><ReasonField /></FormDialog> : null}
    </span>
  )
}

export function VerifyButtons({ paymentId, selfRecorded }: { paymentId: string; selfRecorded: boolean }) {
  const [verify, verifying] = useAction(verifyOfflineByStaff)
  if (selfRecorded) return <span className="text-xs text-[#979797]">You recorded it: someone else verifies</span>
  return (
    <span className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="primary" icon={<BadgeCheck className="size-3.5" />} loading={verifying} onClick={() => void verify({ paymentId })}>Matches the bank statement</Button>
      <FormDialog label="Reject" icon={<Ban className="size-3.5" />} variant="ghost" title="Reject this payment?" description="Provisional access ends and the customer is told." action={rejectOfflineByStaff} hidden={{ paymentId }} submit="Reject"><ReasonField /></FormDialog>
    </span>
  )
}

export function CreditNoteDialog({ invoiceId, number, maxRupees, refundable }: { invoiceId: string; number: string; maxRupees: string; refundable: boolean }) {
  return (
    <FormDialog label="Credit note" icon={<FileMinus2 className="size-3.5" />} variant="ghost" title={`Credit note on ${number}`} description="GST included. Refunds go only to the original Razorpay payment; monthly downgrades apply from the next cycle and yearly plans are not refunded." action={issueCreditNoteByStaff} hidden={{ invoiceId }} submit="Issue credit note">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="amount" label="Amount incl. GST (₹)" required help={`Up to ₹${maxRupees}`}><Input id="amount" name="amount" inputMode="decimal" /></FormField>
        <FormField name="reason" label="Reason"><Select name="reason" defaultValue="billing_error" options={CREDIT_REASONS.map((r) => ({ value: r, label: CREDIT_REASON_LABEL[r] }))} /></FormField>
      </div>
      <FormField name="note" label="Note"><Input id="note" name="note" maxLength={300} /></FormField>
      {refundable ? <Checkbox name="refund" label="Refund this amount to the original Razorpay payment" /> : <p className="text-xs text-[#979797]">Paid offline: settle any refund by bank transfer outside Flowbit.</p>}
    </FormDialog>
  )
}

export function TdsDialog({ invoiceId, number, status, quarter }: { invoiceId: string; number: string; status: string; quarter: string }) {
  return (
    <FormDialog label="Update" icon={<ShieldCheck className="size-3.5" />} variant="ghost" title={`TDS on ${number}`} description="Track the Form 16A and reconcile it with 26AS by hand." action={updateTds} hidden={{ invoiceId }} submit="Save">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="certificateStatus" label="Status"><Select name="certificateStatus" defaultValue={status || 'awaited'} options={Object.entries(TDS_CERT_LABEL).map(([value, label]) => ({ value, label }))} /></FormField>
        <FormField name="quarter" label="Quarter" help="e.g. Q3 FY 2026-27"><Input id="quarter" name="quarter" defaultValue={quarter} maxLength={20} /></FormField>
      </div>
      <FormField name="note" label="Note"><Input id="note" name="note" maxLength={300} /></FormField>
      <FormField name="certificate" label="Certificate (Form 16A)"><FileUpload name="certificate" accept="application/pdf,image/png,image/jpeg" /></FormField>
    </FormDialog>
  )
}
