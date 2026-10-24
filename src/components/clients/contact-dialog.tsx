'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { RecordPicker } from '@/components/orbit/record-picker'
import { addContact, updateContact } from '@/modules/clients/contacts.actions'
import type { RecordHit } from '@/modules/orbit/record-types'

export type ContactValues = { id: string; name: string; role: string; email: string; phone: string; primary: boolean }

export type ContactDialogProps = {
  trigger: ReactNode
  /** Fixed client; omit to pick one (Orbit contacts page). */
  clientId?: string
  contact?: ContactValues
  /** Open the new contact's page after adding (Orbit contacts). */
  goToContact?: boolean
}

/** Add or edit a contact on a client. */
export function ContactDialog({ trigger, clientId, contact, goToContact }: ContactDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [client, setClient] = useState<RecordHit | null>(null)
  const editing = Boolean(contact)
  const cid = clientId ?? client?.id
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title={editing ? `Edit ${contact?.name}` : 'Add contact'} size="md">
      <ActionForm
        action={editing ? updateContact : addContact}
        className="grid gap-4 sm:grid-cols-2"
        onDone={(res) => {
          setOpen(false)
          const id = (res.data as { id?: string } | undefined)?.id
          if (goToContact && id) router.push(`/app/orbit/contacts/${id}`)
        }}
      >
        {cid ? <input type="hidden" name="clientId" value={cid} /> : null}
        {contact ? <input type="hidden" name="contactId" value={contact.id} /> : null}
        {!clientId ? (
          <FormField name="clientId" label="Client" required className="sm:col-span-2">
            <RecordPicker kinds={['client']} value={client} onChange={setClient} placeholder="Search clients" name="clientId" />
          </FormField>
        ) : null}
        <FormField name="name" label="Name" required className="sm:col-span-2"><Input id="c-name" name="name" defaultValue={contact?.name} maxLength={80} /></FormField>
        <FormField name="role" label="Role"><Input id="c-role" name="role" defaultValue={contact?.role} placeholder="Finance head" maxLength={60} /></FormField>
        <FormField name="phone" label="Phone"><Input id="c-phone" name="phone" defaultValue={contact?.phone} inputMode="tel" /></FormField>
        <FormField name="email" label="Email" className="sm:col-span-2"><Input id="c-email" name="email" type="email" defaultValue={contact?.email} /></FormField>
        <div className="sm:col-span-2"><Checkbox name="primary" defaultChecked={contact?.primary} label="Primary contact" description="Invoices and reminders go to the primary contact." /></div>
        <div className="flex justify-end sm:col-span-2"><SubmitButton>{editing ? 'Save contact' : 'Add contact'}</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}
