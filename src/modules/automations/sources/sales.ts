import 'server-only'
import type { Types } from 'mongoose'
import { formatINR } from '@/lib/money'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { getOrbitSettings } from '@/modules/orbit/settings'
import type { RunSubject } from '../types'
import { instantRange, SCAN_LIMIT, type OrgScope, type Source } from './common'

/** Orbit records for the Sales recipes: new leads nobody has contacted, deals idle in a stage. */

const DAY_MS = 86_400_000

async function memberUsers(scope: OrgScope, memberIds: readonly (Types.ObjectId | null | undefined)[]) {
  const ids = memberIds.filter((id): id is Types.ObjectId => Boolean(id))
  const members = ids.length ? await scope.db(Member).find({ _id: { $in: ids }, status: 'active' }, { userId: 1 }).lean() : []
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1 }).lean()
  const names = new Map(users.map((u) => [String(u._id), u.name]))
  return new Map(members.map((m) => [String(m._id), { userId: String(m.userId), name: names.get(String(m.userId)) ?? '' }]))
}

/** Leads still in "new" with no contact recorded, whose arrival time fell in the window. */
export const leadCreated: Source = async (scope, { window }) => {
  const range = instantRange(window)
  if (!range) return []
  const leads = await scope.db(Lead).find({ stage: 'new', contactedAt: null, createdAt: range }, { companyName: 1, contactName: 1, source: 1, phone: 1, email: 1, ownerId: 1, stage: 1 }).limit(SCAN_LIMIT).lean()
  const [people, cfg] = await Promise.all([memberUsers(scope, leads.map((l) => l.ownerId)), getOrbitSettings({ db: scope.db })])
  const sourceLabel = new Map(cfg.sources.map((s) => [s.key, s.label]))
  return leads.map((l): RunSubject => {
    const owner = people.get(String(l.ownerId))
    return {
      entity: 'Lead',
      entityId: String(l._id),
      vars: { lead_name: l.contactName || l.companyName, company_name: l.companyName, lead_source: sourceLabel.get(l.source) ?? l.source, lead_phone: l.phone ?? '', lead_email: l.email ?? '', assignee_name: owner?.name ?? '', business_name: scope.orgName, lead_stage: l.stage, contacted: 'no' },
      refs: { leadId: String(l._id), href: `/app/orbit/leads/${l._id}`, users: { assignee: owner ? [owner.userId] : [] } },
    }
  })
}

/** Open deals whose last stage change fell in the window; a later move to another stage starts a new count. */
export const dealStageIdle: Source = async (scope, { window, now }) => {
  const range = instantRange(window)
  if (!range) return []
  const deals = await scope.db(Deal).find({ status: 'open', stageChangedAt: range }, { title: 1, valuePaise: 1, ownerId: 1, stage: 1, stageChangedAt: 1 }).limit(SCAN_LIMIT).lean()
  const [people, cfg] = await Promise.all([memberUsers(scope, deals.map((d) => d.ownerId)), getOrbitSettings({ db: scope.db })])
  const stageLabel = new Map(cfg.dealStages.map((s) => [s.key, s.label]))
  return deals.map((d): RunSubject => {
    const owner = people.get(String(d.ownerId))
    return {
      entity: 'Deal',
      entityId: String(d._id),
      occurrence: d.stageChangedAt.toISOString(),
      vars: { deal_title: d.title, deal_value: formatINR(d.valuePaise), owner_name: owner?.name ?? '', stage_name: stageLabel.get(d.stage) ?? d.stage, days_idle: Math.floor((now.getTime() - d.stageChangedAt.getTime()) / DAY_MS), business_name: scope.orgName },
      refs: { href: `/app/orbit/deals/${d._id}`, users: { assignee: owner ? [owner.userId] : [] } },
    }
  })
}
