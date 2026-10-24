/**
 * Generates Orbit's demo leads with a history the stage guards would have
 * allowed (outreach before Contacted, a reply before Engaged, a meeting before
 * Meeting done). Pure: returns documents; seed.ts inserts them.
 */
import { Types } from 'mongoose'
import { addDays, istInstant } from '@/lib/dates'
import { rupeesToPaise } from '@/lib/money'
import { OUTREACH_TYPES, type ActivityType, type Channel, type LeadStage } from './constants'
import { BRAND_PREFIXES, BRAND_SUFFIXES, DESIGNATIONS, FIRST_NAMES, FOLLOW_UP_TITLES, LAST_NAMES, MEETING_NOTES, OUTREACH_NOTES, REPLY_NOTES, SUFFIX_SECTOR } from './seed-data'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Deterministic PRNG so every seed produces the same workspace. */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Category = 'new_open' | 'dq_new' | 'contacted_open' | 'dq_contacted' | 'lost_contacted' | 'engaged_open' | 'lost_engaged' | 'booked_open' | 'done_open' | 'converted'

/** 148 leads aimed at Cold ≈ 5%, Warm ≈ 18%, reply rate ≈ 28%. */
const PLAN: [Category, number][] = [
  ['new_open', 20], ['dq_new', 7], ['contacted_open', 75], ['dq_contacted', 7], ['lost_contacted', 5],
  ['engaged_open', 24], ['lost_engaged', 4], ['booked_open', 2], ['done_open', 1], ['converted', 3],
]

const SOURCE_WEIGHTS: [string, number][] = [['instagram', 45], ['linkedin', 30], ['devnetjobs', 12], ['referral', 6], ['inbound', 5], ['event', 2]]
const SECTOR_WEIGHTS: [string, number][] = [['d2c', 65], ['real_estate', 22], ['dev_ngo', 13]]
const DQ_REASONS = ['not_icp', 'no_budget', 'inactive', 'wrong_contact', 'has_agency']
const LOST_REASONS = ['no_response', 'timing', 'price_too_high', 'competitor', 'no_budget']

export type SeedPeople = { owners: Types.ObjectId[]; reviewer: Types.ObjectId }
type When = Date | null
export type LeadSeedDoc = {
  _id: Types.ObjectId; companyName: string; contactName: string; designation: string; email: string; phone: string; instagramHandle: string; linkedinUrl: string; website: string
  sector: string; source: string; stage: LeadStage; ownerId: Types.ObjectId; reviewerId: Types.ObjectId; icpScore: number; valuePaise: number | null; notes: string
  closeReason: { code: string; note: string } | null; meetingAt: When; contactedAt: When; engagedAt: When; meetingBookedAt: When; meetingDoneAt: When; convertedAt: When; closedAt: When
  stageChangedAt: Date; lastActivityAt: Date; createdBy: Types.ObjectId; createdAt: Date; updatedAt: Date; clientId?: Types.ObjectId; dealId?: Types.ObjectId
}
export type ActivitySeedDoc = {
  leadId?: Types.ObjectId; dealId?: Types.ObjectId; clientId?: Types.ObjectId; type: ActivityType; status: 'done' | 'planned'; channel: Channel; title?: string; notes?: string
  occurredAt?: Date; dueDate?: string; dueTime?: string | null; meetingLink?: string; assigneeId: Types.ObjectId; createdBy: Types.ObjectId; createdAt?: Date
}
export type StageEventSeedDoc = { entity: 'lead' | 'deal'; entityId: Types.ObjectId; fromStage: string | null; toStage: string; reasonCode: string | null; reasonNote?: string | null; changedBy: Types.ObjectId; changedAt: Date }
export type GeneratedLeads = { leads: LeadSeedDoc[]; activities: ActivitySeedDoc[]; events: StageEventSeedDoc[]; converted: { leadId: Types.ObjectId; companyName: string; ownerId: Types.ObjectId; source: string; sector: string; contactName: string; designation: string; email: string; phone: string; convertedAt: Date }[] }

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)]
}

function weighted(rand: () => number, weights: [string, number][]): string {
  const total = weights.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [k, w] of weights) {
    r -= w
    if (r <= 0) return k
  }
  return weights[0][0]
}

const channelFor = (type: ActivityType, source: string): Channel =>
  type === 'dm' ? (source === 'linkedin' ? 'linkedin' : source === 'instagram' ? 'instagram' : 'whatsapp') : type === 'email' ? 'email' : type === 'call' ? 'phone' : type === 'meeting' ? 'video' : 'whatsapp'

/** Company names for converted leads come first so they match the Orbit clients. */
export function generateLeads(rand: () => number, people: SeedPeople, today: string, now: Date, convertedNames: string[]): GeneratedLeads {
  const out: GeneratedLeads = { leads: [], activities: [], events: [], converted: [] }
  const usedNames = new Set<string>(convertedNames)
  const categories = PLAN.flatMap(([c, n]) => Array.from({ length: n }, () => c))
  let convertedIndex = 0

  for (const category of categories) {
    const _id = new Types.ObjectId()
    let companyName = ''
    if (category === 'converted') companyName = convertedNames[convertedIndex++] ?? `${pick(rand, BRAND_PREFIXES)} Studio`
    while (!companyName || (category !== 'converted' && usedNames.has(companyName))) companyName = `${pick(rand, BRAND_PREFIXES)} ${pick(rand, BRAND_SUFFIXES)}`
    usedNames.add(companyName)
    const suffix = BRAND_SUFFIXES.find((s) => companyName.endsWith(s)) ?? ''
    const sector = SUFFIX_SECTOR[suffix] ?? weighted(rand, SECTOR_WEIGHTS)
    const source = category === 'converted' ? pick(rand, ['instagram', 'linkedin', 'referral']) : weighted(rand, SOURCE_WEIGHTS)
    const ownerId = people.owners[Math.floor(rand() * people.owners.length)]
    const contactName = `${pick(rand, FIRST_NAMES)} ${pick(rand, LAST_NAMES)}`
    const handle = companyName.toLowerCase().replace(/[^a-z]+/g, '')
    const designation = pick(rand, DESIGNATIONS)

    // Timeline (shifted back later if it runs past now).
    const created = istInstant(addDays(today, -(4 + Math.floor(rand() * 44))), `${10 + Math.floor(rand() * 8)}:${rand() < 0.5 ? '15' : '40'}`)
    let t = created.getTime()
    const step = (min: number, max: number) => (t += (min + rand() * (max - min)) * DAY)
    const acts: { type: ActivityType; at: number; notes: string; status: 'done' | 'planned'; dueDate?: string; title?: string }[] = []
    const stages: { to: LeadStage; at: number; reason?: string }[] = [{ to: 'new', at: t }]
    const m: Partial<Record<'contactedAt' | 'engagedAt' | 'meetingBookedAt' | 'meetingDoneAt' | 'convertedAt' | 'closedAt' | 'meetingAt', number>> = {}
    const contacted = !['new_open', 'dq_new'].includes(category)
    const engaged = ['engaged_open', 'lost_engaged', 'booked_open', 'done_open', 'converted'].includes(category)
    const booked = ['booked_open', 'done_open', 'converted'].includes(category)
    const done = ['done_open', 'converted'].includes(category)

    if (contacted) {
      acts.push({ type: pick(rand, OUTREACH_TYPES), at: step(0.1, 2), notes: pick(rand, OUTREACH_NOTES), status: 'done' })
      m.contactedAt = t + 0.2 * HOUR
      stages.push({ to: 'contacted', at: m.contactedAt })
      const extra = engaged ? Math.floor(rand() * 2) : Math.floor(rand() * 3)
      for (let i = 0; i < extra; i += 1) acts.push({ type: 'follow_up', at: step(1, 4), notes: pick(rand, OUTREACH_NOTES), status: 'done' })
    }
    if (engaged) {
      acts.push({ type: 'reply', at: step(0.5, 4), notes: pick(rand, REPLY_NOTES), status: 'done' })
      m.engagedAt = t + 0.3 * HOUR
      stages.push({ to: 'engaged', at: m.engagedAt })
    }
    if (booked) {
      m.meetingBookedAt = step(0.5, 3)
      stages.push({ to: 'meeting_booked', at: m.meetingBookedAt })
    }
    if (done) {
      m.meetingAt = step(2, 5)
      acts.push({ type: 'meeting', at: m.meetingAt as number, notes: pick(rand, MEETING_NOTES), status: 'done' })
      m.meetingDoneAt = (m.meetingAt as number) + 1.5 * HOUR
      stages.push({ to: 'meeting_done', at: m.meetingDoneAt })
      t = m.meetingDoneAt
    }
    if (category === 'converted') {
      m.convertedAt = step(0.5, 2)
      m.closedAt = m.convertedAt
      stages.push({ to: 'converted', at: m.convertedAt })
    }
    const exit = category.startsWith('dq_') ? 'disqualified' : category.startsWith('lost_') ? 'lost' : null
    const reason = exit === 'disqualified' ? pick(rand, DQ_REASONS) : exit === 'lost' ? pick(rand, LOST_REASONS) : undefined
    if (exit) {
      m.closedAt = step(1, 6)
      stages.push({ to: exit, at: m.closedAt, reason })
    }

    // Keep every past event at least 30 minutes before now; a booked-but-not-held meeting moves into the coming days.
    const pastTimes = [t, ...acts.map((a) => a.at), ...stages.map((s) => s.at)]
    const overflow = Math.max(...pastTimes) - (now.getTime() - 0.5 * HOUR)
    const shift = (v: number | undefined) => (v === undefined ? undefined : v - Math.max(0, overflow))
    if (overflow > 0) {
      acts.forEach((a) => (a.at = shift(a.at) as number))
      stages.forEach((s) => (s.at = shift(s.at) as number))
      for (const k of Object.keys(m) as (keyof typeof m)[]) m[k] = shift(m[k])
    }
    if (booked && !done) {
      const meetingDay = addDays(today, 1 + Math.floor(rand() * 5))
      m.meetingAt = istInstant(meetingDay, '11:00').getTime()
      acts.push({ type: 'meeting', at: m.meetingAt, notes: '', status: 'planned', dueDate: meetingDay, title: `Meeting with ${contactName}` })
    }
    const createdAt = new Date(shift(created.getTime()) as number)
    const lastAt = Math.max(createdAt.getTime(), ...acts.filter((a) => a.status === 'done').map((a) => a.at), ...stages.map((s) => s.at))
    const stage = stages[stages.length - 1].to
    const date = (v: number | undefined) => (v === undefined ? null : new Date(v))

    out.leads.push({
      _id, companyName, contactName, designation, email: `${contactName.split(' ')[0].toLowerCase()}@${handle}.in`, phone: `+91 9${String(Math.floor(rand() * 1e9)).padStart(9, '0')}`,
      instagramHandle: source === 'instagram' ? handle.slice(0, 28) : '', linkedinUrl: source === 'linkedin' ? `https://linkedin.com/company/${handle}` : '', website: `https://${handle}.in`,
      sector, source, stage, ownerId, reviewerId: people.reviewer, icpScore: 2 + Math.floor(rand() * 4), valuePaise: rand() < 0.6 ? rupeesToPaise(60_000 + Math.floor(rand() * 20) * 15_000) : null,
      notes: '', closeReason: reason ? { code: reason, note: reason === 'timing' ? 'Asked us to reconnect next quarter.' : '' } : null,
      meetingAt: date(m.meetingAt), contactedAt: date(m.contactedAt), engagedAt: date(m.engagedAt), meetingBookedAt: date(m.meetingBookedAt), meetingDoneAt: date(m.meetingDoneAt),
      convertedAt: date(m.convertedAt), closedAt: date(m.closedAt), stageChangedAt: new Date(stages[stages.length - 1].at), lastActivityAt: new Date(lastAt),
      createdBy: ownerId, createdAt, updatedAt: new Date(lastAt),
    })
    for (const a of acts) {
      out.activities.push(
        a.status === 'done'
          ? { leadId: _id, type: a.type, status: 'done' as const, channel: channelFor(a.type, source), notes: a.notes, occurredAt: new Date(a.at), assigneeId: ownerId, createdBy: ownerId, createdAt: new Date(a.at) }
          : { leadId: _id, type: a.type, status: 'planned' as const, channel: 'video' as const, title: a.title, dueDate: a.dueDate, dueTime: '11:00', meetingLink: 'https://meet.google.com/kes-arcl-ay1', assigneeId: ownerId, createdBy: ownerId },
      )
    }
    stages.forEach((s, i) => out.events.push({ entity: 'lead' as const, entityId: _id, fromStage: i === 0 ? null : stages[i - 1].to, toStage: s.to, reasonCode: s.reason ?? null, changedBy: i === 0 ? ownerId : people.reviewer, changedAt: new Date(s.at) }))
    if (category === 'converted') out.converted.push({ leadId: _id, companyName, ownerId, source, sector, contactName, designation, email: `${contactName.split(' ')[0].toLowerCase()}@${handle}.in`, phone: '', convertedAt: new Date(m.convertedAt as number) })
  }
  return out
}

/** Planned follow-ups for open leads: some overdue, a few today, most in the next two weeks; stale ghosts get none. */
export function followUpsFor(rand: () => number, leads: LeadSeedDoc[], today: string, staleBefore: Date, plannedLeadIds: Set<string>): ActivitySeedDoc[] {
  const open = leads.filter((l) => ['new', 'contacted', 'engaged'].includes(l.stage) && !plannedLeadIds.has(String(l._id)))
  const ghosts = open.filter((l) => l.lastActivityAt < staleBefore).slice(0, 12)
  const ghostIds = new Set(ghosts.map((g) => String(g._id)))
  const withNext = open.filter((l) => !ghostIds.has(String(l._id))).slice(0, 60)
  return withNext.map((l, i) => {
    const offset = i < 6 ? -(1 + Math.floor(rand() * 4)) : i < 10 ? 0 : 1 + Math.floor(rand() * 13)
    return { leadId: l._id, type: pick(rand, ['follow_up', 'call', 'email', 'dm'] as const), status: 'planned' as const, channel: 'other' as const, title: pick(rand, FOLLOW_UP_TITLES), dueDate: addDays(today, offset), dueTime: rand() < 0.5 ? `${10 + Math.floor(rand() * 7)}:00` : null, assigneeId: l.ownerId, createdBy: l.ownerId }
  })
}
