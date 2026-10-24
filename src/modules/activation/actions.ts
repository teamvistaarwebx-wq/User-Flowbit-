'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { describeCounts, discardSampleSet, insertSampleSet, removalMessage, removeSampleSet } from './sample-data'
import { sampleSetFor, sampleWriter, workspaceHasSample } from './store'
import { TOUR_KEYS } from './tours'

const OWNER = { perm: 'org.manage' } as const

const refreshAll = () => revalidatePath('/app', 'layout')

/** Loads the sample agency into this workspace (once; remove it to load again). */
export const loadSampleAgency = action(
  z.object({}),
  async (_input, ctx) => {
    if (await workspaceHasSample(ctx)) return fail('The sample agency is already here. Remove it first to load it again.')
    const writer = sampleWriter(ctx)
    const set = await sampleSetFor(ctx)
    try {
      const counts = await insertSampleSet(writer, set)
      await Org.updateOne({ _id: ctx.orgId }, { $set: { 'activation.sampleLoadedAt': new Date() } })
      await audit(ctx, { action: 'sample.loaded', entity: 'Org', entityId: ctx.orgId, summary: `Loaded the sample agency: ${describeCounts(counts)}`, meta: counts })
      refreshAll()
      const noInvoices = ctx.has('folio') && !counts.invoices ? ' Set up your business in Folio settings to see sample invoices too.' : ''
      return ok(`Sample agency loaded: ${describeCounts(counts)}.${noInvoices}`)
    } catch (error) {
      // A half-loaded set is cleared again so the workspace never keeps orphan sample rows.
      console.error('[activation] sample load failed', String(ctx.orgId), error)
      await discardSampleSet(writer)
      return fail('Could not load the sample agency. Nothing was added; try again.')
    }
  },
  OWNER,
)

/** Deletes the sample rows nobody has used; used ones (issued, paid, logged, linked) are kept as ordinary data. */
export const removeSampleData = action(
  z.object({}),
  async (_input, ctx) => {
    const result = await removeSampleSet(sampleWriter(ctx))
    await Org.updateOne({ _id: ctx.orgId }, { $unset: { 'activation.sampleLoadedAt': 1 } })
    const kept = Object.values(result.kept).some(Boolean) ? `; kept ${describeCounts(result.kept, 'kept')} in use` : ''
    await audit(ctx, { action: 'sample.removed', entity: 'Org', entityId: ctx.orgId, summary: `Removed sample data: ${describeCounts(result.removed)}${kept}`, meta: result })
    refreshAll()
    return ok(removalMessage(result))
  },
  { ...OWNER, allowReadOnly: true },
)

/** Hides the Home checklist for the whole workspace. */
export const dismissChecklist = action(
  z.object({}),
  async (_input, ctx) => {
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'activation.checklistDismissedAt': new Date() } })
    revalidatePath('/app')
    return ok('Checklist hidden')
  },
  OWNER,
)

/** Remembers that this person finished or skipped a product tour. */
export const markTourSeen = action(
  z.object({ tour: z.enum(TOUR_KEYS) }),
  async ({ tour }, ctx) => {
    await User.updateOne({ _id: ctx.userId }, { $addToSet: { 'prefs.toursSeen': tour } })
    return ok()
  },
  { allowReadOnly: true },
)
