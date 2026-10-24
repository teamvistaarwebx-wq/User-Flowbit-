import 'server-only'
import type { Types } from 'mongoose'
import { createInvite } from '@/lib/auth/invites'
import { BUILTIN_ROLE_KEYS, BUILTIN_ROLES } from '@/lib/permissions'
import { Invite } from '@/models/Invite'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { assertCanGrant, customRolesOf, describeRole } from '@/modules/settings/role-access'
import { sheetRows } from '../sheet'
import type { Importer } from '../types'
import { unknownHeaders } from './common'
import { checkTeamRows, TEAM_COLUMNS, type TeamRecord } from './team-rules'

/** Team members: each row becomes an invite (a seat) with its role, title and department. */
export const teamImporter: Importer<TeamRecord> = {
  kind: 'team',
  label: 'Team members',
  description: 'Invite your people with their role and department. Each gets an email to join.',
  product: null,
  perm: 'members.manage',
  maxRows: 200,
  columns: TEAM_COLUMNS,
  check: async (sheet, ctx) => {
    const { headers, rows } = sheetRows(sheet)
    const custom = await customRolesOf(ctx)
    const roles = new Map<string, string>([
      ...BUILTIN_ROLE_KEYS.filter((k) => k !== 'owner').flatMap((k) => [[k, k], [BUILTIN_ROLES[k].label.toLowerCase(), k]] as [string, string][]),
      ...custom.flatMap((r) => [[r.key.toLowerCase(), r.key], [r.label.toLowerCase(), r.key]] as [string, string][]),
    ])
    const [members, invites] = await Promise.all([ctx.db(Member).find({}, { userId: 1 }).lean(), ctx.db(Invite).find({ acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }, { email: 1 }).lean()])
    const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { email: 1 }).lean()
    const taken = new Set([...users.map((u) => u.email), ...invites.map((i) => i.email)])
    return { ignored: unknownHeaders(headers, ['email', 'work_email', 'email_address', 'name', 'full_name', 'role', 'title', 'designation', 'department']), rows: checkTeamRows(rows, { roles, taken }) }
  },
  seats: (records) => ({ logins: records.length, roles: records.map((r) => r.role) }),
  commit: async (records, ctx) => {
    const custom = await customRolesOf(ctx)
    for (const role of new Set(records.map((r) => r.role))) assertCanGrant(ctx, describeRole(role, custom).permissions, { role })
    const inviteIds: Types.ObjectId[] = []
    const memberIds: Types.ObjectId[] = []
    for (const r of records) {
      const { invite, member } = await createInvite(ctx, { email: r.email, role: r.role, name: r.name, title: r.title })
      if (r.department) await ctx.db(Member).updateOne({ _id: member._id }, { $set: { department: r.department } })
      inviteIds.push(invite._id as Types.ObjectId)
      memberIds.push(member._id as Types.ObjectId)
    }
    return { created: [{ model: 'Invite', ids: inviteIds }, { model: 'Member', ids: memberIds }], count: records.length }
  },
}
