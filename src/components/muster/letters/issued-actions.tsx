'use client'

import { Ban, Download, Mail } from 'lucide-react'
import { useState } from 'react'
import { emailLetter, revokeLetter } from '@/modules/muster/letters/actions'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'

type Props = { id: string; status: string; canWrite: boolean; to: string | null; email: { subject: string; body: string }; hasLogin?: boolean }

/** Covering email drafted from the letter: edit the subject and message, check the preview, send with the PDF attached. */
function EmailDialog({ id, to, email, hasLogin = true }: { id: string; to: string; email: Props['email']; hasLogin?: boolean }) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState(email.subject)
  const [body, setBody] = useState(email.body)
  const [send, sending] = useAction(emailLetter, { onDone: () => setOpen(false) })
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="xl"
      trigger={<Button variant="secondary" icon={<Mail className="size-4" />}>Email to {to.split('@')[0]}</Button>}
      title="Email this letter"
      description={`To ${to}, with the PDF attached. The message is drafted from the letter; change anything before sending.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" icon={<Mail className="size-4" />} loading={sending} disabled={!subject.trim() || !body.trim()} onClick={() => send({ id, subject: subject.trim(), body: body.trim() })}>Send</Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white">Subject</span>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white">Message</span>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} maxLength={5000} />
          </label>
          <p className="text-xs text-fg-2">Blank lines separate paragraphs.</p>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-white">Preview</span>
          <article className="lit-edge rounded-[12px] bg-[#1A1A1A] p-5 text-sm leading-relaxed">
            <p className="mb-3 text-base font-semibold text-white">{subject || 'No subject'}</p>
            {paragraphs.map((p, i) => <p key={i} className="mb-3 whitespace-pre-line text-white/80">{p}</p>)}
            <p className="mt-4 text-xs text-fg-2">Attached: the letter as a PDF{hasLogin ? ' · button: Open My letters' : ''}</p>
          </article>
        </div>
      </div>
    </Dialog>
  )
}

/** Download, email and revoke for an issued (or revoked) letter. Letters are never deleted. */
export function IssuedActions({ id, status, canWrite, to, email, hasLogin }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/muster/letters/${id}?download=1`} className={buttonClass('secondary')}>
        <Download className="size-4" /> Download PDF
      </a>
      {canWrite && status === 'issued' ? (
        <>
          {to ? <EmailDialog id={id} to={to} email={email} hasLogin={hasLogin} /> : <Button variant="secondary" icon={<Mail className="size-4" />} disabled title="No work email on record">Email</Button>}
          <ConfirmDialog
            trigger={<Button variant="danger" icon={<Ban className="size-4" />}>Revoke</Button>}
            title="Revoke this letter?"
            description="It stays on record and its PDF is marked REVOKED. This cannot be undone."
            confirmLabel="Revoke letter"
            reason={{ label: 'Reason', required: true, placeholder: 'Issued with the wrong last working day' }}
            onConfirm={(reason) => revokeLetter({ id, reason: reason ?? '' })}
          />
        </>
      ) : null}
    </div>
  )
}
