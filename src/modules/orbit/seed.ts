/**
 * Orbit demo data: settings, a "BD executive" custom role, the Orbit clients
 * (upserted by name so Work and Folio can reuse them), ~148 leads with a
 * guard-consistent history, ~10 deals across stages, and their activities.
 * Models and pure helpers only (no server-only modules).
 */
import { Types } from 'mongoose'
import type { SeedCtx } from '@/lib/seed-types'
import { addDays, istInstant, todayIST } from '@/lib/dates'
import { rupeesToPaise } from '@/lib/money'
import { Client } from '@/models/Client'
import { Member } from '@/models/Member'
import { Role } from '@/models/Role'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { OrbitSettings } from '@/models/orbit/OrbitSettings'
import { StageEvent } from '@/models/orbit/StageEvent'
import { DEFAULT_SOURCES, DEFAULT_STALE_DAYS, DEFAULT_DEAL_STAGES } from './constants'
import { pickNext } from './followUps'
import { ORBIT_CLIENTS } from './seed-data'
import { followUpsFor, generateLeads, mulberry32, type ActivitySeedDoc, type StageEventSeedDoc } from './seed-leads'
import { DEFAULT_SETTINGS_DOC } from './settings'

const BD_PERMISSIONS = ['orbit.read', 'leads.write', 'deals.write', 'contacts.write', 'activities.write', 'clients.read', 'tasks.read', 'tasks.write', 'projects.read', 'meetings.write', 'posts.write', 'time.write', 'whiteboards.write', 'arc.use']
const BATCH = 500

/** A custom role reproducing the reference CRM's intern limits, given to one demo person. */
async function bdExecutive(ctx: SeedCtx): Promise<Types.ObjectId> {
  const role = await ctx.db(Role).findOneAndUpdate({ key: 'bd_executive' }, { $setOnInsert: { key: 'bd_executive', label: 'BD executive', description: 'Works own leads and deals; a reviewer closes them.', permissions: BD_PERMISSIONS, builtIn: false } }, { upsert: true }).lean()
  const person = ctx.allMembers.find((m) => m.role === 'member' && String(m._id) !== String(ctx.members.member._id)) ?? ctx.members.sales
  if (role && person.role === 'member') await ctx.db(Member).updateOne({ _id: person._id }, { $set: { role: String(role._id), title: 'BD Executive', department: 'Sales' } })
  return person._id
}

async function upsertClients(ctx: SeedCtx, ownerId: Types.ObjectId, today: string) {
  const ids = new Map<string, Types.ObjectId>()
  for (const [i, c] of ORBIT_CLIENTS.entries()) {
    const existing = await ctx.db(Client).findOne({ name: c.name }).lean()
    if (existing) {
      ids.set(c.name, existing._id)
      continue
    }
    const [contactName, role] = c.contact
    const handle = c.name.toLowerCase().replace(/[^a-z]+/g, '')
    const created = await ctx.db(Client).create({
      name: c.name, kind: 'company', email: `accounts@${handle}.in`, phone: `+91 98${String(27_350_000 + i * 104_729).slice(0, 8)}`, website: `https://${handle}.in`,
      gstin: c.gstin, pan: c.gstin ? c.gstin.slice(2, 12) : undefined, state: c.state,
      billingAddress: { line1: `${12 + i * 7}, ${['MG Road', 'Residency Road', 'Civil Lines', 'Park Street'][i % 4]}`, city: c.city, state: c.state, pincode: ['452001', '682016', '482001', '462011', '110001', '302001', '781001', '560001'][i], country: 'India' },
      contacts: [
        { name: contactName, role, email: `${contactName.split(' ')[0].toLowerCase()}@${handle}.in`, phone: `+91 97${String(13_570_000 + i * 7_919).slice(0, 8)}`, primary: true },
        ...(i % 2 === 0 ? [{ name: ['Rohan Mehta', 'Neha Joshi', 'Arjun Rao', 'Siddharth Jain'][i % 4], role: 'Accounts', email: `accounts@${handle}.in`, primary: false }] : []),
      ],
      ownerId, tags: [c.sector === 'd2c' ? 'D2C' : c.sector === 'real_estate' ? 'Real estate' : 'Retainer'], source: c.source, sector: c.sector,
      status: c.fromLead ? 'lead' : 'active', notes: '', createdAt: istInstant(addDays(today, -(60 + i * 9)), '11:00'),
    })
    ids.set(c.name, created._id)
  }
  return ids
}

type DealSeed = { title: string; client: string; value: number; stages: string[]; closedAgo?: number; won?: string; lost?: { code: string; note: string }; leadIndex?: number; createdAgo: number; ownerIdx: number; source?: string; sector?: string }

const DEALS: DealSeed[] = [
  { title: 'Kesar & Clay — Shopify rebuild + performance retainer', client: 'Kesar & Clay Ceramics', value: 420_000, stages: ['discovery', 'proposal'], leadIndex: 0, createdAgo: 12, ownerIdx: 0 },
  { title: 'Malabar Mornings retainer', client: 'Malabar Mornings Coffee', value: 420_000, stages: ['discovery', 'proposal', 'negotiation', 'won'], closedAgo: 2, won: 'proof', leadIndex: 1, createdAgo: 20, ownerIdx: 1 },
  { title: 'Narmada Valley — lead-gen campaigns', client: 'Narmada Valley Realty', value: 240_000, stages: ['discovery', 'proposal', 'negotiation'], leadIndex: 2, createdAgo: 9, ownerIdx: 0 },
  { title: 'Urban Pind — festive campaign', client: 'Urban Pind Apparel', value: 180_000, stages: ['discovery'], createdAgo: 6, ownerIdx: 1, source: 'instagram', sector: 'd2c' },
  { title: 'Saffron Trails — website revamp', client: 'Saffron Trails Travel', value: 250_000, stages: ['discovery', 'proposal', 'won'], closedAgo: 19, won: 'referral_trust', createdAgo: 40, ownerIdx: 0, source: 'referral', sector: 'other' },
  { title: 'Indus Leaf — Amazon + quick commerce launch', client: 'Indus Leaf Teas', value: 360_000, stages: ['discovery', 'proposal'], createdAgo: 15, ownerIdx: 1, source: 'linkedin', sector: 'd2c' },
  { title: 'Neel Botanicals — D2C brand film', client: 'Neel Botanicals', value: 600_000, stages: ['discovery', 'proposal', 'negotiation'], createdAgo: 25, ownerIdx: 0, source: 'inbound', sector: 'd2c' },
  { title: 'Gulmohar — donor portal', client: 'Gulmohar Learning Trust', value: 95_000, stages: ['discovery'], createdAgo: 4, ownerIdx: 1, source: 'event', sector: 'dev_ngo' },
  { title: 'Sharma Organics — SEO programme', client: 'Sharma Organics Pvt Ltd', value: 150_000, stages: ['discovery', 'won'], closedAgo: 7, won: 'price_fit', createdAgo: 30, ownerIdx: 0, sector: 'd2c' },
  { title: 'Urban Threads — retainer pitch', client: 'Urban Threads Retail', value: 90_000, stages: ['discovery', 'proposal', 'lost'], closedAgo: 10, lost: { code: 'price_too_high', note: 'Wanted a retainer under ₹1L' }, createdAgo: 35, ownerIdx: 1, sector: 'd2c' },
]

type DealSeedDoc = {
  _id: Types.ObjectId; title: string; clientId?: Types.ObjectId; leadId?: Types.ObjectId; contactId?: Types.ObjectId; valuePaise: number; stage: string; probability: number; ownerId: Types.ObjectId
  expectedCloseDate?: string; status: 'open' | 'won' | 'lost'; source?: string; sector?: string; lostReason: { code: string; note: string } | null; wonReason: string | null
  closedAt: Date | null; stageChangedAt: Date; lastActivityAt: Date; notes: string; createdBy: Types.ObjectId; createdAt: Date
}

const probability = (stage: string) => (stage === 'won' ? 100 : stage === 'lost' ? 0 : (DEFAULT_DEAL_STAGES.find((s) => s.key === stage)?.probability ?? 20))

export async function seed(ctx: SeedCtx): Promise<void> {
  const rand = mulberry32(20261001)
  const today = todayIST()
  const now = new Date()
  const reviewer = (ctx.members.admin ?? ctx.members.owner)._id
  const bd = await bdExecutive(ctx)
  const owners = [ctx.members.sales._id, bd]

  await ctx.db(OrbitSettings).findOneAndUpdate(
    {},
    { $set: { ...DEFAULT_SETTINGS_DOC, sources: [...DEFAULT_SOURCES, { key: 'devnetjobs', label: 'DevNetJobs', warm: false, active: true, order: DEFAULT_SOURCES.length }], defaultReviewerId: reviewer } },
    { upsert: true, setDefaultsOnInsert: false },
  )
  const clientIds = await upsertClients(ctx, ctx.members.sales._id, today)

  const convertedNames = ORBIT_CLIENTS.filter((c) => c.fromLead).map((c) => c.name)
  const gen = generateLeads(rand, { owners, reviewer }, today, now, convertedNames)
  const plannedLeads = new Set(gen.activities.filter((a) => a.status === 'planned').map((a) => String(a.leadId)))
  const followUps = followUpsFor(rand, gen.leads, today, new Date(now.getTime() - DEFAULT_STALE_DAYS * 86_400_000), plannedLeads)
  const allActivities = [...gen.activities, ...followUps]

  // Converted leads → client + deal (deal docs built below).
  const dealDocs: DealSeedDoc[] = []
  const dealEvents: StageEventSeedDoc[] = []
  const dealActivities: ActivitySeedDoc[] = []
  for (const d of DEALS) {
    const clientId = clientIds.get(d.client) ?? (await ctx.db(Client).findOne({ name: d.client }, { _id: 1 }).lean())?._id ?? clientIds.get('Neel Botanicals')
    const lead = d.leadIndex !== undefined ? gen.converted[d.leadIndex] : undefined
    const createdAt = lead ? lead.convertedAt : istInstant(addDays(today, -d.createdAgo), '12:00')
    const final = d.stages[d.stages.length - 1]
    const status: DealSeedDoc['status'] = final === 'won' ? 'won' : final === 'lost' ? 'lost' : 'open'
    const closedAt = d.closedAgo !== undefined ? istInstant(addDays(today, -d.closedAgo), '16:30') : null
    const span = (closedAt ?? now).getTime() - createdAt.getTime()
    const times = d.stages.map((_, i) => new Date(createdAt.getTime() + (span * i) / Math.max(1, d.stages.length - (status === 'open' ? 0 : 1))))
    if (closedAt) times[times.length - 1] = closedAt
    const _id = new Types.ObjectId()
    const ownerId = lead ? lead.ownerId : owners[d.ownerIdx]
    const client = clientId ? await ctx.db(Client).findById(clientId, { contacts: 1 }).lean() : null
    dealDocs.push({
      _id, title: d.title, clientId, leadId: lead?.leadId, contactId: client?.contacts[0]?._id, valuePaise: rupeesToPaise(d.value), stage: final, probability: probability(final), ownerId,
      expectedCloseDate: status === 'open' ? addDays(today, 7 + d.createdAgo) : undefined, status, source: lead?.source ?? d.source, sector: lead?.sector ?? d.sector,
      lostReason: d.lost ?? null, wonReason: d.won ?? null, closedAt, stageChangedAt: times[times.length - 1], lastActivityAt: times[times.length - 1], notes: '', createdBy: ownerId, createdAt,
    })
    d.stages.forEach((s, i) => dealEvents.push({ entity: 'deal' as const, entityId: _id, fromStage: i === 0 ? null : d.stages[i - 1], toStage: s, reasonCode: s === 'lost' ? (d.lost?.code ?? null) : null, reasonNote: s === 'lost' ? d.lost?.note : s === 'won' ? d.won : null, changedBy: s === 'won' || s === 'lost' ? reviewer : ownerId, changedAt: times[i] }))
    dealActivities.push(
      { dealId: _id, clientId, type: 'call' as const, status: 'done' as const, channel: 'phone' as const, notes: 'Walked through scope and timelines; they want a phased plan.', occurredAt: new Date(Math.min(now.getTime() - 2 * 3_600_000, createdAt.getTime() + 86_400_000)), assigneeId: ownerId, createdBy: ownerId },
      { dealId: _id, clientId, type: 'email' as const, status: 'done' as const, channel: 'email' as const, notes: 'Sent the proposal with two pricing options.', occurredAt: new Date(Math.min(now.getTime() - 3_600_000, createdAt.getTime() + 3 * 86_400_000)), assigneeId: ownerId, createdBy: ownerId },
    )
    if (status === 'open' && dealActivities.filter((a) => a.status === 'planned').length < 3) {
      dealActivities.push({ dealId: _id, clientId, type: 'follow_up' as const, status: 'planned' as const, channel: 'other' as const, title: 'Chase the signed proposal', dueDate: addDays(today, dealActivities.length % 2 === 0 ? 0 : 2), dueTime: '15:00', assigneeId: ownerId, createdBy: ownerId })
    }
    if (lead) {
      const leadDoc = gen.leads.find((l) => String(l._id) === String(lead.leadId))
      if (leadDoc) Object.assign(leadDoc, { clientId, dealId: _id })
      gen.activities.filter((a) => String(a.leadId) === String(lead.leadId)).forEach((a) => Object.assign(a, { clientId }))
    }
  }

  for (let i = 0; i < gen.leads.length; i += BATCH) await ctx.db(Lead).insertMany(gen.leads.slice(i, i + BATCH))
  const insertedActivities = []
  for (let i = 0; i < allActivities.length; i += BATCH) insertedActivities.push(...(await ctx.db(Activity).insertMany(allActivities.slice(i, i + BATCH))))
  // Denormalised next step per lead, from the inserted planned activities.
  const plannedByLead = new Map<string, typeof insertedActivities>()
  for (const a of insertedActivities.filter((x) => x.status === 'planned' && x.leadId)) plannedByLead.set(String(a.leadId), [...(plannedByLead.get(String(a.leadId)) ?? []), a])
  for (const [leadId, list] of plannedByLead) await ctx.db(Lead).updateOne({ _id: leadId }, { $set: { nextFollowUp: pickNext(list) } })
  await ctx.db(StageEvent).insertMany(gen.events)
  await ctx.db(Deal).insertMany(dealDocs)
  await ctx.db(StageEvent).insertMany(dealEvents)
  const dealActs = await ctx.db(Activity).insertMany(dealActivities)
  for (const d of dealDocs) {
    const next = pickNext(dealActs.filter((a) => String(a.dealId) === String(d._id)))
    if (next) await ctx.db(Deal).updateOne({ _id: d._id }, { $set: { nextFollowUp: next } })
  }
  for (const c of ORBIT_CLIENTS.filter((x) => x.fromLead)) {
    const won = dealDocs.some((d) => String(d.clientId) === String(clientIds.get(c.name)) && d.status === 'won')
    if (won) await ctx.db(Client).updateOne({ _id: clientIds.get(c.name) }, { $set: { status: 'active' } })
  }
  ctx.log(`orbit: ${gen.leads.length} leads, ${dealDocs.length} deals, ${allActivities.length + dealActivities.length} activities, ${gen.events.length + dealEvents.length} stage events, ${clientIds.size} clients`)
}
