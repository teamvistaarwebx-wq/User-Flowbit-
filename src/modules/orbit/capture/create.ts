import 'server-only'
import { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { scoped } from '@/lib/db/scoped'
import { notify } from '@/lib/notify'
import { resolvePermissions } from '@/lib/permissions'
import { Automation } from '@/models/automations/Automation'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { Role } from '@/models/Role'
import { User } from '@/models/User'
import { Activity } from '@/models/orbit/Activity'
import { Lead } from '@/models/orbit/Lead'
import { LeadCapture } from '@/models/orbit/LeadCapture'
import { OrbitSettings } from '@/models/orbit/OrbitSettings'
import { StageEvent } from '@/models/orbit/StageEvent'
import { emitEvent } from '@/modules/automations/engine'
import { pickKey } from '@/modules/console/house-lead-core'
import { activeKeys, getOrbitSettings } from '../settings'
import { pickAssignee, type AssignMode } from './assign'
import { captureRefusal } from './eligibility'
import { CAPTURE_SOURCES, type LeadDraft } from './map'
import { openDuplicateFilter, repeatNote } from './repeat'

/**
 * One captured lead into a workspace's Orbit: dropped when the sender's
 * enquiry id was seen before, its source added to the workspace's list when
 * missing, assigned (fixed owner or round-robin), stored with its tags and
 * UTM fields, the assignee alerted at once (their notification settings pick
 * the channel) and `lead.created` raised for the Sales automations.
 */

export type CaptureOutcome = Readonly<{ status: 'created'; leadId: string; assigneeId: string } | { status: 'duplicate'; leadId: string | null } | { status: 'refused'; reason: string }>

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000

/** Active members who can own leads (leads.write), and the first owner as the fallback. */
async function assignable(orgId: Types.ObjectId): Promise<{ active: Set<string>; fallback: string | null; userOf: Map<string, string> }> {
  const [members, roles] = await Promise.all([scoped(Member, orgId).find({ status: 'active' }, { role: 1, userId: 1, joinedAt: 1 }).sort({ joinedAt: 1 }).lean(), scoped(Role, orgId).find({ builtIn: false }).lean()])
  const writers = members.filter((m) => resolvePermissions(m.role, roles).has('leads.write'))
  const owner = members.find((m) => m.role === 'owner')
  return { active: new Set(writers.map((m) => String(m._id))), fallback: owner ? String(owner._id) : (writers[0] ? String(writers[0]._id) : null), userOf: new Map(members.map((m) => [String(m._id), String(m.userId)])) }
}

async function chooseAssignee(orgId: Types.ObjectId): Promise<{ memberId: string; userId: string } | null> {
  const people = await assignable(orgId)
  if (!people.fallback) return null
  // Round-robin: the cursor moves once per lead, atomically, so parallel leads spread across the pool.
  const capture = await LeadCapture.findOneAndUpdate({ orgId }, { $inc: { rrCursor: 1 } }, { returnDocument: 'before' }).lean()
  const memberId = pickAssignee({
    mode: (capture?.assignMode as AssignMode) ?? 'owner',
    ownerId: capture?.ownerMemberId ? String(capture.ownerMemberId) : null,
    pool: (capture?.poolMemberIds ?? []).map(String),
    cursor: capture?.rrCursor ?? 0,
    active: people.active.size ? people.active : new Set([people.fallback]),
    fallback: people.fallback,
  })
  const userId = people.userOf.get(memberId)
  return userId ? { memberId, userId } : null
}

async function ensureSource(orgId: Types.ObjectId, source: LeadDraft['source']): Promise<void> {
  const db = <M extends Parameters<typeof scoped>[0]>(model: M) => scoped(model, orgId)
  const cfg = await getOrbitSettings({ db })
  if (cfg.sources.some((s) => s.key === source)) return
  const def = CAPTURE_SOURCES[source]
  await db(OrbitSettings).updateOne({ 'sources.key': { $ne: source } }, { $push: { sources: { key: source, label: def.label, warm: def.warm, active: true, order: cfg.sources.length } } })
}

export async function captureLead(orgId: Types.ObjectId, draft: LeadDraft, opts: { alert?: boolean } = {}): Promise<CaptureOutcome> {
  await dbConnect()
  const db = <M extends Parameters<typeof scoped>[0]>(model: M) => scoped(model, orgId)
  // A disabled, read-only or Orbit-less workspace takes no leads (as the IndiaMART job already checks).
  const org = await Org.findById(orgId).lean()
  const closed = captureRefusal(org as Parameters<typeof captureRefusal>[0] | null)
  if (closed) return { status: 'refused', reason: closed }
  if (draft.externalId) {
    const seen = await db(Lead).findOne({ externalSource: draft.source, externalId: draft.externalId }, { _id: 1 }).lean()
    if (seen) return { status: 'duplicate', leadId: String(seen._id) }
  }
  const repeat = await logRepeat(orgId, draft)
  if (repeat) return { status: 'duplicate', leadId: repeat }
  await ensureSource(orgId, draft.source)
  const cfg = await getOrbitSettings({ db })
  const reviewerId = await activeReviewer(orgId, cfg.defaultReviewerId)
  const sector = pickKey(activeKeys(cfg.sectors), ['other'])
  const assignee = await chooseAssignee(orgId)
  if (!sector || !assignee) return { status: 'refused', reason: 'This workspace has no one who can own leads.' }
  const now = new Date()
  let lead
  try {
    lead = await db(Lead).create({
      companyName: draft.companyName,
      contactName: draft.contactName,
      email: draft.email,
      phone: draft.phone,
      website: draft.website,
      notes: draft.notes,
      sector,
      source: draft.source,
      stage: 'new',
      ownerId: new Types.ObjectId(assignee.memberId),
      reviewerId,
      createdBy: new Types.ObjectId(assignee.memberId),
      sourceTags: [...draft.tags],
      utm: draft.utm,
      externalSource: draft.externalId ? draft.source : null,
      externalId: draft.externalId,
      stageChangedAt: now,
      lastActivityAt: now,
    })
  } catch (error) {
    if (isDuplicateKey(error)) return { status: 'duplicate', leadId: null }
    throw error
  }
  await db(StageEvent).create({ entity: 'lead', entityId: lead._id, fromStage: null, toStage: 'new', changedBy: null, changedAt: now })
  await announce(orgId, lead, draft, assignee, opts.alert !== false)
  return { status: 'created', leadId: String(lead._id), assigneeId: assignee.memberId }
}

/** The workspace's default reviewer (settings), when they are still an active member. */
async function activeReviewer(orgId: Types.ObjectId, memberId: string | null): Promise<Types.ObjectId | null> {
  if (!memberId || !Types.ObjectId.isValid(memberId)) return null
  const member = await scoped(Member, orgId).exists({ _id: memberId, status: 'active' })
  return member ? new Types.ObjectId(memberId) : null
}

/**
 * The same buyer again (an open lead with this email or phone): the enquiry
 * is noted on that lead, once, and no second lead or alert is made. Returns
 * the open lead's id, or null when this is a new buyer.
 */
async function logRepeat(orgId: Types.ObjectId, draft: LeadDraft): Promise<string | null> {
  const filter = openDuplicateFilter(draft)
  if (!filter) return null
  const db = <M extends Parameters<typeof scoped>[0]>(model: M) => scoped(model, orgId)
  const open = await db(Lead).findOne(filter, { _id: 1, ownerId: 1 }).sort({ createdAt: 1 }).lean()
  if (!open) return null
  const note = repeatNote(draft)
  const seen = draft.externalId ? await db(Activity).exists({ leadId: open._id, type: 'note', title: note.title }) : null
  if (!seen) {
    const now = new Date()
    await db(Activity).create({ leadId: open._id, type: 'note', status: 'done', channel: 'other', title: note.title, notes: note.notes, occurredAt: now, assigneeId: open.ownerId, createdBy: open.ownerId })
    await db(Lead).updateOne({ _id: open._id }, { $set: { lastActivityAt: now } })
  }
  return String(open._id)
}

/** The instant alert (unless the "New lead" automation, which alerts too, is on) and the automation event. */
async function announce(orgId: Types.ObjectId, lead: { _id: Types.ObjectId; companyName: string; contactName?: string | null }, draft: LeadDraft, assignee: { memberId: string; userId: string }, alert: boolean): Promise<void> {
  const label = CAPTURE_SOURCES[draft.source].label
  const href = `/app/orbit/leads/${lead._id}`
  const recipeOn = await Automation.exists({ orgId, recipeKey: 'new_lead', enabled: true })
  if (alert && !recipeOn) {
    await notify({ orgId }, { userIds: [assignee.userId], title: `New lead from ${label}: ${lead.companyName}`, body: [draft.contactName, draft.phone, draft.email].filter(Boolean).join(' · ') || undefined, href, kind: 'assignment', product: 'orbit', event: 'orbit.lead_assigned', dedupeKey: `lead-new:${lead._id}`, includeSelf: true })
  }
  const [org, user] = await Promise.all([Org.findById(orgId, { name: 1 }).lean(), User.findById(assignee.userId, { name: 1 }).lean()])
  await emitEvent(orgId, 'lead.created', {
    entity: 'Lead',
    entityId: String(lead._id),
    vars: { lead_name: draft.contactName || lead.companyName, company_name: lead.companyName, lead_source: label, lead_phone: draft.phone, lead_email: draft.email, assignee_name: user?.name ?? '', business_name: org?.name ?? '', utm_campaign: draft.utm.campaign ?? '' },
    refs: { leadId: String(lead._id), href, users: { assignee: [assignee.userId] } },
  })
}
