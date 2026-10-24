'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { escapeRegex } from '@/lib/utils'
import { objectId } from '@/lib/validation'
import { Client } from '@/models/Client'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { OPEN_LEAD_STAGES } from './constants'
import type { RecordHit } from './record-types'
import { dealAccess, leadAccess } from './scope'

const LIMIT = 6

/** Leads, deals and clients in your scope for the record pickers (activity, deal and contact dialogs). */
export const searchRecords = action(
  z.object({ q: z.string().trim().max(80).default(''), kinds: z.array(z.enum(['lead', 'deal', 'client'])).min(1) }),
  async ({ q, kinds }, ctx) => {
    const re = q ? new RegExp(escapeRegex(q), 'i') : null
    const want = new Set(kinds)
    const [leads, deals, clients] = await Promise.all([
      want.has('lead') ? ctx.db(Lead).find({ ...leadAccess(ctx), stage: { $in: [...OPEN_LEAD_STAGES] }, ...(re ? { $and: [{ $or: [{ companyName: re }, { contactName: re }] }] } : {}) }, { companyName: 1, contactName: 1 }).sort({ updatedAt: -1 }).limit(LIMIT).lean() : [],
      want.has('deal') ? ctx.db(Deal).find({ ...dealAccess(ctx), status: 'open', ...(re ? { title: re } : {}) }, { title: 1, clientId: 1 }).sort({ updatedAt: -1 }).limit(LIMIT).lean() : [],
      want.has('client') && ctx.can('clients.read') ? ctx.db(Client).find({ status: { $ne: 'inactive' }, ...(re ? { name: re } : {}) }, { name: 1, status: 1 }).sort({ name: 1 }).limit(LIMIT).lean() : [],
    ])
    const hits: RecordHit[] = [
      ...leads.map((l) => ({ kind: 'lead' as const, id: String(l._id), label: l.companyName, sub: l.contactName || 'Lead' })),
      ...deals.map((d) => ({ kind: 'deal' as const, id: String(d._id), label: d.title, sub: 'Deal', clientId: d.clientId ? String(d.clientId) : undefined })),
      ...clients.map((c) => ({ kind: 'client' as const, id: String(c._id), label: c.name, sub: c.status === 'lead' ? 'Client (lead)' : 'Client' })),
    ]
    return ok(undefined, hits)
  },
  { product: 'orbit', perm: 'orbit.read', allowReadOnly: true },
)

/** Contacts of one client (deal and activity dialogs). */
export const clientContacts = action(
  z.object({ clientId: objectId }),
  async ({ clientId }, ctx) => {
    ctx.assert('clients.read')
    const client = await ctx.db(Client).findById(clientId, { contacts: 1 }).lean()
    const contacts = (client?.contacts ?? []).map((c) => ({ id: String(c._id), name: c.name, role: c.role ?? '', primary: Boolean(c.primary) }))
    return ok(undefined, contacts)
  },
  { perm: 'orbit.read', allowReadOnly: true },
)
