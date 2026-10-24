import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { Lead } from '@/models/orbit/Lead'
import { StageEvent } from '@/models/orbit/StageEvent'
import { OPEN_LEAD_STAGES } from './constants'
import { parseImportRow } from './schemas'
import { activeKeys, getOrbitSettings } from './settings'

/** Lead import, shared by Orbit's import dialog and Settings → Import / the Console (server-only). */

const BATCH = 500
const FIELD_WORD: Record<string, string> = { contactName: 'contact', designation: 'designation', email: 'email', phone: 'phone', linkedinUrl: 'LinkedIn', instagramHandle: 'Instagram', website: 'website', notes: 'notes' }

export type LeadRowCheck = { line: number; label: string; errors: string[]; warnings: string[]; doc: LeadDoc | null }
export type LeadDoc = ReturnType<typeof leadDoc>

const leadDoc = (row: Extract<ReturnType<typeof parseImportRow>, { ok: true }>['row'], who: { ownerId: string; reviewerId: string | null; createdBy: Types.ObjectId; now: Date }) => ({
  companyName: row.companyName, contactName: row.contactName ?? '', designation: row.designation ?? '', email: row.email ?? '', phone: row.phone ?? '',
  linkedinUrl: row.linkedinUrl ?? '', instagramHandle: row.instagramHandle ?? '', website: row.website ?? '', sector: row.sector, source: row.source, notes: row.notes ?? '',
  stage: 'new' as const, ownerId: who.ownerId, reviewerId: who.reviewerId, stageChangedAt: who.now, lastActivityAt: who.now, createdBy: who.createdBy,
})

/** Checks rows against the workspace's sectors, sources and open leads (duplicates are skipped, not errors). */
export async function checkLeadRows(ctx: Ctx, raws: readonly Record<string, unknown>[], who: { ownerId: string; reviewerId: string | null }): Promise<LeadRowCheck[]> {
  const cfg = await getOrbitSettings(ctx)
  const sectors = new Set(activeKeys(cfg.sectors))
  const sources = new Set(activeKeys(cfg.sources))
  const open = await ctx.db(Lead).find({ stage: { $in: [...OPEN_LEAD_STAGES] } }, { companyName: 1, email: 1 }).lean()
  const seenNames = new Set(open.map((l) => l.companyName.trim().toLowerCase()))
  const seenEmails = new Set(open.map((l) => l.email).filter(Boolean))
  const now = new Date()
  return raws.map((raw, index) => {
    const line = typeof raw.line === 'number' ? raw.line : index + 2
    const parsed = parseImportRow(raw)
    const label = String(raw.companyName ?? '—')
    const error = !parsed.ok ? parsed.error : !sectors.has(parsed.row.sector) ? 'Unknown sector' : !sources.has(parsed.row.source) ? 'Unknown source' : null
    if (!parsed.ok || error) return { line, label, errors: [error ?? 'This row is not valid'], warnings: [], doc: null }
    const row = parsed.row
    const warnings = parsed.blanked.length ? [`Bad ${parsed.blanked.map((f) => FIELD_WORD[f] ?? f).join(', ')} left blank`] : []
    const nameKey = row.companyName.toLowerCase()
    if (seenNames.has(nameKey) || (row.email && seenEmails.has(row.email))) return { line, label, errors: ['An open lead with this company or email already exists'], warnings, doc: null }
    seenNames.add(nameKey)
    if (row.email) seenEmails.add(row.email)
    return { line, label, errors: [], warnings, doc: leadDoc(row, { ...who, createdBy: ctx.memberId, now }) }
  })
}

/** Inserts the leads and their first stage events; returns both id lists for the import batch. */
export async function insertLeads(ctx: Ctx, docs: readonly LeadDoc[]): Promise<{ leadIds: Types.ObjectId[]; eventIds: Types.ObjectId[] }> {
  const leadIds: Types.ObjectId[] = []
  const eventIds: Types.ObjectId[] = []
  const now = new Date()
  for (let i = 0; i < docs.length; i += BATCH) {
    const inserted = await ctx.db(Lead).insertMany(docs.slice(i, i + BATCH))
    const events = await ctx.db(StageEvent).insertMany(inserted.map((l) => ({ entity: 'lead' as const, entityId: l._id, fromStage: null, toStage: 'new', changedBy: ctx.memberId, changedAt: now })))
    leadIds.push(...inserted.map((l) => l._id as Types.ObjectId))
    eventIds.push(...events.map((e) => e._id as Types.ObjectId))
  }
  return { leadIds, eventIds }
}
