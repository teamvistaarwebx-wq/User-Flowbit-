import 'server-only'
import { Types, type Model } from 'mongoose'
import type { OrgDb } from '@/modules/subscription/usage'
import { Client } from '@/models/Client'
import { Member } from '@/models/Member'
import { Notification } from '@/models/Notification'
import { User } from '@/models/User'
import { Brief } from '@/models/messaging/Brief'
import { ConsentLog } from '@/models/messaging/ConsentLog'
import { Message } from '@/models/messaging/Message'
import { NotificationPrefs } from '@/models/messaging/NotificationPrefs'
import { Suppression } from '@/models/messaging/Suppression'
import { Employee } from '@/models/muster/Employee'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { SequenceEnrollment } from '@/models/orbit/SequenceEnrollment'
import { StageEvent } from '@/models/orbit/StageEvent'
import { PortalCode } from '@/models/portal/PortalCode'
import { PortalContact } from '@/models/portal/PortalContact'
import { PortalSession } from '@/models/portal/PortalSession'
import { WaBotSession } from '@/models/whatsapp/WaBotSession'
import { WaThread } from '@/models/whatsapp/WaThread'
import { WaThreadMessage } from '@/models/whatsapp/WaThreadMessage'
import { cleanValue } from '@/modules/lifecycle/export'
import { identifiers, type Match, type PrivacyCollection, type PrivacyStore, type Subject, type SubjectRef } from './core'

/**
 * The database side of per-person export and erasure. Every query goes
 * through the workspace-scoped `db` (orgId injected), so one workspace's
 * request can never read or change another's rows.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODELS: Record<PrivacyCollection, Model<any>> = {
  Message,
  ConsentLog,
  Suppression,
  WaThread,
  WaThreadMessage,
  WaBotSession,
  Activity,
  StageEvent,
  Deal,
  Notification,
  Brief,
  NotificationPrefs,
  PortalContact,
  PortalSession,
  PortalCode,
  SequenceEnrollment,
}

/** Message bodies and sign-in secrets (hashes) are left out of the export; the log keeps who, when, channel and status. */
const PROJECTION: Partial<Record<PrivacyCollection, Record<string, 0>>> = { Message: { html: 0, text: 0, headers: 0 }, PortalSession: { tokenHash: 0 }, PortalCode: { codeHash: 0 } }
const MAX_ROWS = 5_000

const filterOf = (m: Match) => ({ [m.field]: { $in: [...m.anyOf] } })
const valid = (id: string) => Types.ObjectId.isValid(id)

/** The person as this workspace holds them, or null when the record is not in this workspace. */
export async function loadSubject(target: OrgDb, ref: SubjectRef): Promise<Subject | null> {
  if (ref.kind === 'lead') {
    if (!valid(ref.leadId)) return null
    const lead = await target.db(Lead).findById(ref.leadId).lean()
    if (!lead) return null
    return { ref, record: cleanValue(lead) as Record<string, unknown>, ...identifiers({ emails: [lead.email], phones: [lead.phone] }) }
  }
  if (ref.kind === 'contact') {
    if (!valid(ref.clientId) || !valid(ref.contactId)) return null
    const client = await target.db(Client).findById(ref.clientId, { name: 1, contacts: 1 }).lean()
    const contact = client?.contacts?.find((c) => String(c._id) === ref.contactId)
    if (!client || !contact) return null
    return { ref, record: { client: client.name, ...(cleanValue(contact) as Record<string, unknown>) }, ...identifiers({ emails: [contact.email], phones: [contact.phone] }) }
  }
  if (!valid(ref.memberId)) return null
  const member = await target.db(Member).findById(ref.memberId).lean()
  if (!member) return null
  // The login is the person's own (it may belong to other workspaces too): read only, never changed here.
  const [user, employee] = await Promise.all([
    User.findById(member.userId, { name: 1, email: 1, phone: 1, whatsapp: 1 }).lean(),
    member.employeeId ? target.db(Employee).findById(member.employeeId).lean() : null,
  ])
  const ids = identifiers({ emails: [user?.email, employee?.workEmail, employee?.personalEmail], phones: [user?.phone, employee?.phone] })
  return {
    ref,
    record: cleanValue({ member, login: user ? { name: user.name, email: user.email, phone: user.phone } : null, employee }) as Record<string, unknown>,
    ...ids,
    userId: String(member.userId),
    active: member.status === 'active',
  }
}

export function mongoPrivacyStore(target: OrgDb): PrivacyStore {
  return {
    async find(collection, match) {
      const rows = await target.db(MODELS[collection]).find(filterOf(match), PROJECTION[collection] ?? {}).limit(MAX_ROWS).lean()
      return rows.map((r) => cleanValue(r) as Record<string, unknown>)
    },
    async apply(collection, match, erase) {
      const scoped = target.db(MODELS[collection])
      if (erase.kind === 'delete') return (await scoped.deleteMany(filterOf(match))).deletedCount ?? 0
      const update = { ...(Object.keys(erase.set).length ? { $set: erase.set } : {}), ...(erase.unset.length ? { $unset: Object.fromEntries(erase.unset.map((f) => [f, 1])) } : {}) }
      return (await scoped.updateMany(filterOf(match), update)).modifiedCount ?? 0
    },
    async eraseRecord(subject) {
      const ref = subject.ref
      if (ref.kind === 'lead') await target.db(Lead).deleteOne({ _id: ref.leadId })
      if (ref.kind === 'contact') await target.db(Client).updateOne({ _id: ref.clientId }, { $pull: { contacts: { _id: new Types.ObjectId(ref.contactId) } } })
      // A member record stays (tasks, approvals and the audit log point at it); their workspace details go.
      if (ref.kind === 'member') await target.db(Member).updateOne({ _id: ref.memberId, status: { $ne: 'active' } }, { $unset: { title: 1, department: 1 } })
    },
  }
}
