'use server'

import { Types } from 'mongoose'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Permission } from '@/lib/catalog'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { objectId } from '@/lib/validation'
import { Client } from '@/models/Client'
import { Deal } from '@/models/orbit/Deal'
import { addContactTo, emailTaken, makePrimaryIn, removeContactFrom, updateContactIn, type ContactLike } from '@/modules/orbit/contacts'
import { contactSchema } from './schema'
import { recordNumberGiven } from '@/modules/messaging/number-consent-store'

const PERMS: { anyPerm: Permission[] } = { anyPerm: ['clients.write', 'contacts.write'] }

const refresh = (clientId: string, contactId?: string) => {
  revalidatePath(`/app/clients/${clientId}`)
  revalidatePath('/app/orbit/contacts')
  if (contactId) revalidatePath(`/app/orbit/contacts/${contactId}`)
}

async function loadClient(ctx: Ctx, id: string) {
  const client = await ctx.db(Client).findById(id).lean()
  if (!client) throw new NotFoundError('That client')
  return client
}

type Contact = ContactLike & { _id: Types.ObjectId }
const contactsOf = (client: { contacts?: unknown }) => ((client.contacts ?? []) as Contact[]).map((c) => ({ _id: c._id, name: c.name, email: c.email ?? undefined, phone: c.phone ?? undefined, role: c.role ?? undefined, primary: Boolean(c.primary) }))

export const addContact = action(
  contactSchema.extend({ clientId: objectId }),
  async (input, ctx) => {
    const client = await loadClient(ctx, input.clientId)
    const list = contactsOf(client)
    if (emailTaken(list, input.email)) return fail('Some fields need attention.', { email: 'Another contact on this client uses this email' })
    const contact = { _id: new Types.ObjectId(), name: input.name, email: input.email, phone: input.phone, role: input.role, primary: input.primary }
    await ctx.db(Client).updateOne({ _id: client._id }, { $set: { contacts: addContactTo(list, contact) } })
    await recordNumberGiven(ctx, { phone: input.phone, source: 'admin', where: 'client contact', contactId: contact._id })
    await audit(ctx, { action: 'client.contact_added', entity: 'Client', entityId: client._id, summary: `Added contact ${input.name} to ${client.name}` })
    refresh(input.clientId)
    return ok(`Contact '${input.name}' added to ${client.name}`, { id: String(contact._id) })
  },
  PERMS,
)

export const updateContact = action(
  contactSchema.extend({ clientId: objectId, contactId: objectId }),
  async (input, ctx) => {
    const client = await loadClient(ctx, input.clientId)
    const list = contactsOf(client)
    if (!list.some((c) => String(c._id) === input.contactId)) return fail('That contact was not found on this client.')
    if (emailTaken(list, input.email, input.contactId)) return fail('Some fields need attention.', { email: 'Another contact on this client uses this email' })
    const next = updateContactIn(list, input.contactId, { name: input.name, email: input.email, phone: input.phone, role: input.role, ...(input.primary ? { primary: true } : {}) })
    await ctx.db(Client).updateOne({ _id: client._id }, { $set: { contacts: next } })
    const previous = list.find((c) => String(c._id) === input.contactId)?.phone
    await recordNumberGiven(ctx, { phone: input.phone, previous, source: 'admin', where: 'client contact', contactId: new Types.ObjectId(input.contactId) })
    await audit(ctx, { action: 'client.contact_updated', entity: 'Client', entityId: client._id, summary: `Edited contact ${input.name} on ${client.name}` })
    refresh(input.clientId, input.contactId)
    return ok(`Contact '${input.name}' saved`)
  },
  PERMS,
)

export const setPrimaryContact = action(
  z.object({ clientId: objectId, contactId: objectId }),
  async (input, ctx) => {
    const client = await loadClient(ctx, input.clientId)
    const list = contactsOf(client)
    const target = list.find((c) => String(c._id) === input.contactId)
    if (!target) return fail('That contact was not found on this client.')
    await ctx.db(Client).updateOne({ _id: client._id }, { $set: { contacts: makePrimaryIn(list, input.contactId) } })
    refresh(input.clientId, input.contactId)
    return ok(`${target.name} is now the primary contact for ${client.name}`)
  },
  PERMS,
)

export const deleteContact = action(
  z.object({ clientId: objectId, contactId: objectId }),
  async (input, ctx) => {
    const client = await loadClient(ctx, input.clientId)
    const list = contactsOf(client)
    const target = list.find((c) => String(c._id) === input.contactId)
    if (!target) return fail('That contact was not found on this client.')
    const openDeals = await ctx.db(Deal).countDocuments({ clientId: client._id, contactId: input.contactId, status: 'open' })
    if (openDeals) return fail(`This contact is on ${openDeals} open ${openDeals === 1 ? 'deal' : 'deals'}. Change the deal contact first.`)
    await ctx.db(Client).updateOne({ _id: client._id }, { $set: { contacts: removeContactFrom(list, input.contactId) } })
    await audit(ctx, { action: 'client.contact_deleted', entity: 'Client', entityId: client._id, summary: `Removed contact ${target.name} from ${client.name}` })
    refresh(input.clientId)
    return ok(`Contact '${target.name}' removed`)
  },
  PERMS,
)
