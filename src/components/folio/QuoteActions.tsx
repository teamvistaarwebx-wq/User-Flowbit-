'use client'

import { ArrowRightLeft, Check, Copy, Pencil, Send, Trash2, X } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { isQuoteEditable } from '@/modules/folio/quotes/rules'
import { convertQuoteAction, deleteQuoteAction, duplicateQuoteAction, emailQuoteAction, moveQuoteAction } from '@/modules/folio/quotes/actions'
import { EmailDialog, type EmailDialogDefaults } from './EmailDialog'
import { SendWhatsAppDialog } from '@/components/whatsapp/send-whatsapp-dialog'
import { PdfLink } from './PdfLink'
import { useRun } from './use-run'

type Props = { id: string; clientId: string; name: string; status: string; expired: boolean; emailDefaults: EmailDialogDefaults | null; can: { write: boolean; convert: boolean } }

/** Quote actions by status: edit, PDF, email, sent/accepted/declined, convert, duplicate, delete. */
export function QuoteActions({ id, clientId, name, status, expired, emailDefaults, can }: Props) {
  const run = useRun()
  const [mark, marking] = useAction(moveQuoteAction)
  const [duplicate, duplicating] = useAction(duplicateQuoteAction)
  const live = status === 'draft' || status === 'sent'
  const convertible = ['draft', 'sent', 'accepted'].includes(status) && !expired
  return (
    <div className="flex flex-wrap items-center gap-2">
      {can.write && isQuoteEditable(status) ? <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} href={`/app/folio/quotes/${id}?edit=1`}>Edit</Button> : null}
      <PdfLink href={`/api/folio/quotes/${id}/pdf`} />
      {can.write && emailDefaults && status !== 'declined' && status !== 'converted' ? <EmailDialog id={id} title={`Email ${name}`} defaults={emailDefaults} action={emailQuoteAction} setupHref={`/app/clients/${clientId}`} /> : null}
      {can.write && status !== 'declined' && status !== 'converted' ? <SendWhatsAppDialog kind="quote" id={id} title={`Send ${name} on WhatsApp`} /> : null}
      {can.write && status === 'draft' ? <Button size="sm" variant="ghost" icon={<Send className="size-4" />} loading={marking} onClick={() => mark({ id, to: 'sent' })}>Mark as sent</Button> : null}
      {can.write && live ? <Button size="sm" variant="ghost" icon={<Check className="size-4" />} loading={marking} onClick={() => mark({ id, to: 'accepted' })}>Accept</Button> : null}
      {can.write && ['draft', 'sent', 'accepted'].includes(status) ? (
        <ConfirmDialog trigger={<Button size="sm" variant="ghost" icon={<X className="size-4" />}>Decline</Button>} title={`Mark ${name} declined?`} confirmLabel="Mark declined" reason={{ label: 'Why did they decline?', placeholder: 'Went with a lower quote', required: true }} onConfirm={(reason) => run(moveQuoteAction({ id, to: 'declined', reason }))} />
      ) : null}
      {can.write && can.convert && convertible ? (
        <ConfirmDialog trigger={<Button size="sm" variant="primary" icon={<ArrowRightLeft className="size-4" />}>Convert to invoice</Button>} title="Convert to an invoice?" description="Creates a draft invoice with these lines. Review it before issuing." tone="primary" confirmLabel="Create draft invoice" onConfirm={() => run(convertQuoteAction({ id }))} />
      ) : null}
      {can.write ? <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} loading={duplicating} onClick={() => duplicate({ id })}>Duplicate</Button> : null}
      {can.write && status === 'draft' ? <ConfirmDialog trigger={<Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />}>Delete</Button>} title={`Delete ${name}?`} description="It was never sent, so nothing is lost. Its number is not reused." confirmLabel="Delete quote" onConfirm={() => run(deleteQuoteAction({ id }))} /> : null}
    </div>
  )
}
