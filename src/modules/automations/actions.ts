'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { hhmm, objectId } from '@/lib/validation'
import { Automation } from '@/models/automations/Automation'
import { AutomationRun } from '@/models/automations/AutomationRun'
import { FolioSettings } from '@/models/folio/FolioSettings'
import { getFolioSettings } from '@/modules/folio/settings/queries'
import { startRun } from './engine'
import { recipeByKey, SAMPLE_VALUES } from './recipes'
import { recipeDefaults } from './seed'
import { hasHindi } from './recipes-hi'
import { triggerDef } from './catalog'
import { CONDITION_OPS, MESSAGE_CHANNELS, type Trigger } from './types'
import { validateCustomRule } from './validate'
import { unknownVariables } from './template'
import { assertWhatsAppOn } from '@/modules/features/flags'

/** Settings → Automations: switch, reword, retime, test and reset rules. Owners and admins (org.manage). */

const LIST = '/app/settings/automations'
const OPTS = { perm: 'org.manage' } as const

const revalidate = (id?: string) => {
  revalidatePath(LIST)
  if (id) revalidatePath(`${LIST}/${id}`)
}

export const toggleAutomationAction = action(
  z.object({ id: objectId, enabled: z.boolean() }),
  async ({ id, enabled }, ctx) => {
    const rule = await ctx.db(Automation).findById(id, { name: 1, recipeKey: 1 }).lean()
    if (!rule) return fail('That automation was not found.')
    // The reminder schedule lives in Folio settings; this switch is the same switch.
    if (recipeByKey(rule.recipeKey)?.bridge === 'folio_reminders') {
      await getFolioSettings(ctx)
      await ctx.db(FolioSettings).updateOne({}, { $set: { 'reminders.enabled': enabled } })
      revalidatePath('/app/folio/settings')
    }
    await ctx.db(Automation).updateOne({ _id: id }, { $set: { enabled, updatedBy: ctx.userId } })
    await audit(ctx, { action: 'automation.toggled', entity: 'Automation', entityId: id, summary: `${enabled ? 'Turned on' : 'Turned off'} "${rule.name}"` })
    revalidate(id)
    return ok(enabled ? `"${rule.name}" is on.` : `"${rule.name}" is off.`)
  },
  OPTS,
)

const actionCopy = z.object({
  subject: z.string().trim().max(200).optional().default(''),
  body: z.string().trim().min(1, 'Write the message').max(4000),
  channel: z.enum(MESSAGE_CHANNELS).optional(),
})

const saveSchema = z.object({
  id: objectId,
  actions: z.array(actionCopy).max(5),
  delayMinutes: z.coerce.number().int().min(0).max(60 * 24 * 14),
  businessHoursOnly: z.boolean(),
  dailyCapPerContact: z.coerce.number().int().min(0).max(50),
  offset: z.coerce.number().int().min(-10_000).max(10_000).optional(),
  time: hhmm.optional(),
  day: z.coerce.number().int().min(0).max(28).optional(),
  conditions: z.array(z.object({ field: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, 'Pick a value'), op: z.enum(CONDITION_OPS), value: z.union([z.string().max(200), z.number()]).optional().nullable() })).max(10),
})

export const saveAutomationAction = action(
  saveSchema,
  async (input, ctx) => {
    if (input.actions.some((a) => a.channel === 'whatsapp')) await assertWhatsAppOn()
    const rule = await ctx.db(Automation).findById(input.id).lean()
    if (!rule) return fail('That automation was not found.')
    if (input.actions.length !== rule.actions.length) return fail('Refresh the page: this automation changed.')
    const known = recipeByKey(rule.recipeKey)?.variables ?? triggerDef(rule.trigger as Trigger)?.variables
    if (known) {
      const typos = input.actions.flatMap((a) => unknownVariables(`${a.subject} ${a.body}`, known))
      if (typos.length) return fail(`Unknown ${typos.length === 1 ? 'variable' : 'variables'}: ${typos.map((t) => `{{${t}}}`).join(', ')}. Use the chips above the message.`)
    }
    const actions = rule.actions.map((a, i) => ({ ...a, subject: input.actions[i].subject, body: input.actions[i].body, ...(a.type === 'message' && input.actions[i].channel ? { channel: input.actions[i].channel } : {}) }))
    const trigger = {
      ...rule.trigger,
      ...(rule.trigger.type === 'date' && input.offset !== undefined ? { offset: input.offset } : {}),
      ...(rule.trigger.type === 'schedule' && input.time ? { time: input.time } : {}),
      ...(rule.trigger.type === 'schedule' && input.day !== undefined ? { day: Math.max(rule.trigger.frequency === 'monthly' ? 1 : 0, input.day) } : {}),
    }
    await ctx.db(Automation).updateOne(
      { _id: rule._id },
      { $set: { actions, trigger, conditions: input.conditions, delayMinutes: input.delayMinutes, businessHoursOnly: input.businessHoursOnly, dailyCapPerContact: input.dailyCapPerContact, updatedBy: ctx.userId } },
    )
    await audit(ctx, { action: 'automation.edited', entity: 'Automation', entityId: input.id, summary: `Edited "${rule.name}"` })
    revalidate(input.id)
    return ok('Saved.')
  },
  OPTS,
)

export const resetAutomationAction = action(
  z.object({ id: objectId, language: z.enum(['en', 'hi']).default('en') }),
  async ({ id, language }, ctx) => {
    const rule = await ctx.db(Automation).findById(id, { recipeKey: 1, enabled: 1, name: 1 }).lean()
    const recipe = recipeByKey(rule?.recipeKey)
    if (!rule || !recipe) return fail('Only ready recipes can be reset.')
    if (language === 'hi' && !hasHindi(recipe.key)) return fail('This recipe has no Hindi wording yet.')
    await ctx.db(Automation).updateOne({ _id: id }, { $set: { ...recipeDefaults(recipe, language), updatedBy: ctx.userId } })
    const words = language === 'hi' ? "Flowbit's Hindi wording" : "Flowbit's wording"
    await audit(ctx, { action: 'automation.reset', entity: 'Automation', entityId: id, summary: `Reset "${rule.name}" to ${words} and timing` })
    revalidate(id)
    return ok(`Back to ${words} and timing.`)
  },
  OPTS,
)

/** Sends this rule's messages and alerts to you only, with sample values, now. */
export const testAutomationAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const rule = await ctx.db(Automation).findById(id).lean()
    const recipe = recipeByKey(rule?.recipeKey)
    if (!rule) return fail('That automation was not found.')
    if (!rule.actions.length) return fail('This one runs from Folio settings; there is nothing to test here.')
    const runId = await startRun(rule, { entity: 'Test', entityId: String(ctx.userId), vars: { ...(recipe?.sample ?? SAMPLE_VALUES), business_name: ctx.org.name }, refs: {} }, { test: { userId: ctx.userId } })
    const run = runId ? await ctx.db(AutomationRun).findById(runId, { status: 1, steps: 1 }).lean() : null
    revalidate(id)
    if (!run) return fail('The test could not start. Try again.')
    const sent = run.steps.filter((s) => s.status !== 'skipped' && s.status !== 'failed').length
    return sent ? ok(`Test sent to you (${sent} ${sent === 1 ? 'step' : 'steps'}). Check your email and the bell.`) : fail(run.steps[0]?.note ?? 'Nothing was sent.')
  },
  OPTS,
)

const customSchema = z.object({
  name: z.string().max(200),
  trigger: z.object({ type: z.string().max(20), event: z.string().max(60).optional(), source: z.string().max(60).optional(), offset: z.coerce.number().optional(), unit: z.string().max(20).optional(), frequency: z.string().max(20).optional(), day: z.coerce.number().optional(), time: z.string().max(5).optional() }),
  conditions: z.array(z.object({ field: z.string().max(60), op: z.string().max(20), value: z.union([z.string().max(200), z.number()]).optional().nullable() })).max(20),
  actions: z.array(z.object({ type: z.string().max(20), recipient: z.string().max(30), channel: z.string().max(20).optional(), subject: z.string().max(400).optional(), body: z.string().max(8000), dueInDays: z.coerce.number().optional() })).max(10),
  delayMinutes: z.coerce.number(),
  businessHoursOnly: z.boolean(),
  dailyCapPerContact: z.coerce.number(),
  enabled: z.boolean().default(false),
})

/** "New automation": a rule built from the trigger catalog, checked by validateCustomRule. */
export const createAutomationAction = action(
  customSchema,
  async (input, ctx) => {
    if (input.actions.some((a) => a.channel === 'whatsapp')) await assertWhatsAppOn()
    const checked = validateCustomRule(input)
    if (!checked.ok) return fail(Object.values(checked.errors)[0] ?? 'Some fields need attention.', checked.errors)
    const count = await ctx.db(Automation).countDocuments({ recipeKey: null })
    if (count >= 50) return fail('A workspace can keep 50 automations of its own. Delete one you no longer use.')
    const rule = await ctx.db(Automation).create({ recipeKey: null, name: checked.name, enabled: input.enabled, ...checked.spec, trigger: { ...checked.spec.trigger }, conditions: checked.spec.conditions.map((c) => ({ ...c })), actions: checked.spec.actions.map((a) => ({ ...a })), updatedBy: ctx.userId })
    await audit(ctx, { action: 'automation.created', entity: 'Automation', entityId: rule._id, summary: `Created automation "${checked.name}"` })
    revalidate()
    return ok(`"${checked.name}" saved${input.enabled ? ' and on' : ' (off: switch it on when ready)'}.`, { id: String(rule._id) }, `${LIST}/${rule._id}`)
  },
  OPTS,
)

/** Deletes one of the workspace's own automations (ready recipes can only be switched off). */
export const deleteAutomationAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const rule = await ctx.db(Automation).findById(id, { name: 1, recipeKey: 1 }).lean()
    if (!rule) return fail('That automation was not found.')
    if (rule.recipeKey) return fail('Ready recipes cannot be deleted; switch it off instead.')
    await ctx.db(Automation).deleteOne({ _id: id })
    await ctx.db(AutomationRun).updateMany({ automationId: id, status: 'scheduled' }, { $set: { status: 'skipped', note: 'The automation was deleted.' } })
    await audit(ctx, { action: 'automation.deleted', entity: 'Automation', entityId: id, summary: `Deleted automation "${rule.name}"` })
    revalidate()
    return ok(`"${rule.name}" deleted.`, undefined, LIST)
  },
  OPTS,
)
