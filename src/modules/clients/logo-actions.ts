'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { deleteStoredFile } from '@/lib/files'
import { objectId } from '@/lib/validation'
import { Client } from '@/models/Client'
import { saveEntityLogo } from '@/modules/files/entity-logo'

const refresh = (id: string) => {
  revalidatePath(`/app/clients/${id}`)
  revalidatePath('/app/clients')
  revalidatePath('/app/work', 'layout')
}

async function loadClient(ctx: Ctx, id: string) {
  const client = await ctx.db(Client).findById(id, { name: 1, logoFileId: 1 }).lean()
  if (!client) throw new NotFoundError('That client')
  return client
}

/** Sets the client's logo (shared by Orbit, Folio and Work); the old file is deleted. */
export const uploadClientLogo = action(
  z.object({ clientId: objectId, logo: z.instanceof(File, { error: 'Choose an image' }) }),
  async ({ clientId, logo }, ctx) => {
    const client = await loadClient(ctx, clientId)
    const fileId = await saveEntityLogo(ctx, logo, { kind: 'client_logo', entity: 'Client', entityId: client._id })
    await ctx.db(Client).updateOne({ _id: client._id }, { $set: { logoFileId: fileId } })
    if (client.logoFileId) await deleteStoredFile(ctx.orgId, String(client.logoFileId))
    await audit(ctx, { action: 'client.logo_updated', entity: 'Client', entityId: client._id, summary: `Logo updated for ${client.name}` })
    refresh(clientId)
    return ok('Logo updated.')
  },
  { perm: 'clients.write' },
)

export const removeClientLogo = action(
  z.object({ clientId: objectId }),
  async ({ clientId }, ctx) => {
    const client = await loadClient(ctx, clientId)
    if (!client.logoFileId) return ok('There is no logo to remove.')
    await ctx.db(Client).updateOne({ _id: client._id }, { $unset: { logoFileId: 1 } })
    await deleteStoredFile(ctx.orgId, String(client.logoFileId))
    await audit(ctx, { action: 'client.logo_removed', entity: 'Client', entityId: client._id, summary: `Logo removed from ${client.name}` })
    refresh(clientId)
    return ok('Logo removed.')
  },
  { perm: 'clients.write' },
)
