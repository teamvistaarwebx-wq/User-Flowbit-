import Link from 'next/link'
import { Briefcase, Contact, Mail, Phone, Star, UserPlus, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ContactActions } from '@/components/clients/contact-actions'
import { ContactDialog } from '@/components/clients/contact-dialog'
import { TBODY_ROW, THEAD_ROW, TableCard, Td, Th } from '@/components/orbit/parts'

type ContactDoc = { _id: unknown; name: string; role?: string | null; email?: string | null; phone?: string | null; primary?: boolean | null }

export function ContactsTab({ clientId, contacts, canEdit, linkToOrbit }: { clientId: string; contacts: ContactDoc[]; canEdit: boolean; linkToOrbit: boolean }) {
  const add = canEdit ? <ContactDialog clientId={clientId} trigger={<Button size="sm" variant="secondary" icon={<UserPlus className="size-4" />}>Add contact</Button>} /> : null
  return (
    <TableCard icon={<Contact />} title="Contacts" subtitle={contacts.length ? 'The primary contact gets invoices and reminders.' : undefined} actions={contacts.length ? add : null}>
      {contacts.length === 0 ? (
        <div className="border-t border-line">
          <EmptyState icon={<Contact />} title="No contacts yet" description="Add the people you deal with at this client." action={add} compact />
        </div>
      ) : (
        <div className="overflow-x-auto pb-3">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <Th icon={<UserRound strokeWidth={1.5} />}>Name</Th>
                <Th icon={<Briefcase strokeWidth={1.5} />}>Role</Th>
                <Th icon={<Mail strokeWidth={1.5} />}>Email</Th>
                <Th icon={<Phone strokeWidth={1.5} />}>Phone</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              <tr aria-hidden className="h-1.5" />
              {contacts.map((c) => {
                const id = String(c._id)
                return (
                  <tr key={id} className={cn(TBODY_ROW, 'h-11')}>
                    <Td>
                      <span className="inline-flex items-center gap-2 text-sm text-white">
                        {linkToOrbit ? <Link href={`/app/orbit/contacts/${id}`} className="transition-colors hover:text-blush">{c.name}</Link> : c.name}
                        {c.primary ? <Star className="size-3.5 fill-current text-blush" aria-label="Primary contact" /> : null}
                      </span>
                    </Td>
                    <Td className="text-[#979797]">{c.role || '—'}</Td>
                    <Td>{c.email ? <a className="text-white/85 transition-colors hover:text-white" href={`mailto:${c.email}`}>{c.email}</a> : <span className="text-[#979797]">—</span>}</Td>
                    <Td>{c.phone ? <a className="tabular-nums text-white/85 transition-colors hover:text-white" href={`tel:${c.phone}`}>{c.phone}</a> : <span className="text-[#979797]">—</span>}</Td>
                    <Td align="right">{canEdit ? <span className="inline-flex justify-end"><ContactActions compact clientId={clientId} contact={{ id, name: c.name, role: c.role ?? '', email: c.email ?? '', phone: c.phone ?? '', primary: Boolean(c.primary) }} /></span> : null}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </TableCard>
  )
}
