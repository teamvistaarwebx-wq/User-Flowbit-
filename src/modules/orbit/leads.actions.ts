'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { withTransaction } from '@/lib/db'
import { UserError } from '@/lib/errors'
import { todayIST } from '@/lib/dates'
import { notifyMembers } from '@/lib/notify'
import { escapeRegex, pluralize } from '@/lib/utils'
import { listOf, objectId, optionalText, requiredText } from '@/lib/validation'
import { recordUsage } from '@/lib/usage'
import { fireWebhookEvent } from '@/modules/webhooks/emit'
import { Activity } from '@/models/orbit/Activity'
import { Lead } from '@/models/orbit/Lead'
import { StageEvent } from '@/models/orbit/StageEvent'
import { IMPORT_MAX_ROWS, OPEN_LEAD_STAGES, isOpenLead } from './constants'
import { applyLeadMove } from './lead-move'
import { refreshNextFollowUp, recordStage } from './next-step'
import { assertActiveMembers, nameOf, orbitPeople, peopleIndex } from './people'
import { checkLeadRows, insertLeads } from './lead-import-run'
import { recordBatch } from '@/modules/imports/record'
import { createLeadSchema, optId, updateLeadSchema } from './schemas'
import { canEditLead, isMe, leadAccess, loadLead } from './scope'
import { activeKeys, getOrbitSettings, type OrbitConfig } from './settings'

const O = { product: 'orbit' } as const
const refresh = (id?: string) => {
  revalidatePath('/app/orbit')
  revalidatePath('/app/orbit/leads')
  if (id) revalidatePath(`/app/orbit/leads/${id}`)
}

function settingsErrors(cfg: OrbitConfig, input: { sector: string; source: string }): Record<string, string> | null {
  const errors: Record<string, string> = {}
  if (!activeKeys(cfg.sectors).includes(input.sector)) errors.sector = 'Pick a sector'
  if (!activeKeys(cfg.sources).includes(input.source)) errors.source = 'Pick a source'
  return Object.keys(errors).length ? errors : null
}

const profileFields = (input: z.output<typeof updateLeadSchema> | z.output<typeof createLeadSchema>) => ({
  companyName: input.companyName,
  contactName: input.contactName ?? '',
  designation: input.designation ?? '',
  email: input.email ?? '',
  phone: input.phone ?? '',
  linkedinUrl: input.linkedinUrl ?? '',
  instagramHandle: input.instagramHandle ?? '',
  website: input.website ?? '',
  sector: input.sector,
  source: input.source,
  icpScore: input.icpScore ?? null,
  valuePaise: input.valueRupees ?? null,
  notes: input.notes ?? '',
})

export const createLead = action(
  createLeadSchema,
  async (input, ctx) => {
    const cfg = await getOrbitSettings(ctx)
    const bad = settingsErrors(cfg, input)
    if (bad) return fail('Some fields need attention.', bad)
    const close = ctx.can('orbit.close')
    const ownerId = close && input.ownerId ? input.ownerId : String(ctx.memberId)
    const reviewerId = close && input.reviewerId ? input.reviewerId : cfg.defaultReviewerId
    await assertActiveMembers(ctx, [ownerId, reviewerId])
    const follow = input.followUp?.dueDate ? input.followUp : null
    if (follow && follow.dueDate! < todayIST()) return fail('Some fields need attention.', { 'followUp.dueDate': 'Pick today or a later date' })

    if (!input.allowDuplicate) {
      const dupe = await ctx.db(Lead).findOne({
        stage: { $in: [...OPEN_LEAD_STAGES] },
        $or: [{ companyName: new RegExp(`^${escapeRegex(input.companyName)}$`, 'i') }, ...(input.email ? [{ email: input.email }] : [])],
      }).lean()
      if (dupe) {
        const people = peopleIndex(await orbitPeople(ctx))
        return fail('This looks like a duplicate.', { companyName: `An open lead for '${dupe.companyName}' already exists (owner ${nameOf(people, dupe.ownerId)}).` })
      }
    }

    const now = new Date()
    const lead = await withTransaction(async (session) => {
      const created = await ctx.db(Lead).create({ ...profileFields(input), stage: 'new', ownerId, reviewerId, stageChangedAt: now, lastActivityAt: now, createdBy: ctx.memberId }, { session })
      await recordStage(ctx, { entity: 'lead', entityId: created._id, fromStage: null, toStage: 'new', at: now }, session)
      if (follow) {
        await ctx.db(Activity).create({ leadId: created._id, type: follow.type ?? 'follow_up', status: 'planned', title: follow.title ?? 'Follow up', dueDate: follow.dueDate, dueTime: follow.dueTime ?? null, assigneeId: ownerId, createdBy: ctx.memberId }, { session })
        await refreshNextFollowUp(ctx, { leadId: created._id }, session)
      }
      return created
    })

    await audit(ctx, { action: 'orbit.lead.create', entity: 'Lead', entityId: lead._id, summary: `Added lead ${lead.companyName}`, product: 'orbit' })
    fireWebhookEvent(ctx.orgId, 'lead.created', { id: String(lead._id), company: lead.companyName, contact: lead.contactName || null, email: lead.email || null, phone: lead.phone || null, source: lead.source, path: `/app/orbit/leads/${lead._id}` })
    const notifyIds = [reviewerId, ownerId].filter((id): id is string => Boolean(id) && !isMe(ctx, id))
    if (notifyIds.length) await notifyMembers(ctx, notifyIds, { title: `New lead '${lead.companyName}'`, body: 'Assigned to you in Orbit.', href: `/app/orbit/leads/${lead._id}`, kind: 'assignment', product: 'orbit', event: 'orbit.lead_assigned' })
    refresh()
    recordUsage({ kind: 'lead_touched', orgId: ctx.orgId, userId: ctx.userId, product: 'orbit', meta: { via: 'create' } })
    return ok(`Lead '${lead.companyName}' added`, { id: String(lead._id) }, input.addAnother ? undefined : `/app/orbit/leads/${lead._id}`)
  },
  { ...O, perm: 'leads.write' },
)

export const updateLead = action(
  updateLeadSchema,
  async (input, ctx) => {
    const lead = await loadLead(ctx, input.id)
    if (!canEditLead(ctx, lead)) return fail("Only this lead's owner or reviewer can edit it.")
    const cfg = await getOrbitSettings(ctx)
    const keepOld = (key: 'sector' | 'source', value: string) => value === lead[key]
    const bad = settingsErrors(cfg, input)
    if (bad && !(keepOld('sector', input.sector) && keepOld('source', input.source))) return fail('Some fields need attention.', bad)

    const close = ctx.can('orbit.close')
    const ownerId = close && input.ownerId ? input.ownerId : String(lead.ownerId)
    const reviewerId = close ? (input.reviewerId ?? null) : lead.reviewerId ? String(lead.reviewerId) : null
    await assertActiveMembers(ctx, [ownerId !== String(lead.ownerId) ? ownerId : null, reviewerId !== String(lead.reviewerId ?? '') ? reviewerId : null])

    const next = { ...profileFields(input), ownerId, reviewerId }
    await ctx.db(Lead).updateOne({ _id: lead._id }, { $set: next })
    const people = peopleIndex(await orbitPeople(ctx))
    const changes: string[] = []
    if (ownerId !== String(lead.ownerId)) changes.push(`Owner changed from ${nameOf(people, lead.ownerId)} to ${nameOf(people, ownerId)}`)
    if ((reviewerId ?? '') !== String(lead.reviewerId ?? '')) changes.push(`Reviewer changed to ${nameOf(people, reviewerId)}`)
    await audit(ctx, { action: 'orbit.lead.update', entity: 'Lead', entityId: lead._id, summary: changes.length ? `${lead.companyName}: ${changes.join('; ')}` : `Edited lead ${lead.companyName}`, product: 'orbit', changes: { before: lead, after: { ...lead, ...next } } })
    const newPeople = [ownerId !== String(lead.ownerId) ? ownerId : null, reviewerId && reviewerId !== String(lead.reviewerId ?? '') ? reviewerId : null].filter((v): v is string => Boolean(v))
    if (newPeople.length) await notifyMembers(ctx, newPeople, { title: `Lead '${lead.companyName}' assigned to you`, href: `/app/orbit/leads/${lead._id}`, kind: 'assignment', product: 'orbit', event: 'orbit.lead_assigned' })
    refresh(input.id)
recordUsage({ kind: 'lead_touched', orgId: ctx.orgId, userId: ctx.userId, product: 'orbit', meta: { via: 'edit' } })
    return ok(`Lead '${input.companyName}' saved`)
  },
  { ...O, perm: 'leads.write' },
)

export const deleteLead = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const lead = await loadLead(ctx, id)
    if (lead.stage === 'converted') return fail('This lead became a deal. Delete or lose the deal instead.')
    await withTransaction(async (session) => {
      await ctx.db(Activity).deleteMany({ leadId: lead._id }, { session })
      await ctx.db(StageEvent).deleteMany({ entity: 'lead', entityId: lead._id }, { session })
      await ctx.db(Lead).deleteOne({ _id: lead._id }, { session })
    })
    await audit(ctx, { action: 'orbit.lead.delete', entity: 'Lead', entityId: lead._id, summary: `Deleted lead ${lead.companyName}`, product: 'orbit', changes: { before: lead } })
    refresh()
    return ok(`Lead '${lead.companyName}' deleted`, undefined, '/app/orbit/leads')
  },
  { ...O, perm: 'orbit.settings' },
)

const importSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1, 'The file has no rows to import').max(IMPORT_MAX_ROWS, `Import at most ${IMPORT_MAX_ROWS.toLocaleString('en-IN')} rows at a time.`),
  ownerId: optId,
  reviewerId: optId,
  fileName: z.string().max(200).optional(),
})

const IMPORT_NOTES_SHOWN = 5

export const importLeads = action(
  importSchema,
  async (input, ctx) => {
    const cfg = await getOrbitSettings(ctx)
    const close = ctx.can('orbit.close')
    const ownerId = close && input.ownerId ? input.ownerId : String(ctx.memberId)
    const reviewerId = close && input.reviewerId ? input.reviewerId : cfg.defaultReviewerId
    await assertActiveMembers(ctx, [ownerId, reviewerId])
    const checked = await checkLeadRows(ctx, input.rows, { ownerId, reviewerId })
    const docs = checked.flatMap((r) => (r.doc ? [r.doc] : []))
    const duplicates = checked.filter((r) => r.errors[0]?.startsWith('An open lead')).length
    const invalid = checked.length - docs.length - duplicates
    const notes = checked.flatMap((r) => [...r.errors.filter((e) => !e.startsWith('An open lead')).map((e) => `row ${r.line} skipped: ${e.toLowerCase()}`), ...r.warnings.map((w) => `row ${r.line}: ${w.toLowerCase()}`)])
    const { leadIds, eventIds } = await insertLeads(ctx, docs)
    if (leadIds.length) {
      await recordBatch(ctx, { kind: 'leads', label: 'Leads', fileName: input.fileName ?? 'leads.csv', actor: { source: 'self', userId: ctx.userId, name: ctx.user.name }, rows: checked.length, result: { created: [{ model: 'Lead', ids: leadIds }, { model: 'StageEvent', ids: eventIds }], count: leadIds.length } })
    }
    const skipped = invalid + duplicates
    const shownNotes = notes.slice(0, IMPORT_NOTES_SHOWN).join('; ') + (notes.length > IMPORT_NOTES_SHOWN ? `; and ${notes.length - IMPORT_NOTES_SHOWN} more` : '')
    const detail = (skipped ? `; ${skipped} skipped (${duplicates} duplicates, ${invalid} invalid)` : '') + (notes.length ? `. ${shownNotes}` : '')
    await audit(ctx, { action: 'orbit.lead.import', entity: 'Lead', summary: `Imported ${pluralize(docs.length, 'lead')}${skipped ? ` (${skipped} skipped)` : ''}`, product: 'orbit', meta: { imported: docs.length, duplicates, invalid } })
    if (!isMe(ctx, ownerId) && docs.length) await notifyMembers(ctx, [ownerId], { title: `${pluralize(docs.length, 'lead')} assigned to you`, href: '/app/orbit/leads', kind: 'assignment', product: 'orbit', event: 'orbit.lead_assigned' })
    refresh()
    return ok(`Imported ${pluralize(docs.length, 'lead')}${detail}`, { imported: docs.length, skipped })
  },
  { ...O, perm: 'leads.write' },
)

const idsSchema = listOf(objectId).refine((v) => v.length > 0 && v.length <= 200, 'Select between 1 and 200 leads')

export const bulkAssignLeads = action(
  z.object({ ids: idsSchema, ownerId: optId, reviewerId: optId }),
  async (input, ctx) => {
    if (!input.ownerId && !input.reviewerId) return fail('Pick an owner or a reviewer.')
    await assertActiveMembers(ctx, [input.ownerId, input.reviewerId])
    const set = { ...(input.ownerId ? { ownerId: input.ownerId } : {}), ...(input.reviewerId ? { reviewerId: input.reviewerId } : {}) }
    const res = await ctx.db(Lead).updateMany({ _id: { $in: input.ids }, ...leadAccess(ctx) }, { $set: set })
    const n = res.modifiedCount
    await audit(ctx, { action: 'orbit.lead.bulk_assign', entity: 'Lead', summary: `Reassigned ${pluralize(n, 'lead')}`, product: 'orbit', meta: set })
    if (input.ownerId && n) await notifyMembers(ctx, [input.ownerId], { title: `${pluralize(n, 'lead')} assigned to you`, href: '/app/orbit/leads', kind: 'assignment', product: 'orbit', event: 'orbit.lead_assigned' })
    refresh()
    return ok(`${pluralize(n, 'lead')} reassigned`)
  },
  { ...O, perm: 'orbit.close' },
)

export const bulkDisqualifyLeads = action(
  z.object({ ids: idsSchema, reasonCode: requiredText('Reason', 40), reasonNote: optionalText(300) }),
  async (input, ctx) => {
    const cfg = await getOrbitSettings(ctx)
    // The reason is the same for every lead: check it once and point at the field, instead of skipping every lead.
    if (!activeKeys(cfg.lostReasons).includes(input.reasonCode)) return fail('Some fields need attention.', { reasonCode: 'Pick the closest reason' })
    if (input.reasonCode === 'other' && !input.reasonNote?.trim()) return fail('Some fields need attention.', { reasonNote: "Add a short note for 'Other'" })
    const leads = await ctx.db(Lead).find({ _id: { $in: input.ids }, ...leadAccess(ctx) }).lean()
    let done = 0
    let refusal: string | null = null
    for (const lead of leads) {
      if (!isOpenLead(lead.stage) || !canEditLead(ctx, lead)) continue
      // A refused lead (e.g. it changed meanwhile) is counted as skipped; the first refusal is reported if nothing moved.
      const moved = await applyLeadMove(ctx, lead, cfg, { to: 'disqualified', via: 'move', reasonCode: input.reasonCode, reasonNote: input.reasonNote }).then(
        () => true,
        (error: unknown) => {
          if (!(error instanceof UserError)) return Promise.reject(error)
          refusal ??= error.message
          return false
        },
      )
      if (moved) done += 1
    }
    if (!done) return fail(refusal ?? 'No leads were disqualified. They are closed or not yours.')
    const skipped = input.ids.length - done
    await audit(ctx, { action: 'orbit.lead.bulk_disqualify', entity: 'Lead', summary: `Disqualified ${pluralize(done, 'lead')}`, product: 'orbit', meta: { reasonCode: input.reasonCode } })
    refresh()
    return ok(`Disqualified ${pluralize(done, 'lead')}${skipped ? `; ${skipped} skipped (closed or not yours)` : ''}`)
  },
  { ...O, perm: 'leads.write' },
)
