'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Permission } from '@/lib/catalog'
import { firstName } from '@/lib/utils'
import { objectId } from '@/lib/validation'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { WaThread } from '@/models/whatsapp/WaThread'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { DOC_PERMS, sendDocOnWhatsApp } from './doc-send'
import { previewCustomerTemplate } from './customer-templates'
import { canSendFreeText } from './webhook-event'
import { sendWorkspaceTemplate } from './workspace-send'
import { sendWorkspaceText, storeThreadOut } from './workspace-webhook'
import { assertWhatsAppOn } from '@/modules/features/flags'

/**
 * The workspace WhatsApp inbox (WhatsApp B): assign, reply in the 24-hour
 * window, send the approved follow-up template once it has closed, close or
 * reopen. Every lookup goes through the workspace's own scoped db.
 */

const REPLY = { anyPerm: ['clients.write', 'activities.write', 'collections.write'] as Permission[] }

const refresh = (id: string) => {
  revalidatePath('/app/whatsapp')
  revalidatePath(`/app/whatsapp/${id}`)
}

const isStopped = (t: { stoppedAt?: Date | null; lastInboundAt?: Date | null }) => Boolean(t.stoppedAt && (!t.lastInboundAt || t.stoppedAt >= t.lastInboundAt))

export const assignThreadAction = action(
  z.object({ threadId: objectId, memberId: z.union([objectId, z.literal('none')]) }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const member = input.memberId === 'none' ? null : await ctx.db(Member).findOne({ _id: input.memberId, status: 'active' }, { userId: 1 }).lean()
    if (input.memberId !== 'none' && !member) return fail('Pick an active member of this workspace.')
    const user = member ? await User.findById(member.userId, { name: 1 }).lean() : null
    const updated = await ctx.db(WaThread).findOneAndUpdate({ _id: input.threadId }, member ? { $set: { assignedTo: member._id, assignedName: user?.name ?? 'Member' } } : { $unset: { assignedTo: 1, assignedName: 1 } })
    if (!updated) return fail('That conversation was not found.')
    await audit(ctx, { action: 'whatsapp.thread_assigned', entity: 'WaThread', entityId: input.threadId, summary: `WhatsApp chat with ${updated.phone} ${member ? `assigned to ${user?.name ?? 'a member'}` : 'unassigned'}` })
    refresh(input.threadId)
    return ok(member ? `Assigned to ${user?.name ?? 'the member'}.` : 'Unassigned.')
  },
  REPLY,
)

export const replyThreadAction = action(
  z.object({ threadId: objectId, text: z.string().trim().min(1, 'Write a reply').max(1000) }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const thread = await ctx.db(WaThread).findById(input.threadId).lean()
    if (!thread) return fail('That conversation was not found.')
    if (isStopped(thread)) return fail('This person replied STOP. Do not message them on WhatsApp.')
    if (!canSendFreeText(thread.lastInboundAt, new Date())) return fail('More than 24 hours have passed since their last message. WhatsApp allows only an approved template now: use "Send follow-up template".')
    const result = await sendWorkspaceText(ctx.orgId, thread.phone, input.text)
    await storeThreadOut(ctx.orgId, thread._id, input.text, result, { memberId: ctx.memberId, name: ctx.user.name })
    await ctx.db(WaThread).updateOne({ _id: thread._id }, { $set: { unread: 0, ...(thread.assignedTo ? {} : { assignedTo: ctx.memberId, assignedName: ctx.user.name }) } })
    refresh(input.threadId)
    return result.ok ? ok('Sent.') : fail(`WhatsApp refused it: ${result.error}`)
  },
  REPLY,
)

/** Outside the 24-hour window: the approved hello / follow-up template (charged like any template). */
export const sendThreadTemplateAction = action(
  z.object({ threadId: objectId }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const thread = await ctx.db(WaThread).findById(input.threadId).lean()
    if (!thread) return fail('That conversation was not found.')
    if (isStopped(thread)) return fail('This person replied STOP. Do not message them on WhatsApp.')
    const values = { name: firstName(thread.match?.label || thread.name || 'there'), sender: firstName(ctx.user.name), business: ctx.org.name }
    const result = await sendWorkspaceTemplate({ orgId: ctx.orgId, to: thread.phone, key: 'contact_followup', values, kind: 'inbox', event: 'whatsapp.inbox_template', entity: 'WaThread', entityId: thread._id, essential: false, userId: ctx.userId, memberId: ctx.memberId, title: `Follow-up template to ${thread.phone}` })
    if (!result.ok && result.status !== 'queued') return fail(`WhatsApp did not take it: ${result.error ?? 'unknown error'}`)
    await storeThreadOut(ctx.orgId, thread._id, previewCustomerTemplate('contact_followup', values), { ok: true, id: '' }, { memberId: ctx.memberId, name: ctx.user.name, messageId: result.id })
    refresh(input.threadId)
    return ok('Template sent. Free replies open again once they write back.')
  },
  REPLY,
)

export const setThreadStatusAction = action(
  z.object({ threadId: objectId, status: z.enum(['open', 'closed']) }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const updated = await ctx.db(WaThread).findOneAndUpdate({ _id: input.threadId }, { $set: { status: input.status, ...(input.status === 'closed' ? { unread: 0 } : {}) } })
    if (!updated) return fail('That conversation was not found.')
    refresh(input.threadId)
    return ok(input.status === 'closed' ? 'Closed.' : 'Reopened.')
  },
  REPLY,
)

/** Attach an invoice or quote of the matched client: sent as the approved document template with its PDF and public link. */
export const sendThreadDocAction = action(
  z.object({ threadId: objectId, kind: z.enum(['invoice', 'quote']), id: objectId }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    if (!ctx.canAny(...DOC_PERMS[input.kind])) return fail(`Your role cannot send ${input.kind === 'invoice' ? 'invoices' : 'quotes'}.`)
    const thread = await ctx.db(WaThread).findById(input.threadId).lean()
    if (!thread) return fail('That conversation was not found.')
    if (isStopped(thread)) return fail('This person replied STOP. Do not message them on WhatsApp.')
    if (thread.match?.kind !== 'client' || !thread.match.id) return fail('Link this chat to a client first: documents go only to their own client.')
    const model = input.kind === 'invoice' ? Invoice : Quote
    const doc = await ctx.db(model as typeof Invoice).findOne({ _id: input.id, clientId: thread.match.id }, { _id: 1 }).lean()
    if (!doc) return fail(`That ${input.kind} is not one of this client's.`)
    const sent = await sendDocOnWhatsApp(ctx, { kind: input.kind, id: input.id, to: thread.phone })
    if (!sent.ok) return fail(`WhatsApp did not take it: ${sent.error ?? 'unknown error'}`)
    await storeThreadOut(ctx.orgId, thread._id, `${input.kind === 'invoice' ? 'Invoice' : 'Quote'} ${sent.number} sent (PDF and link)`, { ok: true, id: '' }, { memberId: ctx.memberId, name: ctx.user.name })
    refresh(input.threadId)
    return ok(`${input.kind === 'invoice' ? 'Invoice' : 'Quote'} ${sent.number} sent on WhatsApp.`)
  },
  REPLY,
)
