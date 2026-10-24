'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { INSET } from '@/components/folio/ui'
import { emailStatementAction } from '@/modules/folio/collections/statement-actions'

/** Jump to another client's statement, keeping the dates and view. */
export function ClientSwitcher({ clients, current, query }: { clients: { id: string; name: string }[]; current: string; query: string }) {
  const router = useRouter()
  return (
    <Select
      aria-label="Client"
      value={current}
      onValueChange={(id) => router.push(`/app/folio/ledger/${id}${query ? `?${query}` : ''}`)}
      options={clients.map((c) => ({ value: c.id, label: c.name }))}
      className="w-64"
    />
  )
}

type EmailStatementProps = {
  clientId: string
  clientName: string
  from: string | null
  to: string
  recipients: { id: string; name: string; email: string }[]
}

/** Email the statement PDF to the client's billing contacts (addresses resolved on the server). */
export function EmailStatementDialog({ clientId, clientName, from, to, recipients }: EmailStatementProps) {
  const [open, setOpen] = useState(false)
  const asAt = from ? `${formatDate(from)} to ${formatDate(to)}` : `as at ${formatDate(to)}`
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Email statement" description={`Statement of account for ${clientName}, ${asAt}. The PDF is attached.`} size="lg" trigger={<Button variant="secondary" size="sm" icon={<Mail className="size-4" />}>Email statement</Button>}>
      {recipients.length ? (
        <ActionForm action={emailStatementAction} onDone={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="clientId" value={clientId} />
          {from ? <input type="hidden" name="from" value={from} /> : null}
          <input type="hidden" name="to" value={to} />
          <FormField name="recipientIds" label="To" required>
            <div className={`space-y-2 p-3 ${INSET}`}>
              {recipients.map((r, i) => (
                <Checkbox key={r.id} name="recipientIds[]" value={r.id} defaultChecked={i === 0} label={r.name} description={r.email} />
              ))}
            </div>
          </FormField>
          <FormField name="cc" label="Cc">
            <Input id="cc" name="cc" type="email" placeholder="accounts@yourcompany.com" />
          </FormField>
          <FormField name="subject" label="Subject" required>
            <Input id="subject" name="subject" defaultValue={`Statement of account — ${clientName} — ${from ? asAt : `as at ${formatDate(to)}`}`} />
          </FormField>
          <FormField name="message" label="Message">
            <Textarea id="message" name="message" rows={6} defaultValue={`Hello,\n\nPlease find attached the statement of account for ${clientName}, ${asAt}.\n\nDo let us know if anything does not match your records.\n\nThanks`} />
          </FormField>
          <div className="flex justify-end"><SubmitButton pendingLabel="Sending…">Send statement</SubmitButton></div>
        </ActionForm>
      ) : (
        <p className="text-[13px] text-fg-2">Nobody on this client has an email address. Add a billing contact on the client page first.</p>
      )}
    </Dialog>
  )
}
