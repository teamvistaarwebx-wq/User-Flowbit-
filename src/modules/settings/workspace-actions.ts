'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { PRODUCT_KEYS, PRODUCTS } from '@/lib/catalog'
import { NotFoundError } from '@/lib/errors'
import { readStoredFile } from '@/lib/files'
import { objectId } from '@/lib/validation'
import { Org } from '@/models/Org'
import { Message } from '@/models/messaging/Message'
import type { Channel } from '@/modules/messaging/events'
import { enqueue, type EnqueueAttachment } from '@/modules/messaging/send'
import { hiddenMailKinds } from './email-log-access'

/** Switches an entitled product on or off for the whole workspace (nothing is deleted). */
export const setProductEnabled = action(
  z.object({ product: z.enum(PRODUCT_KEYS), enabled: z.boolean() }),
  async ({ product, enabled }, ctx) => {
    const name = PRODUCTS[product].name
    if (!ctx.entitlements.entitledProducts.includes(product)) return fail(`${name} isn't in your plan.`)
    const current = ctx.org.enabledProducts?.length ? [...ctx.org.enabledProducts] : [...PRODUCT_KEYS]
    const next = enabled ? [...new Set([...current, product])] : current.filter((p) => p !== product)
    const stillOn = PRODUCT_KEYS.filter((p) => next.includes(p) && ctx.entitlements.entitledProducts.includes(p))
    if (!stillOn.length) return fail('Keep at least one product switched on.')
    await Org.updateOne({ _id: ctx.orgId }, { $set: { enabledProducts: next } })
    await audit(ctx, { action: 'org.modules_changed', entity: 'Org', entityId: ctx.orgId, summary: `${name} turned ${enabled ? 'on' : 'off'}`, meta: { before: current, after: next } })
    revalidatePath('/app', 'layout')
    return ok(`${name} turned ${enabled ? 'on' : 'off'}.`)
  },
  { perm: 'org.manage' },
)

/** Messages log: sends a stored message again, as a new message on the same channel. */
export const resendMessage = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const message = await ctx.db(Message).findById(id).select('+attachments.data').lean()
    if (!message || hiddenMailKinds(ctx).includes(message.kind ?? 'other')) throw new NotFoundError('That message')
    if (message.status === 'scheduled' || message.status === 'queued' || message.status === 'sending') return fail('This message is still waiting to go out.')
    if (message.channel === 'email' && (!message.subject || !message.html)) return fail('This email has no stored content to send again.')
    const attachments: EnqueueAttachment[] = []
    for (const a of message.attachments ?? []) {
      const stored = a.data ? null : a.fileId ? await readStoredFile(ctx.orgId, String(a.fileId)) : null
      const content = a.data ? Buffer.from(a.data as unknown as Uint8Array) : stored?.data
      if (!content) return fail("This message had an attachment that wasn't stored, so it can't be sent again from here. Send it again from its record.")
      attachments.push({ filename: a.filename, content, mime: a.mime ?? stored?.file.mime ?? undefined, fileId: a.fileId ?? undefined })
    }
    const result = await enqueue({
      channel: message.channel as Channel,
      to: message.to,
      cc: message.cc ?? undefined,
      orgId: ctx.orgId,
      userId: message.userId,
      memberId: message.memberId,
      event: message.event ?? undefined,
      group: message.group ?? undefined,
      kind: message.kind ?? 'other',
      entity: message.entity ?? undefined,
      entityId: message.entityId ?? undefined,
      essential: message.essential ?? undefined,
      subject: message.subject ?? undefined,
      html: message.html ?? undefined,
      text: message.text ?? undefined,
      title: message.title ?? undefined,
      body: message.body ?? undefined,
      href: message.href ?? undefined,
      template: message.template ?? undefined,
      params: (message.params as Record<string, string> | undefined) ?? undefined,
      headers: (message.headers as Record<string, string> | undefined) ?? undefined,
      attachments,
      note: `Sent again by ${ctx.user.name}`,
    })
    const label = message.subject ?? message.title ?? 'message'
    await audit(ctx, { action: 'message.resent', entity: 'Message', entityId: message._id, summary: `Message "${label}" sent again to ${message.to[0] ?? 'its recipient'}` })
    revalidatePath('/app/settings/messages')
    if (result.status === 'skipped') return ok(result.provider === 'outbox' ? `Saved again for ${message.to[0]} (no email provider is set up).` : 'Not sent: the recipient opted out or has no address. See the new row for the reason.')
    if (!result.ok) return fail(`Sending failed again: ${result.error ?? 'unknown error'}. Flowbit retries automatically.`)
    return ok(`Sent again to ${message.to[0]}.`)
  },
  { perm: 'org.manage' },
)
