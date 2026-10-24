import 'server-only'
import type { Types } from 'mongoose'
import { scoped } from '@/lib/db/scoped'
import { Client } from '@/models/Client'
import { userIdsWithPermission } from '@/lib/notify'
import { Member } from '@/models/Member'
import { Employee } from '@/models/muster/Employee'
import { Lead } from '@/models/orbit/Lead'
import { User } from '@/models/User'
import { recipientsFor } from '@/modules/folio/mail'

/** Who an automation reaches: the client's billing contacts, or people in the workspace. */

export type Owners = Readonly<{ userIds: string[]; memberId: Types.ObjectId | null }>

/** Active owners (User ids) and the first owner's Member id (tasks are assigned to them). */
export async function workspaceOwners(orgId: Types.ObjectId): Promise<Owners> {
  const owners = await Member.find({ orgId, role: 'owner', status: 'active' }, { userId: 1 }).sort({ joinedAt: 1 }).lean()
  return { userIds: owners.map((o) => String(o.userId)), memberId: owners[0]?._id ?? null }
}

export type ClientContact = Readonly<{ emails: string[]; phone: string | null; name: string }>

/** The client's invoice recipients (as documents are sent) and a phone for WhatsApp. */
export async function clientContact(orgId: Types.ObjectId, clientId: string): Promise<ClientContact | null> {
  const scope = { orgId, db: <M extends Parameters<typeof scoped>[0]>(model: M) => scoped(model, orgId) }
  const client = await scope.db(Client).findById(clientId, { name: 1, phone: 1, contacts: 1 }).lean()
  if (!client) return null
  const recipients = await recipientsFor(scope, clientId, 'invoices')
  const contact = client.contacts?.find((c) => c.primary && c.phone) ?? client.contacts?.find((c) => c.phone)
  return { emails: recipients.map((r) => r.email), phone: contact?.phone ?? client.phone ?? null, name: client.name }
}

export async function userEmail(userId: string): Promise<string | null> {
  const user = await User.findById(userId, { email: 1 }).lean()
  return user?.email ?? null
}

/** A lead's own email and phone (the "welcome" message). */
export async function leadContact(orgId: Types.ObjectId, leadId: string): Promise<ClientContact | null> {
  const lead = await scoped(Lead, orgId).findById(leadId, { email: 1, phone: 1, contactName: 1, companyName: 1 }).lean()
  if (!lead) return null
  return { emails: lead.email ? [lead.email] : [], phone: lead.phone || null, name: lead.contactName || lead.companyName }
}

/** An employee's email (personal first: a new joiner may not have work mail yet) and phone. */
export async function employeeContact(orgId: Types.ObjectId, employeeId: string, opts: { personalFirst?: boolean } = {}): Promise<ClientContact | null> {
  const e = await scoped(Employee, orgId).findById(employeeId, { workEmail: 1, personalEmail: 1, phone: 1, fullName: 1 }).lean()
  if (!e) return null
  const order = opts.personalFirst ? [e.personalEmail, e.workEmail] : [e.workEmail, e.personalEmail]
  const email = order.find((x) => x && x.includes('@'))
  return { emails: email ? [email] : [], phone: e.phone ?? null, name: e.fullName }
}

const ROLE_PERMISSION = { hr: 'leave.manage', sales_manager: 'orbit.close', accountant: 'folio.settings' } as const

/** Workspace people by role in an automation: HR, sales managers, accounts, or everyone active. */
export async function roleUsers(orgId: Types.ObjectId, role: keyof typeof ROLE_PERMISSION | 'team'): Promise<string[]> {
  if (role === 'team') return (await Member.find({ orgId, status: 'active' }, { userId: 1 }).lean()).map((m) => String(m.userId))
  return (await userIdsWithPermission(orgId, ROLE_PERMISSION[role])).map(String)
}
