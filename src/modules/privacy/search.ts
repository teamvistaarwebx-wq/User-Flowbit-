import 'server-only'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { Lead } from '@/models/orbit/Lead'
import { normalizePhone, phonePattern } from '@/modules/whatsapp/phone'
import type { OrgDb } from '@/modules/subscription/usage'
import type { SubjectRef } from './core'

/** A person found by email or phone in this workspace (Settings → Privacy). */
export type FoundSubject = Readonly<{ ref: SubjectRef; kind: SubjectRef['kind']; name: string; detail: string }>

const LIMIT = 20

/**
 * Client contacts, leads and members whose email (exact, any case) or phone
 * (however it was typed) matches. Every query is scoped to the workspace.
 */
export async function findSubjects(target: OrgDb, query: string): Promise<FoundSubject[]> {
  const text = query.trim()
  if (text.length < 5) return []
  const email = text.includes('@') ? text.toLowerCase() : null
  const phone = email ? null : normalizePhone(text)
  if (!email && !phone) return []
  const emailRe = email ? new RegExp(`^${escapeRegex(email)}$`, 'i') : null
  const phoneRe = phone ? phonePattern(phone) : null
  const on = (field: string) => (emailRe ? { [field]: emailRe } : { [field]: phoneRe })
  const [leads, clients, users] = await Promise.all([
    target.db(Lead).find(emailRe ? on('email') : on('phone'), { companyName: 1, contactName: 1, email: 1, phone: 1 }).limit(LIMIT).lean(),
    target.db(Client).find(emailRe ? on('contacts.email') : on('contacts.phone'), { name: 1, contacts: 1 }).limit(LIMIT).lean(),
    User.find(emailRe ? on('email') : on('phone'), { _id: 1, name: 1, email: 1 }).limit(LIMIT).lean(),
  ])
  const members = users.length ? await target.db(Member).find({ userId: { $in: users.map((u) => u._id) } }, { userId: 1, status: 1, role: 1 }).lean() : []
  const contactMatches = (c: { email?: string | null; phone?: string | null }) => (emailRe ? emailRe.test(c.email ?? '') : phoneRe!.test(c.phone ?? ''))
  return [
    ...clients.flatMap((client) => (client.contacts ?? []).filter(contactMatches).map((c): FoundSubject => ({ ref: { kind: 'contact', clientId: String(client._id), contactId: String(c._id) }, kind: 'contact', name: c.name, detail: `Contact at ${client.name}` }))),
    ...leads.map((l): FoundSubject => ({ ref: { kind: 'lead', leadId: String(l._id) }, kind: 'lead', name: l.contactName || l.companyName, detail: `Lead · ${l.companyName}` })),
    ...members.map((m): FoundSubject => {
      const user = users.find((u) => String(u._id) === String(m.userId))
      return { ref: { kind: 'member', memberId: String(m._id) }, kind: 'member', name: user?.name ?? 'Member', detail: `Team member · ${m.status}` }
    }),
  ]
}
