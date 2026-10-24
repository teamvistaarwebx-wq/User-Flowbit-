'use client'

import { useRouter } from 'next/navigation'
import { Pencil, Star, Trash2 } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deleteContact, setPrimaryContact } from '@/modules/clients/contacts.actions'
import { ContactDialog, type ContactValues } from './contact-dialog'

/** Edit / Make primary / Delete for one contact. `afterDelete` navigates away (contact page). */
export function ContactActions({ clientId, contact, compact, afterDelete }: { clientId: string; contact: ContactValues; compact?: boolean; afterDelete?: string }) {
  const router = useRouter()
  const [makePrimary, pending] = useAction(setPrimaryContact)
  const remove = async () => {
    const res = await deleteContact({ clientId, contactId: contact.id })
    if (res.ok && afterDelete) router.push(afterDelete)
    return res
  }
  const edit = compact ? <IconButton label="Edit contact" size="sm"><Pencil className="size-4" /></IconButton> : <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />}>Edit</Button>
  return (
    <div className="flex items-center gap-1">
      <ContactDialog clientId={clientId} contact={contact} trigger={edit} />
      {!contact.primary ? (
        compact ? (
          <IconButton label="Make primary" size="sm" onClick={() => makePrimary({ clientId, contactId: contact.id })} disabled={pending}><Star className="size-4" /></IconButton>
        ) : (
          <Button size="sm" variant="ghost" loading={pending} icon={<Star className="size-4" />} onClick={() => makePrimary({ clientId, contactId: contact.id })}>Make primary</Button>
        )
      ) : null}
      <ConfirmDialog
        trigger={compact ? <IconButton label="Delete contact" size="sm"><Trash2 className="size-4" /></IconButton> : <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />}>Delete</Button>}
        title={`Remove ${contact.name}?`}
        description="Logged activity with this contact stays in the history. Contacts on open deals can't be removed."
        confirmLabel="Remove"
        onConfirm={remove}
      />
    </div>
  )
}
