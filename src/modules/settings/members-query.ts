import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { timeAgo, formatDate } from '@/lib/dates'
import { fileUrl } from '@/lib/files'
import { escapeRegex } from '@/lib/utils'
import { BUILTIN_ROLE_KEYS, BUILTIN_ROLES, roleLabel } from '@/lib/permissions'
import { Invite } from '@/models/Invite'
import { Member } from '@/models/Member'
import { Session } from '@/models/Session'
import { User } from '@/models/User'
import { Employee } from '@/models/muster/Employee'
import { PAYROLL_STATUSES } from '@/modules/muster/people/lifecycle'
import { customRolesOf } from './role-access'
import { missingGrants } from './roles'

export type RoleOption = { value: string; label: string; hint?: string }
export type MemberRow = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  role: string
  roleLabel: string
  title: string
  department: string
  managerId: string
  status: 'active' | 'disabled'
  employee: { id: string; code: string } | null
  lastActive: string
  isYou: boolean
  isOwner: boolean
  /** Two-factor sign-in is on (admins can reset it). */
  twoFactor: boolean
}
export type InviteRow = { memberId: string; email: string; name: string; roleLabel: string; invitedBy: string; sent: string; expires: string; expired: boolean }

const PAGE_SIZE = 50

/** Roles the viewer may hand out (anti-escalation), built-ins first. Owner is never offered. */
export async function assignableRoles(ctx: Ctx): Promise<{ options: RoleOption[]; customRoles: Awaited<ReturnType<typeof customRolesOf>> }> {
  const customRoles = await customRolesOf(ctx)
  const allowed = (perms: readonly string[]) => ctx.isOwner || missingGrants(ctx.permissions, perms).length === 0
  const options: RoleOption[] = [
    ...BUILTIN_ROLE_KEYS.filter((k) => k !== 'owner' && allowed(BUILTIN_ROLES[k].permissions)).map((k) => ({ value: k, label: BUILTIN_ROLES[k].label })),
    ...customRoles.filter((r) => allowed(r.permissions)).map((r) => ({ value: String(r._id), label: r.label, hint: 'Custom' })),
  ]
  return { options, customRoles }
}

async function lastActiveByUser(ctx: Ctx, userIds: Types.ObjectId[]): Promise<Map<string, Date>> {
  const sessions = await Session.find({ userId: { $in: userIds }, activeOrgId: ctx.orgId }, { userId: 1, lastSeenAt: 1 }).lean()
  return sessions.reduce((map, s) => {
    const key = String(s.userId)
    const at = s.lastSeenAt ? new Date(s.lastSeenAt) : null
    if (at && (!map.get(key) || at > map.get(key)!)) map.set(key, at)
    return map
  }, new Map<string, Date>())
}

/** The People table: active and disabled members, filtered and paged. */
export async function listMembers(ctx: Ctx, filters: { q: string; status?: string; role?: string; page: number }) {
  const customRoles = await customRolesOf(ctx)
  const statusFilter = filters.status === 'active' || filters.status === 'disabled' ? filters.status : { $in: ['active', 'disabled'] }
  const userFilter = filters.q ? { $or: [{ name: new RegExp(escapeRegex(filters.q), 'i') }, { email: new RegExp(escapeRegex(filters.q), 'i') }] } : null
  const memberUserIds = userFilter ? await ctx.db(Member).distinct('userId') : null
  const matchingUsers = userFilter ? await User.find({ _id: { $in: memberUserIds }, ...userFilter }, { _id: 1 }).lean() : null
  const filter = {
    status: statusFilter,
    ...(filters.role ? { role: filters.role } : {}),
    ...(matchingUsers ? { userId: { $in: matchingUsers.map((u) => u._id) } } : {}),
  }
  const [members, total] = await Promise.all([
    ctx.db(Member).find(filter).sort({ status: 1, joinedAt: 1 }).skip((filters.page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    ctx.db(Member).countDocuments(filter),
  ])
  const userIds = members.map((m) => m.userId)
  const [users, lastActive, employees] = await Promise.all([
    User.find({ _id: { $in: userIds } }, { name: 1, email: 1, avatarFileId: 1, 'twoFactor.enabledAt': 1 }).lean(),
    lastActiveByUser(ctx, userIds),
    ctx.has('muster') ? ctx.db(Employee).find({ _id: { $in: members.map((m) => m.employeeId).filter(Boolean) } }, { code: 1 }).lean() : [],
  ])
  const rows: MemberRow[] = members.map((m) => {
    const user = users.find((u) => String(u._id) === String(m.userId))
    const employee = employees.find((e) => String(e._id) === String(m.employeeId))
    const seen = lastActive.get(String(m.userId))
    return {
      id: String(m._id),
      name: user?.name ?? 'Unknown',
      email: user?.email ?? '',
      avatarUrl: user?.avatarFileId ? fileUrl(user.avatarFileId) : null,
      role: m.role,
      roleLabel: roleLabel(m.role, customRoles),
      title: m.title ?? '',
      department: m.department ?? '',
      managerId: m.managerId ? String(m.managerId) : '',
      status: m.status === 'disabled' ? 'disabled' : 'active',
      employee: employee ? { id: String(employee._id), code: employee.code } : null,
      lastActive: seen ? timeAgo(seen) : 'Never',
      isYou: String(m._id) === String(ctx.memberId),
      isOwner: m.role === 'owner',
      twoFactor: Boolean(user?.twoFactor?.enabledAt),
    }
  })
  return { rows, total, pageSize: PAGE_SIZE }
}

/** Pending and expired invitations (invited members and their latest invite). */
export async function listInvitations(ctx: Ctx): Promise<InviteRow[]> {
  const invited = await ctx.db(Member).find({ status: 'invited' }).sort({ createdAt: -1 }).limit(200).lean()
  if (!invited.length) return []
  const [invites, users, customRoles] = await Promise.all([
    ctx.db(Invite).find({ memberId: { $in: invited.map((m) => m._id) } }).sort({ createdAt: -1 }).lean(),
    User.find({ _id: { $in: invited.map((m) => m.userId) } }, { name: 1, email: 1 }).lean(),
    customRolesOf(ctx),
  ])
  const inviters = await User.find({ _id: { $in: invites.map((i) => i.invitedBy).filter(Boolean) } }, { name: 1 }).lean()
  const now = new Date()
  return invited.map((m) => {
    const invite = invites.find((i) => String(i.memberId) === String(m._id))
    const user = users.find((u) => String(u._id) === String(m.userId))
    const expiresAt = invite ? new Date(invite.expiresAt) : now
    const expired = !invite || Boolean(invite.revokedAt) || expiresAt <= now
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000)
    return {
      memberId: String(m._id),
      email: invite?.email ?? user?.email ?? '',
      name: invite?.name ?? user?.name ?? '',
      roleLabel: roleLabel(m.role, customRoles),
      invitedBy: inviters.find((u) => String(u._id) === String(invite?.invitedBy))?.name ?? '—',
      sent: invite?.sentAt ? timeAgo(invite.sentAt) : '—',
      expires: expired ? `Expired ${formatDate(expiresAt, { short: true })}` : `in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`,
      expired,
    }
  })
}

/** On-payroll employees without a login, for "Link to employee record" in the invite dialog. */
export async function linkableEmployees(ctx: Ctx) {
  if (!ctx.has('muster') || !ctx.can('people.read')) return []
  const rows = await ctx.db(Employee).find({ status: { $in: PAYROLL_STATUSES }, deletedAt: null, $or: [{ memberId: null }, { memberId: { $exists: false } }] }, { code: 1, firstName: 1, lastName: 1, workEmail: 1 }).sort({ firstName: 1 }).limit(500).lean()
  return rows.map((e) => ({ id: String(e._id), label: `${e.firstName} ${e.lastName ?? ''}`.trim(), code: e.code, email: e.workEmail ?? '' }))
}

/** Active members as manager options. */
export async function managerOptions(ctx: Ctx) {
  const members = await ctx.db(Member).find({ status: 'active' }, { userId: 1 }).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1 }).lean()
  return members
    .map((m) => ({ value: String(m._id), label: users.find((u) => String(u._id) === String(m.userId))?.name ?? 'Unknown' }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
