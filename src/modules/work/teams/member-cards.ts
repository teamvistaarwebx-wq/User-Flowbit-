import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { fileUrl } from '@/lib/files'
import { oid } from '@/lib/serialize'
import { Project } from '@/models/work/Project'
import { Member } from '@/models/Member'
import { isTimeZone } from '@/lib/skills'
import { projectAccessMatch } from '@/modules/work/projects/access'
import { presenceToday } from '@/modules/work/presence'
import { presenceText, type Presence } from '@/modules/work/presence-core'
import { getPeople } from '@/modules/work/tasks/people'
import { teamWorkload } from './queries'
import { periodRange } from './workload'

export type MemberProject = { id: string; name: string; code: string; color: string; logoUrl?: string }
export type MemberExtras = { avatarUrl?: string; presence: Presence; presenceText: string; load: number; planned: number; open: number; overdue: number; projects: MemberProject[]; skills: string[]; timezone: string }

/** Projects still running (their logos show on member cards). */
const LIVE = { archivedAt: null, status: { $nin: ['completed', 'cancelled'] } }

/**
 * What a team's member cards show beyond name and role: today's presence (Muster), this
 * week's load, open work and the projects each person is on (only projects the viewer may see).
 */
export async function memberExtras(ctx: Ctx, memberIds: string[]): Promise<Map<string, MemberExtras>> {
  if (!memberIds.length) return new Map()
  const today = todayIST()
  const ids = memberIds.map(oid)
  const [presence, workload, people, projects, members] = await Promise.all([
    presenceToday(ctx, memberIds),
    teamWorkload(ctx, memberIds, periodRange('this_week', today), today),
    getPeople(ctx),
    ctx.db(Project)
      .find({ ...LIVE, $and: [{ $or: [{ leadId: { $in: ids } }, { memberIds: { $in: ids } }] }, projectAccessMatch(String(ctx.memberId), ctx.can('projects.write'), oid)] }, { name: 1, code: 1, color: 1, logoFileId: 1, leadId: 1, memberIds: 1 })
      .sort({ name: 1 })
      .lean(),
    ctx.db(Member).find({ _id: { $in: ids } }, { skills: 1, timezone: 1 }).lean(),
  ])
  const orgZone = isTimeZone(ctx.org.timezone) ? ctx.org.timezone : 'Asia/Kolkata'
  const profile = new Map(members.map((m) => [String(m._id), { skills: m.skills ?? [], timezone: isTimeZone(m.timezone) ? m.timezone : orgZone }]))
  const avatarOf = new Map(people.map((p) => [p.id, p.avatarUrl]))
  return new Map(
    memberIds.map((id) => {
      const p = presence.get(id) ?? { state: 'out' as const }
      const w = workload.find((r) => r.id === id)
      const mine = projects
        .filter((pr) => String(pr.leadId) === id || (pr.memberIds ?? []).some((m) => String(m) === id))
        .map((pr) => ({ id: String(pr._id), name: pr.name, code: pr.code, color: pr.color ?? '#818CF8', ...(pr.logoFileId ? { logoUrl: fileUrl(pr.logoFileId) } : {}) }))
      return [id, { avatarUrl: avatarOf.get(id), presence: p, presenceText: presenceText(p), load: w?.load ?? 0, planned: w?.planned ?? 0, open: w?.open ?? 0, overdue: w?.overdue ?? 0, projects: mine, ...(profile.get(id) ?? { skills: [], timezone: orgZone }) }]
    }),
  )
}
