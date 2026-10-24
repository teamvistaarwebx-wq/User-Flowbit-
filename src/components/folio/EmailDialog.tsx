'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import type { ActionResult } from '@/lib/action-types'

export type EmailDialogDefaults = { subject: string; message: string; recipients: { id: string; name: string; email: string; primary: boolean }[] }

type Props = {
  id: string
  title: string
  defaults: EmailDialogDefaults
  action: (input: FormData) => Promise<ActionResult<unknown>>
  label?: string
  /** Where to set recipients up when there are none. */
  setupHref?: string
}

/** Email a document with its PDF. Recipients are chosen by id; the server resolves the addresses. */
export function EmailDialog({ id, title, defaults, action, label = 'Email to client', setupHref }: Props) {
  const [open, setOpen] = useState(false)
  const none = defaults.recipients.length === 0
  return (
    <Dialog open={open} onOpenChange={setOpen} size="lg" title={title} description="The PDF is attached. Addresses come from the client’s billing recipients." trigger={<Button variant="secondary" size="sm" icon={<Mail className="size-4" />}>{label}</Button>}>
      {none ? (
        <div className="space-y-3 text-sm text-fg-2">
          <p>This client has no email address to send to. Add a billing recipient with an email, or an email on the client.</p>
          {setupHref ? <Button size="sm" variant="secondary" href={setupHref}>Open the client</Button> : null}
        </div>
      ) : (
        <ActionForm action={action} onDone={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <FormField name="recipientIds" label="To" required>
            <div className="space-y-2" data-field="recipientIds">
              {defaults.recipients.map((r) => (
                <Checkbox key={r.id} name="recipientIds[]" value={r.id} defaultChecked={r.primary || defaults.recipients.length === 1} label={r.name} description={r.email} />
              ))}
            </div>
          </FormField>
          <FormField name="cc" label="Cc">
            <Input id="cc" name="cc" type="email" placeholder="Optional" />
          </FormField>
          <FormField name="subject" label="Subject" required>
            <Input id="subject" name="subject" defaultValue={defaults.subject} maxLength={200} />
          </FormField>
          <FormField name="message" label="Message" required>
            <Textarea id="message" name="message" rows={10} defaultValue={defaults.message} maxLength={5000} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton pendingLabel="Sending…" icon={<Mail className="size-4" />}>Send</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Dialog>
  )
}
