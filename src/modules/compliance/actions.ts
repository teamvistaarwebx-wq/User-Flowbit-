'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok, type ActionOptions } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatDate } from '@/lib/dates'
import { isoDate, listOf } from '@/lib/validation'
import { stateByCode2 } from '@/lib/india-states'
import { ComplianceSettings } from '@/models/compliance/ComplianceSettings'
import { COMPLIANCE_ITEMS, FILER_TYPES, ITEM_LABELS } from './rules'

/** Settings → Compliance calendar: filer type, state, items, professional tax day, and date overrides (owners, admins, accounts). */

const OPTS: ActionOptions = { anyPerm: ['org.manage', 'folio.settings'] }
const PATH = '/app/settings/compliance'

export const saveComplianceSettingsAction = action(
  z.object({
    filerType: z.enum(FILER_TYPES),
    state: z.string().trim().toUpperCase().max(2).optional().default(''),
    items: listOf(z.enum(COMPLIANCE_ITEMS)),
    ptDay: z.preprocess((v) => (v === '' || v === undefined ? null : Number(v)), z.number().int().min(0).max(31).nullable()),
  }),
  async (input, ctx) => {
    if (input.state && !stateByCode2(input.state)) return fail('Pick your state from the list.', { state: 'Pick a state' })
    await ctx.db(ComplianceSettings).updateOne({}, { $set: { filerType: input.filerType, state: input.state, items: input.items, ptDay: input.ptDay, updatedBy: ctx.userId } }, { upsert: true })
    await audit(ctx, { action: 'compliance.settings_saved', entity: 'ComplianceSettings', entityId: ctx.orgId, summary: `Compliance calendar: ${input.filerType === 'qrmp' ? 'QRMP' : 'monthly'} GST filer, ${input.state || 'no state'}, ${input.items.length} items` })
    revalidatePath(PATH)
    return ok('Compliance calendar saved.')
  },
  OPTS,
)

const overrideSchema = z.object({ item: z.enum(COMPLIANCE_ITEMS), period: z.string().trim().regex(/^[0-9A-Z-]{6,20}$/), dueDate: isoDate, note: z.string().trim().max(200).optional().default('') })

/** When the government extends a date: this occurrence moves; the reminder follows the new date. */
export const overrideDueDateAction = action(
  overrideSchema,
  async (input, ctx) => {
    await ctx.db(ComplianceSettings).updateOne({}, { $setOnInsert: { filerType: 'monthly' }, $set: { updatedBy: ctx.userId } }, { upsert: true })
    await ctx.db(ComplianceSettings).updateOne({}, { $pull: { overrides: { item: input.item, period: input.period } } })
    await ctx.db(ComplianceSettings).updateOne({}, { $push: { overrides: { item: input.item, period: input.period, dueDate: input.dueDate, ...(input.note ? { note: input.note } : {}) } } })
    await audit(ctx, { action: 'compliance.date_overridden', entity: 'ComplianceSettings', entityId: ctx.orgId, summary: `${ITEM_LABELS[input.item]} (${input.period}) moved to ${formatDate(input.dueDate)}${input.note ? `: ${input.note}` : ''}` })
    revalidatePath(PATH)
    return ok(`${ITEM_LABELS[input.item]} now due ${formatDate(input.dueDate)}.`)
  },
  OPTS,
)

export const removeOverrideAction = action(
  overrideSchema.pick({ item: true, period: true }),
  async (input, ctx) => {
    await ctx.db(ComplianceSettings).updateOne({}, { $pull: { overrides: { item: input.item, period: input.period } } })
    revalidatePath(PATH)
    return ok('Back to the standard date.')
  },
  OPTS,
)
