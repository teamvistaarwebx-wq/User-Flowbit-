'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { withTransaction } from '@/lib/db'
import { ForbiddenError } from '@/lib/errors'
import { stateOfGstin } from '@/lib/india-states'
import { objectId } from '@/lib/validation'
import { Client, CLIENT_STATUSES } from '@/models/Client'
import { Activity } from '@/models/orbit/Activity'
import { assertActiveMembers } from '@/modules/orbit/people'
import { clientFieldsSchema, firstContactSchema } from './schema'
import { clientOnlyActivity, clientReferences, describeRefs } from './references'
import { newNumbers } from '@/modules/messaging/number-consent'
import { recordNumberGiven } from '@/modules/messaging/number-consent-store'

const refresh = (id?: string) => {
  revalidatePath('/app/clients')
  if (id) revalidatePath(`/app/clients/${id}`)
}

type Fields = z.output<typeof clientFieldsSchema>

/** Clients need Work, Orbit or Folio on the workspace. */
function assertClientsProduct(ctx: Ctx) {
  if (!ctx.has('work') && !ctx.has('orbit') && !ctx.has('folio')) throw new ForbiddenError('Clients need Work, Orbit or Folio on your workspace.')
}

/** GSTIN must be unique in the workspace. */
async function gstinTaken(ctx: Ctx, gstin: string | undefined, exceptId?: string): Promise<string | null> {
  if (!gstin) return null
  const other = await ctx.db(Client).findOne({ gstin, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }, { name: 1 }).lean()
  return other ? `A client with this GSTIN already exists: ${other.name}` : null
}

function toDoc(input: Fields) {
  const state = input.state ?? stateOfGstin(input.gstin)?.code2
  const address = input.billingAddress
  return {
    kind: input.kind, name: input.name, displayName: input.displayName, email: input.email, phone: input.phone, website: input.website,
    gstin: input.gstin, pan: input.pan, state,
    billingAddress: { line1: address?.line1, line2: address?.line2, city: address?.city, state: address?.state ?? state, pincode: address?.pincode, country: address?.country ?? 'India' },
    ownerId: input.ownerId, tags: input.tags, source: input.source, sector: input.sector, status: input.status, notes: input.notes,
  }
}

export const createClient = action(
  clientFieldsSchema.and(z.object({ firstContact: firstContactSchema })),
  async (input, ctx) => {
    assertClientsProduct(ctx)
    const taken = await gstinTaken(ctx, input.gstin)
    if (taken) return fail('Some fields need attention.', { gstin: taken })
    await assertActiveMembers(ctx, [input.ownerId])
    const fc = input.firstContact
    const contacts = fc?.name ? [{ name: fc.name, role: fc.role, email: fc.email, phone: fc.phone, primary: true }] : []
    const client = await ctx.db(Client).create({ ...toDoc(input), ownerId: input.ownerId ?? ctx.memberId, contacts })
    for (const phone of newNumbers([], [input.phone, fc?.phone])) await recordNumberGiven(ctx, { phone, source: 'admin', where: 'client' })
    await audit(ctx, { action: 'client.create', entity: 'Client', entityId: client._id, summary: `Added client ${client.name}`, changes: { after: client.toObject() } })
    refresh()
    return ok(`Client '${client.name}' added`, { id: String(client._id) }, `/app/clients/${client._id}`)
  },
  { perm: 'clients.write' },
)

export const updateClient = action(
  clientFieldsSchema.and(z.object({ id: objectId })),
  async (input, ctx) => {
    assertClientsProduct(ctx)
    const before = await ctx.db(Client).findById(input.id).lean()
    if (!before) return fail('That client was not found. It may have been deleted.')
    const taken = await gstinTaken(ctx, input.gstin, input.id)
    if (taken) return fail('Some fields need attention.', { gstin: taken })
    if (input.ownerId && input.ownerId !== String(before.ownerId ?? '')) await assertActiveMembers(ctx, [input.ownerId])
    const doc = toDoc(input)
    await ctx.db(Client).updateOne({ _id: before._id }, { $set: doc })
    await recordNumberGiven(ctx, { phone: input.phone, previous: before.phone, source: 'admin', where: 'client' })
    await audit(ctx, { action: 'client.update', entity: 'Client', entityId: before._id, summary: `Edited client ${input.name}`, changes: { before, after: { ...before, ...doc } } })
    refresh(input.id)
    return ok(`Client '${input.name}' saved`)
  },
  { perm: 'clients.write' },
)

export const setClientStatus = action(
  z.object({ id: objectId, status: z.enum(CLIENT_STATUSES) }),
  async ({ id, status }, ctx) => {
    assertClientsProduct(ctx)
    const client = await ctx.db(Client).findOneAndUpdate({ _id: id }, { $set: { status } }).lean()
    if (!client) return fail('That client was not found. It may have been deleted.')
    await audit(ctx, { action: 'client.status', entity: 'Client', entityId: client._id, summary: `Client ${client.name} marked ${status}` })
    refresh(id)
    return ok(`Client '${client.name}' marked ${status}`)
  },
  { perm: 'clients.write' },
)

export const deleteClient = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    assertClientsProduct(ctx)
    const client = await ctx.db(Client).findById(id).lean()
    if (!client) return fail('That client was not found. It may have been deleted already.')
    const used = describeRefs(await clientReferences(ctx, client._id))
    if (used) return fail(`'${client.name}' has ${used}. Mark it inactive instead.`)
    // Logged (done / cancelled) Orbit activities on the client alone would link to a missing page; they go with it.
    await withTransaction(async (session) => {
      await ctx.db(Activity).deleteMany(clientOnlyActivity(client._id), { session })
      await ctx.db(Client).deleteOne({ _id: client._id }, { session })
    })
    await audit(ctx, { action: 'client.delete', entity: 'Client', entityId: client._id, summary: `Deleted client ${client.name}`, changes: { before: client } })
    refresh()
    return ok(`Client '${client.name}' deleted`, undefined, '/app/clients')
  },
  { perm: 'clients.delete' },
)

/** Name-only client from the New deal dialog. */
export const quickCreateClient = action(
  z.object({ name: z.string().trim().min(2, 'Use at least 2 characters').max(120, 'Keep the name under 120 characters') }),
  async ({ name }, ctx) => {
    assertClientsProduct(ctx)
    const client = await ctx.db(Client).create({ name, kind: 'company', status: 'lead', ownerId: ctx.memberId, contacts: [], tags: [] })
    await audit(ctx, { action: 'client.create', entity: 'Client', entityId: client._id, summary: `Added client ${name}` })
    refresh()
    return ok(`Client '${name}' added`, { id: String(client._id), name })
  },
  { perm: 'clients.write' },
)
