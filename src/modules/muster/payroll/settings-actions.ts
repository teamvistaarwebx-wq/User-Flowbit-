'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatDate } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { checkbox, isoDate, objectId, optionalText, requiredText } from '@/lib/validation'
import { SalaryComponent } from '@/models/muster/SalaryComponent'
import { StatutoryVersion } from '@/models/muster/StatutoryVersion'
import { CALCULATION_TYPES, COMPONENT_TYPES, STANDARD_COMPONENTS, isProtectedCode, percentageLooksWrong } from './components'
import { mayDecideOwn } from '@/modules/muster/people/scope'
import { statutorySettingsSchema } from './statutory'
import { statutoryIssueMessage } from './statutory-errors'
import { payrollMonthProblem } from './timeline'

const OPTS = { product: 'muster', feature: 'muster.payroll', perm: 'hr.settings' } as const
const PATH = '/app/hr/payroll/structures'

const componentSchema = z.object({
  id: objectId.optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]*$/, 'Start with a letter; use A–Z, 0–9 and _').min(2, 'Use at least 2 characters').max(20, 'Use at most 20 characters'),
  name: requiredText('Name', 60).refine((v) => v.length >= 2, 'Use at least 2 characters'),
  componentType: z.enum(COMPONENT_TYPES),
  calculationType: z.enum(CALCULATION_TYPES),
  defaultValue: z.coerce.number({ error: 'Enter a number' }).min(0, 'Use zero or more').max(100000, 'At most 1,00,000'),
  countsForPf: checkbox,
  countsForEsi: checkbox,
  countsForWages: checkbox,
  prorateOnLop: checkbox,
  isTaxable: checkbox,
  isRecurring: checkbox,
  displayOrder: z.coerce.number().int().min(0).max(9999).default(100),
})

export const saveSalaryComponent = action(
  componentSchema,
  async ({ id, ...input }, ctx) => {
    if (percentageLooksWrong(input.calculationType, input.defaultValue)) return fail('Some fields need attention.', { defaultValue: 'A percentage cannot be above 100. Did you mean a fixed amount?' })
    const defaultValue = input.calculationType === 'fixed' ? Math.round(input.defaultValue * 100) : input.defaultValue
    if (id) {
      const existing = await ctx.db(SalaryComponent).findById(id).lean()
      if (!existing) throw new NotFoundError('That component')
      // Protected components keep their code and type: only the name and order change.
      const patch = isProtectedCode(existing.code) || existing.isSystem ? { name: input.name, displayOrder: input.displayOrder } : { ...input, code: existing.code, defaultValue }
      await ctx.db(SalaryComponent).updateOne({ _id: id }, { $set: patch })
      await audit(ctx, { action: 'salary.component_updated', entity: 'SalaryComponent', entityId: id, summary: `Salary component ${existing.code} updated`, product: 'muster', changes: { before: existing, after: { ...existing, ...patch } } })
      revalidatePath(PATH)
      return ok(`${input.name} saved.`)
    }
    if (await ctx.db(SalaryComponent).exists({ code: input.code })) return fail('Some fields need attention.', { code: `The code ${input.code} is already used.` })
    const created = await ctx.db(SalaryComponent).create({ ...input, defaultValue, isActive: true })
    await audit(ctx, { action: 'salary.component_added', entity: 'SalaryComponent', entityId: created._id, summary: `Salary component added: ${input.name} (${input.code})`, product: 'muster' })
    revalidatePath(PATH)
    return ok(`Salary component added: ${input.name} (${input.code}).`)
  },
  OPTS,
)

export const setComponentActive = action(
  z.object({ id: objectId, active: z.boolean() }),
  async ({ id, active }, ctx) => {
    const c = await ctx.db(SalaryComponent).findById(id).lean()
    if (!c) throw new NotFoundError('That component')
    if (!active && (isProtectedCode(c.code) || c.isSystem)) return fail(`${c.code} is computed by payroll itself, so it cannot be retired.`)
    await ctx.db(SalaryComponent).updateOne({ _id: id }, { $set: { isActive: active } })
    await audit(ctx, { action: active ? 'salary.component_restored' : 'salary.component_retired', entity: 'SalaryComponent', entityId: id, summary: `${active ? 'Restored' : 'Retired'} salary component ${c.code}`, product: 'muster' })
    revalidatePath(PATH)
    return ok(active ? `${c.name} restored.` : `${c.name} retired. Existing structures keep it; new ones cannot use it.`)
  },
  OPTS,
)

export const loadStandardComponents = action(
  z.object({}),
  async (_input, ctx) => {
    const existing = new Set(await ctx.db(SalaryComponent).distinct('code'))
    const missing = STANDARD_COMPONENTS.filter((c) => !existing.has(c.code))
    if (!missing.length) return ok('Every standard component is already here.')
    await ctx.db(SalaryComponent).insertMany(missing.map((c) => ({ ...c, isActive: true })))
    await audit(ctx, { action: 'salary.components_loaded', entity: 'SalaryComponent', summary: `Loaded ${missing.length} standard salary components`, product: 'muster' })
    revalidatePath(PATH)
    return ok(`${missing.length} standard component${missing.length === 1 ? '' : 's'} added.`)
  },
  OPTS,
)

const versionSchema = z.object({
  effectiveFrom: isoDate,
  payrollFrom: isoDate,
  note: optionalText(300),
  /** JSON of StatutorySettings (rupees). */
  settings: z.string().transform((raw, c) => {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      c.addIssue({ code: 'custom', message: 'The rates could not be read.' })
      return z.NEVER
    }
  }),
})

export const addStatutoryVersion = action(
  versionSchema,
  async ({ effectiveFrom, payrollFrom, note, settings }, ctx) => {
    const problem = payrollMonthProblem(effectiveFrom, payrollFrom)
    if (problem) return fail('Some fields need attention.', { payrollFrom: problem })
    const parsed = statutorySettingsSchema.safeParse(settings)
    if (!parsed.success) return fail(`The rates need attention. ${statutoryIssueMessage(parsed.error.issues[0], settings)}`)
    const states = parsed.data.pt.map((p) => p.state)
    if (new Set(states).size !== states.length) return fail('Each state can have only one professional tax schedule.')
    const created = await ctx.db(StatutoryVersion).create({ effectiveFrom, payrollFrom, note, settings: parsed.data, createdBy: ctx.userId })
    await audit(ctx, { action: 'statutory.version_added', entity: 'StatutoryVersion', entityId: created._id, summary: `Statutory rates proposed, effective ${formatDate(effectiveFrom)}, payroll from ${formatDate(payrollFrom)}`, product: 'muster', meta: { note } })
    revalidatePath(PATH)
    return ok(`Rates effective ${formatDate(effectiveFrom)} saved as a proposal. Confirm them once they have been checked.`)
  },
  OPTS,
)

export const setVersionPayrollMonth = action(
  z.object({ id: objectId, payrollFrom: isoDate }),
  async ({ id, payrollFrom }, ctx) => {
    const v = await ctx.db(StatutoryVersion).findById(id).lean()
    if (!v) throw new NotFoundError('That set of rates')
    if (v.confirmedAt) return fail('Those rates are confirmed. Add a new version rather than moving this one.')
    const problem = payrollMonthProblem(v.effectiveFrom, payrollFrom)
    if (problem) return fail('Some fields need attention.', { payrollFrom: problem })
    await ctx.db(StatutoryVersion).updateOne({ _id: id, confirmedAt: null }, { $set: { payrollFrom } })
    await audit(ctx, { action: 'statutory.payroll_month_set', entity: 'StatutoryVersion', entityId: id, summary: `Rates effective ${formatDate(v.effectiveFrom)} now apply from ${formatDate(payrollFrom)} payroll`, product: 'muster' })
    revalidatePath(PATH)
    return ok(`Payroll applies these rates from ${formatDate(payrollFrom)}.`)
  },
  OPTS,
)

export const confirmStatutoryVersion = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const proposed = await ctx.db(StatutoryVersion).findById(id, { createdBy: 1 }).lean()
    if (!proposed) throw new NotFoundError('Those rates')
    // A second person checks the rates (owners and admins may confirm their own).
    if (String(proposed.createdBy ?? '') === String(ctx.userId) && !mayDecideOwn(ctx)) return fail('You proposed these rates, so someone else has to check and confirm them.')
    const v = await ctx.db(StatutoryVersion).findOneAndUpdate({ _id: id, confirmedAt: null }, { $set: { confirmedAt: new Date(), confirmedBy: ctx.userId, confirmedByName: ctx.user.name } })
    if (!v) return fail('Those rates were already confirmed.')
    await audit(ctx, { action: 'statutory.version_confirmed', entity: 'StatutoryVersion', entityId: id, summary: `Confirmed statutory rates effective ${formatDate(v.effectiveFrom)}`, product: 'muster' })
    revalidatePath(PATH)
    revalidatePath('/app/hr/payroll', 'layout')
    return ok(`Rates effective ${formatDate(v.effectiveFrom)} confirmed. Payroll uses them from ${formatDate(v.payrollFrom)}.`)
  },
  OPTS,
)
