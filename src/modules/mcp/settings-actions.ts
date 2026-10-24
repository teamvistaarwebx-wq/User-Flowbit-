'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { NotFoundError } from '@/lib/errors'
import { objectId } from '@/lib/validation'
import { McpSettings } from '@/models/mcp/McpSettings'
import { OAuthGrant } from '@/models/mcp/OAuthGrant'
import { undoMcpBatch } from './plan/run'

/** Settings → Connected apps: the workspace switch, revoking a connection, undoing an AI batch. */

const PAGE = '/app/settings/integrations/ai'

export const setMcpEnabled = action(
  z.object({ enabled: z.boolean() }),
  async ({ enabled }, ctx) => {
    await ctx.db(McpSettings).updateOne({}, { $set: { enabled, updatedByName: ctx.user.name } }, { upsert: true })
    await audit(ctx, { action: enabled ? 'mcp.enabled' : 'mcp.disabled', entity: 'McpSettings', summary: enabled ? 'Turned on AI apps (MCP) for the workspace' : 'Turned off AI apps (MCP) for the workspace' })
    revalidatePath(PAGE)
    return ok(enabled ? 'AI apps are on for this workspace' : 'AI apps are off. Connected apps stop working until you turn them back on.')
  },
  { perm: 'org.manage', allowReadOnly: true },
)

/** Your own connections; an admin (org.manage) can revoke anyone's. */
export const revokeConnection = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const grant = await ctx.db(OAuthGrant).findById(id, { userId: 1, clientName: 1, revokedAt: 1 }).lean()
    if (!grant) throw new NotFoundError('That connection')
    const mine = String(grant.userId) === String(ctx.userId)
    if (!mine && !ctx.can('org.manage')) return fail("Only the person who connected it, or an admin, can revoke this app.")
    if (!grant.revokedAt) await ctx.db(OAuthGrant).updateOne({ _id: grant._id }, { $set: { revokedAt: new Date(), revokedBy: ctx.user.name } })
    await audit(ctx, { action: 'mcp.revoked', entity: 'OAuthGrant', entityId: grant._id, summary: `Revoked ${grant.clientName}${mine ? '' : ' for another member'}` })
    revalidatePath(PAGE)
    return ok(`${grant.clientName} disconnected`)
  },
  { allowReadOnly: true, allowBlocked: true },
)

export const undoMcpBatchAction = action(
  z.object({ batchId: objectId }),
  async ({ batchId }, ctx) => {
    const result = await undoMcpBatch(ctx, batchId, ctx.user.name, ctx.can('org.manage') ? {} : { onlyMemberUserId: ctx.userId })
    revalidatePath(PAGE)
    return ok(`Undone: ${result.removed} removed, ${result.restored} put back${result.kept ? `, ${result.kept} kept (already issued or gone)` : ''}.`)
  },
)
