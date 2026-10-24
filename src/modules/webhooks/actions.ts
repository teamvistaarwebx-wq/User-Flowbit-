'use server'

import { lookup } from 'node:dns/promises'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { encryptionKey } from '@/lib/env'
import { NotFoundError } from '@/lib/errors'
import { sealSecret } from '@/lib/secret-box'
import { checkbox, distinct, objectId } from '@/lib/validation'
import { WebhookDelivery } from '@/models/integrations/WebhookDelivery'
import { WebhookEndpoint } from '@/models/integrations/WebhookEndpoint'
import { WEBHOOK_EVENTS, type WebhookEvent } from './events'
import { deliverNow, enqueue } from './queue'
import { resolvedProblem } from './ssrf'
import { webhookChanges, webhookChangeSummary, webhookHost } from './edit-rules'

/** Settings → Webhooks: add (SSRF-checked, secret sealed), edit, pause, remove, send a test. Admins only. */

const PAGE = '/app/settings/integrations/webhooks'
const MAX_ENDPOINTS = 20
const ADMIN = { perm: 'org.manage' } as const

const resolveAll = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address)

const createSchema = z.object({
  url: z.string().trim().min(8, 'Enter the URL').max(2000),
  description: z.string().trim().max(120).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Pick at least one event').max(WEBHOOK_EVENTS.length).transform(distinct),
  secret: z.string().trim().min(16, 'Use at least 16 characters').max(200),
})

export const createWebhook = action(
  createSchema,
  async (input, ctx) => {
    const key = encryptionKey()
    if (!key) return fail('APP_ENCRYPTION_KEY is not set on the server, so webhook secrets cannot be stored safely.')
    const problem = await resolvedProblem(input.url, resolveAll)
    if (problem) return fail('Some fields need attention.', { url: problem })
    if ((await ctx.db(WebhookEndpoint).countDocuments({})) >= MAX_ENDPOINTS) return fail(`A workspace can have at most ${MAX_ENDPOINTS} webhooks.`)
    const row = await ctx.db(WebhookEndpoint).create({ url: input.url, description: input.description ?? '', events: input.events, secretSealed: sealSecret(input.secret, key), secretLast4: input.secret.slice(-4), createdByName: ctx.user.name })
    await audit(ctx, { action: 'webhook.created', entity: 'WebhookEndpoint', entityId: row._id, summary: `Added webhook ${new URL(input.url).host} (${input.events.join(', ')})` })
    revalidatePath(PAGE)
    return ok('Webhook added. Send a test to check it.')
  },
  ADMIN,
)

const updateSchema = z.object({
  id: objectId,
  url: createSchema.shape.url,
  description: createSchema.shape.description,
  events: createSchema.shape.events,
  active: checkbox,
})

/** Edits a webhook's URL (SSRF-checked again), name, events and active flag. The signing secret stays. */
export const updateWebhook = action(
  updateSchema,
  async (input, ctx) => {
    const row = await ctx.db(WebhookEndpoint).findById(input.id, { url: 1, description: 1, events: 1, active: 1 }).lean()
    if (!row) throw new NotFoundError('That webhook')
    const before = { url: row.url, description: row.description ?? '', events: row.events, active: row.active }
    const after = { url: input.url, description: input.description ?? '', events: input.events, active: input.active }
    const changes = webhookChanges(before, after)
    if (!changes.length) return ok('Nothing changed.')
    if (changes.includes('url')) {
      const problem = await resolvedProblem(input.url, resolveAll)
      if (problem) return fail('Some fields need attention.', { url: problem })
    }
    await ctx.db(WebhookEndpoint).updateOne({ _id: row._id }, { $set: { url: after.url, description: after.description, events: after.events, active: after.active, ...(changes.includes('url') ? { failingSince: null } : {}) } })
    await audit(ctx, { action: 'webhook.updated', entity: 'WebhookEndpoint', entityId: row._id, summary: `Changed a webhook: ${webhookChangeSummary(before, after)}` })
    revalidatePath(PAGE)
    return ok('Webhook saved.')
  },
  ADMIN,
)

export const setWebhookActive = action(
  z.object({ id: objectId, active: z.boolean() }),
  async ({ id, active }, ctx) => {
    const res = await ctx.db(WebhookEndpoint).updateOne({ _id: id }, { $set: { active } })
    if (!res.matchedCount) throw new NotFoundError('That webhook')
    await audit(ctx, { action: active ? 'webhook.resumed' : 'webhook.paused', entity: 'WebhookEndpoint', entityId: id, summary: active ? 'Resumed a webhook' : 'Paused a webhook' })
    revalidatePath(PAGE)
    return ok(active ? 'Webhook resumed' : 'Webhook paused')
  },
  ADMIN,
)

export const removeWebhook = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const row = await ctx.db(WebhookEndpoint).findById(id, { url: 1 }).lean()
    if (!row) throw new NotFoundError('That webhook')
    await ctx.db(WebhookEndpoint).deleteOne({ _id: row._id })
    await ctx.db(WebhookDelivery).updateMany({ endpointId: row._id, status: 'queued' }, { $set: { status: 'failed', lastError: 'The webhook was removed.' } })
    await audit(ctx, { action: 'webhook.removed', entity: 'WebhookEndpoint', entityId: row._id, summary: `Removed webhook ${webhookHost(row.url)}` })
    revalidatePath(PAGE)
    return ok('Webhook removed')
  },
  ADMIN,
)

export const sendTestWebhook = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const row = await ctx.db(WebhookEndpoint).findById(id, { events: 1, active: 1 }).lean()
    if (!row) throw new NotFoundError('That webhook')
    if (!row.active) return fail('Resume the webhook before sending a test.')
    const event = (row.events[0] ?? 'task.created') as WebhookEvent
    const ids = await enqueue(ctx.orgId, event, { id: 'test', title: 'Test from Flowbit', note: 'This is a test delivery. Check the X-Flowbit-Signature header with your secret.' }, { endpointId: String(row._id), test: true })
    await deliverNow(ids)
    const delivery = ids[0] ? await ctx.db(WebhookDelivery).findById(ids[0], { status: 1, lastStatusCode: 1, lastError: 1 }).lean() : null
    revalidatePath(PAGE)
    if (delivery?.status === 'delivered') return ok(`Test delivered (HTTP ${delivery.lastStatusCode}).`)
    return fail(`Test not delivered: ${delivery?.lastError ?? 'unknown error'}. ${delivery?.status === 'queued' ? 'It will be retried.' : ''}`.trim())
  },
  ADMIN,
)
