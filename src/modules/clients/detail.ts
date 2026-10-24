import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { AuditLog } from '@/models/AuditLog'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { StageEvent } from '@/models/orbit/StageEvent'
import { toActivityItems } from '@/modules/orbit/activity-items'
import { LEAD_STAGE_LABEL, type LeadStage } from '@/modules/orbit/constants'
import { dealStageLabel } from '@/modules/orbit/dealStage'
import { projectAccessMatch } from '@/modules/work/projects/access'
import { clientBalances } from '@/modules/orbit/folio-links'
import { nameOf, type PeopleIndex } from '@/modules/orbit/people'
import { activityAccess, dealAccess, leadAccess } from '@/modules/orbit/scope'
import type { OrbitConfig } from '@/modules/orbit/settings'
import { clientColumns } from './queries'
import { workModels } from './references'

const visibleProjects = (ctx: Ctx) => projectAccessMatch(String(ctx.memberId), ctx.can('projects.write'), (id) => new Types.ObjectId(id))

/** KPI tiles and recent activity for the Overview tab. */
export async function clientOverview(ctx: Ctx, clientId: Types.ObjectId, people: PeopleIndex) {
  const cols = clientColumns(ctx)
  const work = cols.work ? await workModels() : null
  const [open, won, projects, balances, recent] = await Promise.all([
    cols.orbit ? ctx.db(Deal).find({ ...dealAccess(ctx), clientId, status: 'open' }, { valuePaise: 1 }).lean() : [],
    cols.orbit ? ctx.db(Deal).find({ ...dealAccess(ctx), clientId, status: 'won' }, { valuePaise: 1 }).lean() : [],
    work ? ctx.db(work.Project).countDocuments({ ...visibleProjects(ctx), clientId, status: { $in: ['planning', 'active', 'on_hold'] } }) : 0,
    cols.folio ? clientBalances(ctx, clientId, todayIST()) : { outstandingPaise: 0, overduePaise: 0 },
    cols.orbit ? ctx.db(Activity).find({ ...(await activityAccess(ctx)), clientId, status: 'done' }).sort({ occurredAt: -1, _id: -1 }).limit(5).lean() : [],
  ])
  return {
    cols,
    openPaise: open.reduce((s, d) => s + d.valuePaise, 0),
    wonPaise: won.reduce((s, d) => s + d.valuePaise, 0),
    projects,
    ...balances,
    recent: await toActivityItems(ctx, recent, people),
  }
}

export async function clientDeals(ctx: Ctx, clientId: Types.ObjectId) {
  const [deals, leads] = await Promise.all([
    ctx.db(Deal).find({ ...dealAccess(ctx), clientId }).sort({ status: 1, updatedAt: -1 }).lean(),
    ctx.db(Lead).find({ ...leadAccess(ctx), clientId }, { companyName: 1, convertedAt: 1, dealId: 1 }).lean(),
  ])
  return { deals, leads }
}

export async function clientProjects(ctx: Ctx, clientId: Types.ObjectId) {
  const work = await workModels()
  if (!work) return null
  // Only projects this member can open (Work spec A5.2): names and links are part of what the project hides.
  return ctx.db(work.Project).find({ ...visibleProjects(ctx), clientId }).sort({ updatedAt: -1 }).limit(100).lean()
}

export type ClientEvent = { id: string; at: Date; title: string; detail?: string; who: string; kind: 'activity' | 'stage' | 'audit'; href?: string }

/** Orbit activity, deal/lead stage changes and audit entries for one client, newest first. */
export async function clientActivity(ctx: Ctx, clientId: Types.ObjectId, cfg: OrbitConfig, people: PeopleIndex): Promise<{ activities: Awaited<ReturnType<typeof toActivityItems>>; events: ClientEvent[] }> {
  const showOrbit = ctx.has('orbit') && ctx.can('orbit.read')
  const [activities, deals, leads, audits] = await Promise.all([
    showOrbit ? ctx.db(Activity).find({ ...(await activityAccess(ctx)), clientId, status: 'done' }).sort({ occurredAt: -1, _id: -1 }).limit(50).lean() : [],
    showOrbit ? ctx.db(Deal).find({ ...dealAccess(ctx), clientId }, { title: 1 }).lean() : [],
    showOrbit ? ctx.db(Lead).find({ ...leadAccess(ctx), clientId }, { companyName: 1 }).lean() : [],
    ctx.db(AuditLog).find({ entity: 'Client', entityId: String(clientId) }).sort({ createdAt: -1 }).limit(50).lean(),
  ])
  const names = new Map<string, { label: string; href: string; entity: 'lead' | 'deal' }>([
    ...deals.map((d) => [String(d._id), { label: d.title, href: `/app/orbit/deals/${d._id}`, entity: 'deal' as const }] as const),
    ...leads.map((l) => [String(l._id), { label: l.companyName, href: `/app/orbit/leads/${l._id}`, entity: 'lead' as const }] as const),
  ])
  const stageRows = names.size ? await ctx.db(StageEvent).find({ entityId: { $in: [...deals.map((d) => d._id), ...leads.map((l) => l._id)] } }).sort({ changedAt: -1 }).limit(80).lean() : []
  const label = (entity: string, s: string) => (entity === 'lead' ? (LEAD_STAGE_LABEL[s as LeadStage] ?? s) : dealStageLabel(cfg.dealStages, s))
  const events: ClientEvent[] = [
    ...stageRows.map((e) => {
      const ref = names.get(String(e.entityId))
      return { id: `s-${e._id}`, at: e.changedAt, kind: 'stage' as const, title: `${ref?.entity === 'deal' ? 'Deal' : 'Lead'} ${ref?.label ?? ''}: ${e.fromStage ? `${label(e.entity, e.fromStage)} → ` : 'created at '}${label(e.entity, e.toStage)}`, who: e.changedBy ? nameOf(people, e.changedBy) : 'System', href: ref?.href }
    }),
    ...audits.map((a) => ({ id: `a-${a._id}`, at: a.createdAt, kind: 'audit' as const, title: a.summary, who: a.actorName ?? 'Someone' })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return { activities: await toActivityItems(ctx, activities, people), events }
}
