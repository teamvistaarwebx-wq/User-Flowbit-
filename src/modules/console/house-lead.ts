import 'server-only'
import { after } from 'next/server'
import { serverEnv } from '@/lib/env'
import { elevated } from '@/lib/platform'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { Lead } from '@/models/orbit/Lead'
import { StageEvent } from '@/models/orbit/StageEvent'
import { activeKeys, getOrbitSettings } from '@/modules/orbit/settings'
import { appendNote, houseLeadLine, pickKey, PREFERRED_SECTOR, PREFERRED_SOURCE, type HouseLeadInput } from './house-lead-core'

export type HouseLeadResult = 'created' | 'updated' | 'skipped'

/**
 * Creates or updates the Lead for this email in Vistaar's own Orbit workspace
 * (FLOWBIT_HOUSE_ORG_SLUG). Skips silently when the slug is unset, the
 * workspace is missing or deleted, or it has no active owner to own the lead.
 */
export async function upsertHouseLead(input: HouseLeadInput, now = new Date()): Promise<HouseLeadResult> {
  const slug = serverEnv().FLOWBIT_HOUSE_ORG_SLUG.trim().toLowerCase()
  if (!slug) return 'skipped'
  return elevated('signup lead into the house Orbit workspace', async (sys) => {
    const org = await sys.raw(Org).findOne({ slug, deletedAt: null }, { _id: 1 }).lean()
    if (!org) return 'skipped'
    const { db } = sys.forOrg(org._id)
    const owner = await db(Member).findOne({ role: 'owner', status: 'active' }, { _id: 1 }).sort({ joinedAt: 1 }).lean()
    if (!owner) return 'skipped'
    const line = houseLeadLine(input, now)
    const email = input.email.trim().toLowerCase()
    const existing = await db(Lead).findOne({ email }).sort({ updatedAt: -1 }).lean()
    if (existing) {
      const fill = { ...(existing.contactName ? {} : { contactName: input.name }), ...(existing.phone || !input.phone ? {} : { phone: input.phone }) }
      await db(Lead).updateOne({ _id: existing._id }, { $set: { ...fill, notes: appendNote(existing.notes, line), lastActivityAt: now } })
      return 'updated'
    }
    const cfg = await getOrbitSettings({ db })
    const source = pickKey(activeKeys(cfg.sources), PREFERRED_SOURCE[input.origin])
    const sector = pickKey(activeKeys(cfg.sectors), PREFERRED_SECTOR)
    if (!source || !sector) return 'skipped'
    const lead = await db(Lead).create({
      companyName: input.company.slice(0, 120) || input.name,
      contactName: input.name,
      email,
      phone: input.phone ?? '',
      sector,
      source,
      stage: 'new',
      ownerId: owner._id,
      createdBy: owner._id,
      notes: line,
      ...(input.utm ? { utm: { source: input.utm.source, medium: input.utm.medium, campaign: input.utm.campaign, term: input.utm.term, content: input.utm.content } } : {}),
      stageChangedAt: now,
      lastActivityAt: now,
    })
    await db(StageEvent).create({ entity: 'lead', entityId: lead._id, fromStage: null, toStage: 'new', changedBy: null, changedAt: now })
    return 'created'
  })
}

/**
 * For signup and demo server actions: runs after the response is sent, and a
 * failure is logged, never shown to the visitor.
 */
export function recordHouseLead(input: HouseLeadInput): void {
  after(() => upsertHouseLead(input).then(() => undefined, (error: unknown) => console.error('[console] house lead failed', input.origin, error)))
}
