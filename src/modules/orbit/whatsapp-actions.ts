'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { firstName } from '@/lib/utils'
import { objectId } from '@/lib/validation'
import { Client } from '@/models/Client'
import { Activity } from '@/models/orbit/Activity'
import { previewCustomerTemplate } from '@/modules/whatsapp/customer-templates'
import { normalizePhone } from '@/modules/whatsapp/phone'
import { sendWorkspaceTemplate } from '@/modules/whatsapp/workspace-send'
import { refreshNextFollowUp } from './next-step'
import { resolveRelated, touchRelated } from './related'
import { assertWhatsAppOn } from '@/modules/features/flags'

/**
 * Orbit's WhatsApp button when the workspace's own number is connected: the
 * approved hello/follow-up template to the lead or contact, logged as a DM
 * activity. (Without a connection the button stays a wa.me link.)
 */
export const sendOrbitWhatsAppAction = action(
  z.object({ leadId: objectId.optional(), clientId: objectId.optional(), contactId: objectId.optional() }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const rel = await resolveRelated(ctx, input)
    const client = !rel.lead && rel.clientId ? await ctx.db(Client).findById(rel.clientId, { name: 1, phone: 1, contacts: 1 }).lean() : null
    const contact = client?.contacts?.find((c) => String(c._id) === input.contactId) ?? null
    const rawPhone = rel.lead?.phone ?? contact?.phone ?? client?.phone ?? null
    const phone = normalizePhone(rawPhone)
    if (!phone) return fail('There is no valid WhatsApp number on this record. Add one first.')
    const name = firstName(rel.lead?.contactName || contact?.name || rel.name)
    const values = { name, sender: firstName(ctx.user.name), business: ctx.org.name }
    const result = await sendWorkspaceTemplate({ orgId: ctx.orgId, to: phone, key: 'contact_followup', values, kind: 'orbit', event: 'orbit.whatsapp_sent', entity: rel.lead ? 'Lead' : 'Client', entityId: rel.leadId ?? rel.clientId, contactId: input.contactId, essential: false, userId: ctx.userId, memberId: ctx.memberId, title: `WhatsApp to ${name}` })
    if (!result.ok && result.status !== 'queued') return fail(`WhatsApp did not take it: ${result.error ?? 'unknown error'}`)
    const now = new Date()
    await ctx.db(Activity).create({ leadId: rel.leadId, dealId: rel.dealId, clientId: rel.clientId, contactId: input.contactId ?? null, type: 'dm', status: 'done', channel: 'whatsapp', title: 'WhatsApp sent', notes: previewCustomerTemplate('contact_followup', values), occurredAt: now, assigneeId: ctx.memberId, createdBy: ctx.memberId })
    await touchRelated(ctx, rel, now)
    await refreshNextFollowUp(ctx, rel)
    await audit(ctx, { action: 'orbit.whatsapp_sent', entity: rel.lead ? 'Lead' : 'Client', entityId: rel.leadId ?? rel.clientId, product: 'orbit', summary: `WhatsApp template sent to ${name} (${phone})` })
    for (const path of ['/app/orbit', '/app/orbit/activities', rel.leadId ? `/app/orbit/leads/${rel.leadId}` : '', input.contactId ? `/app/orbit/contacts/${input.contactId}` : ''].filter(Boolean)) revalidatePath(path)
    return ok(`Sent on WhatsApp to ${name} and logged as a DM.`)
  },
  { product: 'orbit', perm: 'activities.write' },
)
