import 'server-only'
import type { Types } from 'mongoose'
import { Client } from '@/models/Client'
import { FolioBillingProfile } from '@/models/folio/BillingProfile'
import type { FolioScope } from '@/modules/folio/queries/common'

/**
 * Who a client's reminders, invoices and statements go to. Addresses are
 * resolved on the server from a recipient id, never taken from the browser
 * (the reference mailed whatever "to" address was posted).
 *
 * Ids: `p:<id>` billing-profile recipient, `c:<id>` client contact, `client` the client's own email/phone.
 */

export type Recipient = { id: string; name: string; email: string | null; phone: string | null; whatsapp: string | null; receivesInvoices: boolean; receivesReminders: boolean; isPrimary: boolean }

export async function recipientsFor(scope: FolioScope, clientId: Types.ObjectId | string): Promise<Recipient[]> {
  const [profile, client] = await Promise.all([scope.db(FolioBillingProfile).findOne({ clientId }, { recipients: 1 }).lean(), scope.db(Client).findById(clientId, { name: 1, email: 1, phone: 1, contacts: 1 }).lean()])
  const fromProfile: Recipient[] = (profile?.recipients ?? []).map((r) => ({
    id: `p:${String(r._id)}`,
    name: r.name,
    email: r.email ?? null,
    phone: r.phone ?? null,
    whatsapp: r.whatsapp ?? r.phone ?? null,
    receivesInvoices: r.receivesInvoices !== false,
    receivesReminders: r.receivesReminders !== false,
    isPrimary: Boolean(r.isPrimary),
  }))
  if (fromProfile.length) return [...fromProfile].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  if (!client) return []
  const contacts: Recipient[] = (client.contacts ?? [])
    .filter((c) => c.email || c.phone)
    .map((c) => ({ id: `c:${String(c._id)}`, name: c.name, email: c.email ?? null, phone: c.phone ?? null, whatsapp: c.phone ?? null, receivesInvoices: true, receivesReminders: true, isPrimary: Boolean(c.primary) }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  if (contacts.length) return contacts
  return client.email || client.phone ? [{ id: 'client', name: client.name, email: client.email ?? null, phone: client.phone ?? null, whatsapp: client.phone ?? null, receivesInvoices: true, receivesReminders: true, isPrimary: true }] : []
}

/** The first reminder recipient able to receive on `channel`, primary first. */
export function reminderRecipient(list: readonly Recipient[], channel: 'email' | 'whatsapp'): Recipient | null {
  return list.find((r) => r.receivesReminders && (channel === 'email' ? r.email : r.whatsapp)) ?? null
}

export const addressOf = (r: Recipient, channel: 'email' | 'whatsapp'): string | null => (channel === 'email' ? r.email : r.whatsapp)
