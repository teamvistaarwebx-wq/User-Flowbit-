'use client'

import { Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cancelCreditNoteAction, emailCreditNoteAction } from '@/modules/folio/credit-notes/actions'
import { EmailDialog, type EmailDialogDefaults } from './EmailDialog'
import { SendWhatsAppDialog } from '@/components/whatsapp/send-whatsapp-dialog'
import { PdfLink } from './PdfLink'
import { useRun } from './use-run'

/** PDF, email and cancel for a credit note. */
export function CreditNoteActions({ id, number, invoiceNumber, clientId, status, canWrite, emailDefaults }: { id: string; number: string; invoiceNumber: string; clientId: string; status: string; canWrite: boolean; emailDefaults: EmailDialogDefaults | null }) {
  const run = useRun()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PdfLink href={`/api/folio/credit-notes/${id}/pdf`} />
      {canWrite && status === 'issued' && emailDefaults ? <EmailDialog id={id} title={`Email credit note ${number}`} defaults={emailDefaults} action={emailCreditNoteAction} setupHref={`/app/clients/${clientId}`} /> : null}
      {canWrite && status === 'issued' ? <SendWhatsAppDialog kind="credit_note" id={id} title={`Send credit note ${number} on WhatsApp`} /> : null}
      {canWrite && status === 'issued' ? (
        <ConfirmDialog
          trigger={<Button size="sm" variant="danger" icon={<Ban className="size-4" />}>Cancel</Button>}
          title={`Cancel credit note ${number}?`}
          description={`${invoiceNumber} becomes owed again. The number stays spent.`}
          confirmLabel="Cancel credit note"
          reason={{ label: 'Reason', placeholder: 'Raised against the wrong invoice', required: true }}
          onConfirm={(reason) => run(cancelCreditNoteAction({ id, reason: reason ?? '' }))}
        />
      ) : null}
    </div>
  )
}
