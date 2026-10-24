'use client'

import { useState } from 'react'
import { Ban, BellRing, Copy, FileMinus, IndianRupee, Pencil, PhoneCall, Send, Trash2, Undo2, XCircle } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/input'
import { deleteDraftInvoiceAction, duplicateInvoiceAction, emailInvoiceAction, issueInvoiceAction, undoWriteOffAction, voidInvoiceAction, writeOffInvoiceAction } from '@/modules/folio/invoices/actions'
import { EmailDialog, type EmailDialogDefaults } from './EmailDialog'
import { SendWhatsAppDialog } from '@/components/whatsapp/send-whatsapp-dialog'
import { NewFollowupDialog, type FollowupDialogOptions } from './FollowupActions'
import { ReminderDialog } from './ReminderDialog'
import { PdfLink } from './PdfLink'
import { useRun } from './use-run'

export type InvoiceActionsProps = {
  id: string
  clientId: string
  status: string
  number: string | null
  peek: string | null
  issueDate: string
  isOpening: boolean
  writtenOff: boolean
  settled: boolean
  balancePaise: number
  emailDefaults: EmailDialogDefaults | null
  followupOptions: FollowupDialogOptions | null
  can: { edit: boolean; issue: boolean; void: boolean; delete: boolean; receipt: boolean; credit: boolean; collect: boolean; email: boolean }
}

function IssueDialog({ id, peek, issueDate }: { id: string; peek: string | null; issueDate: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} size="sm" title="Issue this invoice?" description={`It takes the next number${peek ? ` (${peek})` : ''} and its figures become permanent. After this, the only way to change it is a credit note.`} trigger={<Button size="sm" variant="primary" icon={<Send className="size-4" />}>Issue</Button>}>
      <ActionForm action={issueInvoiceAction} onDone={() => setOpen(false)} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        <FormField name="issueDate" label="Invoice date" help="Not in the future, and not before the last invoice in this series.">
          <DateInput id="issueDate" name="issueDate" defaultValue={issueDate} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton pendingLabel="Issuing…">Issue invoice</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

/** Write off an open balance, or undo a standing write-off (also on an opening-balance row). */
function WriteOffButtons(p: InvoiceActionsProps) {
  const run = useRun()
  const open = p.status === 'issued' || p.status === 'part_paid'
  const issued = open || p.status === 'paid'
  return (
    <>
      {open && p.can.issue && !p.writtenOff && p.balancePaise > 0 ? (
        <ConfirmDialog trigger={<Button size="sm" variant="ghost" icon={<XCircle className="size-4" />}>Write off</Button>} title={`Write off ${p.number}?`} description="The invoice stands and the debt stops being counted as receivable. The ledger will show it as a write-off, not as a payment." confirmLabel="Write off" reason={{ label: 'Reason', placeholder: 'Client closed the business', required: true }} onConfirm={(reason) => run(writeOffInvoiceAction({ id: p.id, reason: reason ?? '' }))} />
      ) : null}
      {p.writtenOff && issued && p.can.issue ? (
        <ConfirmDialog trigger={<Button size="sm" variant="secondary" icon={<Undo2 className="size-4" />}>Undo write-off</Button>} title="Undo the write-off?" description="The balance becomes receivable again and returns to the collections list." tone="primary" confirmLabel="Undo write-off" onConfirm={() => run(undoWriteOffAction({ id: p.id }))} />
      ) : null}
    </>
  )
}

/** The action row of an invoice, by status and permission (folio.md 7.4). */
export function InvoiceActions(p: InvoiceActionsProps) {
  const run = useRun()
  const [duplicate, duplicating] = useAction(duplicateInvoiceAction)
  const open = p.status === 'issued' || p.status === 'part_paid'
  const issued = open || p.status === 'paid'
  const pdf = `/api/folio/invoices/${p.id}/pdf`
  if (p.isOpening) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <WriteOffButtons {...p} />
        <Button size="sm" variant="secondary" href={`/app/clients/${p.clientId}#billing-details`}>Edit client billing details</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {p.status === 'draft' && p.can.edit ? <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} href={`/app/folio/invoices/${p.id}/edit`}>Edit</Button> : null}
      {p.status === 'draft' && p.can.delete ? (
        <ConfirmDialog trigger={<Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />}>Delete draft</Button>} title="Delete this draft?" description="Nothing has been issued, so this leaves no trace and spends no number." confirmLabel="Delete draft" onConfirm={() => run(deleteDraftInvoiceAction({ id: p.id }))} />
      ) : null}
      {p.status === 'draft' && p.can.issue ? <IssueDialog id={p.id} peek={p.peek} issueDate={p.issueDate} /> : null}
      {p.status !== 'draft' ? <PdfLink href={pdf} /> : null}
      {issued && p.can.email && p.emailDefaults ? <EmailDialog id={p.id} title={`Email invoice ${p.number}`} defaults={p.emailDefaults} action={emailInvoiceAction} setupHref={`/app/clients/${p.clientId}`} /> : null}
      {issued && p.can.email ? <SendWhatsAppDialog kind="invoice" id={p.id} title={`Send invoice ${p.number} on WhatsApp`} /> : null}
      {open && p.can.receipt && p.balancePaise > 0 ? <Button size="sm" variant="primary" icon={<IndianRupee className="size-4" />} href={`/app/folio/receipts/new?clientId=${p.clientId}&invoiceId=${p.id}`}>Record payment</Button> : null}
      {open && p.can.collect && p.balancePaise > 0 && p.number ? <ReminderDialog invoiceId={p.id} invoiceNumber={p.number} trigger={<Button size="sm" variant="ghost" icon={<BellRing className="size-4" />}>Send reminder</Button>} /> : null}
      {open && p.can.collect && p.followupOptions ? <NewFollowupDialog options={p.followupOptions} defaultClientId={p.clientId} defaultInvoiceId={p.id} trigger={<Button size="sm" variant="ghost" icon={<PhoneCall className="size-4" />}>Add follow-up</Button>} /> : null}
      {issued && p.can.credit && p.balancePaise > 0 ? <Button size="sm" variant="ghost" icon={<FileMinus className="size-4" />} href={`/app/folio/credit-notes/new?invoiceId=${p.id}`}>Raise credit note</Button> : null}
      {issued && p.can.void && !p.settled && !p.writtenOff ? (
        <ConfirmDialog trigger={<Button size="sm" variant="danger" icon={<Ban className="size-4" />}>Void</Button>} title={`Void ${p.number}?`} description="The number stays spent — a statutory series may contain cancellations but not gaps." confirmLabel="Void invoice" reason={{ label: 'Reason', placeholder: 'Raised against the wrong client', required: true }} onConfirm={(reason) => run(voidInvoiceAction({ id: p.id, reason: reason ?? '' }))} />
      ) : null}
      <WriteOffButtons {...p} />
      {p.can.edit ? <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} loading={duplicating} onClick={() => duplicate({ id: p.id })}>Duplicate</Button> : null}
    </div>
  )
}
