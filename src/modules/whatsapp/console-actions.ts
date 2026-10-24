'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, ok } from '@/lib/actions'
import { consoleAction } from '@/lib/console/session'
import { objectId } from '@/lib/validation'
import { Staff } from '@/models/console/Staff'
import { WaConversation } from '@/models/whatsapp/WaConversation'
import { sendSessionText, storeOutgoing } from './inbox'
import { canSendFreeText } from './webhook-event'
import { assertWhatsAppOn } from '@/modules/features/flags'

/**
 * Console inbox actions for WhatsApp A (console spec 10): assign, reply
 * (free text only inside 24 hours of the person's last message), close.
 * Role checked on the server; each one leaves a per-staff audit row.
 */

const refresh = (id: string) => {
  revalidatePath('/console/messages')
  revalidatePath(`/console/messages/${id}`)
}

export const assignConversation = consoleAction('inbox.reply', z.object({ conversationId: objectId, staffId: z.union([objectId, z.literal('none')]) }), async (input, p) => {
  await assertWhatsAppOn()
  const staff = input.staffId === 'none' ? null : await p.raw(Staff).findOne({ _id: input.staffId, status: 'active' }, { name: 1 }).lean()
  if (input.staffId !== 'none' && !staff) return fail('That staff member is not active.')
  const conversation = await p.raw(WaConversation).findByIdAndUpdate(input.conversationId, staff ? { $set: { assignedTo: staff._id, assignedName: staff.name } } : { $unset: { assignedTo: 1, assignedName: 1 } }, { returnDocument: 'after' }).lean()
  if (!conversation) return fail('That conversation was not found.')
  await p.audit({ action: 'inbox.assigned', summary: `WhatsApp conversation ${conversation.phone} ${staff ? `assigned to ${staff.name}` : 'unassigned'}` })
  refresh(input.conversationId)
  return ok(staff ? `Assigned to ${staff.name}.` : 'Unassigned; the auto-reply is back on.')
})

export const replyToConversation = consoleAction('inbox.reply', z.object({ conversationId: objectId, text: z.string().trim().min(1, 'Write a reply').max(1000) }), async (input, p) => {
  await assertWhatsAppOn()
  const conversation = await p.raw(WaConversation).findById(input.conversationId).lean()
  if (!conversation) return fail('That conversation was not found.')
  const stopped = conversation.stoppedAt && (!conversation.lastInboundAt || conversation.stoppedAt >= conversation.lastInboundAt)
  if (stopped) return fail('This person replied STOP. Do not message them on WhatsApp; use email.')
  if (!canSendFreeText(conversation.lastInboundAt, new Date())) return fail('More than 24 hours have passed since their last message. WhatsApp allows only an approved template now; reply by email instead.')
  const result = await sendSessionText(conversation.phone, input.text)
  await storeOutgoing(conversation._id, input.text, result, { staffId: p.staff.id, staffName: p.staff.name })
  await p.raw(WaConversation).updateOne({ _id: conversation._id }, { $set: { unread: 0, ...(conversation.assignedTo ? {} : { assignedTo: p.staff.id, assignedName: p.staff.name }) } })
  await p.audit({ action: 'inbox.replied', summary: `Replied on WhatsApp to ${conversation.phone}${result.ok ? '' : ` (failed: ${result.error})`}` })
  refresh(input.conversationId)
  return result.ok ? ok('Sent.') : fail(`WhatsApp refused it: ${result.error}`)
})

export const setConversationStatus = consoleAction('inbox.reply', z.object({ conversationId: objectId, status: z.enum(['open', 'closed']) }), async (input, p) => {
  await assertWhatsAppOn()
  const updated = await p.raw(WaConversation).findByIdAndUpdate(input.conversationId, { $set: { status: input.status, ...(input.status === 'closed' ? { unread: 0 } : {}) } }, { returnDocument: 'after' }).lean()
  if (!updated) return fail('That conversation was not found.')
  await p.audit({ action: 'inbox.status', summary: `WhatsApp conversation ${updated.phone} ${input.status}` })
  refresh(input.conversationId)
  return ok(input.status === 'closed' ? 'Closed.' : 'Reopened.')
})
