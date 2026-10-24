'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatDate, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { elevated } from '@/lib/platform'
import { checkbox, isoDate, isoMonth, listOf, objectId, optionalText, paise, requiredText } from '@/lib/validation'
import { ClaimCategory } from '@/models/muster/ClaimCategory'
import { ClaimForm } from '@/models/muster/ClaimForm'
import { MAX_CATEGORY_CEILING_PAISE, MAX_CLAIM_PAISE, STANDARD_CATEGORIES } from './constants'
import { SLUG_PATTERN, claimFormState, companyDay, formCreatedMessage, windowFromDays } from './rules'

const OPTS = { product: 'muster', perm: 'claims.forms' } as const
const FORMS = '/app/hr/claims/forms'

const formSchema = z.object({
  name: requiredText('Name', 80).refine((v) => v.length >= 3, 'Use at least 3 characters'),
  slug: z.string().trim().toLowerCase().min(3, 'Use at least 3 characters').max(60, 'Use at most 60 characters').regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens'),
  description: optionalText(600),
  opensOn: isoDate,
  closesOn: isoDate,
  categoryIds: listOf(objectId).refine((v) => v.length > 0, 'Pick at least one category'),
  requiresReceipt: checkbox,
  includeInPayroll: checkbox,
  payrollMonth: isoMonth.optional(),
  maxClaimAmount: paise.optional(),
  eligibleEmployeeIds: listOf(objectId),
})

export const createClaimForm = action(
  formSchema,
  async (input, ctx) => {
    const today = todayIST()
    if (input.closesOn < input.opensOn) return fail('Some fields need attention.', { closesOn: 'The deadline cannot be before the form opens' })
    if (input.closesOn < today) return fail('Some fields need attention.', { closesOn: 'The deadline has already passed. Pick today or later' })
    if (input.includeInPayroll && !input.payrollMonth) return fail('Some fields need attention.', { payrollMonth: 'Pick the payroll month these claims are paid in' })
    const thisYear = Number(today.slice(0, 4))
    const [py, pm] = (input.payrollMonth ?? '').split('-').map(Number)
    if (input.payrollMonth && (py < 2000 || py > thisYear + 1 || pm < 1 || pm > 12)) return fail('Some fields need attention.', { payrollMonth: 'Pick a month between 2000 and next year' })
    if (input.maxClaimAmount !== undefined && (input.maxClaimAmount < 1 || input.maxClaimAmount > MAX_CLAIM_PAISE)) return fail('Some fields need attention.', { maxClaimAmount: `Use more than zero and at most ${formatINR(MAX_CLAIM_PAISE)}, or leave it blank` })
    if (await elevated('check a claim form link is free', (db) => db.raw(ClaimForm).exists({ slugLower: input.slug }))) return fail('Some fields need attention.', { slug: 'That link slug is already in use.' })
    const categories = await ctx.db(ClaimCategory).countDocuments({ _id: { $in: input.categoryIds }, isActive: true })
    if (categories !== input.categoryIds.length) return fail('Some fields need attention.', { categoryIds: 'One of those categories was retired. Pick again.' })
    const { opensAt, closesAt } = windowFromDays(input.opensOn, input.closesOn)
    const form = await ctx.db(ClaimForm).create({
      name: input.name,
      slug: input.slug,
      slugLower: input.slug,
      description: input.description,
      opensAt,
      closesAt,
      status: 'open',
      eligibility: input.eligibleEmployeeIds.length ? 'selected' : 'all',
      eligibleEmployeeIds: input.eligibleEmployeeIds,
      categoryIds: input.categoryIds,
      requiresReceipt: input.requiresReceipt,
      maxClaimAmount: input.maxClaimAmount ?? null,
      includeInPayroll: input.includeInPayroll,
      payrollYear: input.includeInPayroll ? py : undefined,
      payrollMonth: input.includeInPayroll ? pm : undefined,
      createdBy: ctx.userId,
    })
    await audit(ctx, { action: 'claim_form.created', entity: 'ClaimForm', entityId: form._id, summary: `Claim form "${input.name}" created (/c/${input.slug})`, product: 'muster' })
    revalidatePath(FORMS)
    return ok(formCreatedMessage(input.name, input.eligibleEmployeeIds.length || null, input.opensOn, input.closesOn, today), { id: String(form._id) }, `${FORMS}/${form._id}`)
  },
  OPTS,
)

export const updateClaimForm = action(
  z.object({ id: objectId, name: requiredText('Name', 80), description: optionalText(600), closesOn: isoDate }),
  async ({ id, name, description, closesOn }, ctx) => {
    const form = await ctx.db(ClaimForm).findById(id).lean()
    if (!form) throw new NotFoundError('That claim form')
    if (closesOn < todayIST()) return fail('Some fields need attention.', { closesOn: 'The deadline cannot be before today' })
    const opensOn = companyDay(form.opensAt)
    if (closesOn < opensOn) return fail('Some fields need attention.', { closesOn: `The form opens on ${formatDate(opensOn)}; the deadline cannot be earlier` })
    const { closesAt } = windowFromDays(opensOn, closesOn)
    await ctx.db(ClaimForm).updateOne({ _id: id }, { $set: { name, description, closesAt } })
    await audit(ctx, { action: 'claim_form.updated', entity: 'ClaimForm', entityId: id, summary: `Claim form "${name}" updated; deadline ${formatDate(closesOn)}`, product: 'muster' })
    revalidatePath(FORMS)
    revalidatePath(`${FORMS}/${id}`)
    return ok(`"${name}" saved. It takes claims until ${formatDate(closesOn)}.`)
  },
  OPTS,
)

export const setClaimFormStatus = action(
  z.object({ id: objectId, status: z.enum(['open', 'closed']) }),
  async ({ id, status }, ctx) => {
    const form = await ctx.db(ClaimForm).findById(id).lean()
    if (!form) throw new NotFoundError('That claim form')
    if (status === 'open' && claimFormState({ ...form, status: 'open' }) === 'ended') return fail(`The deadline of "${form.name}" has passed. Move the deadline first, then reopen it.`)
    await ctx.db(ClaimForm).updateOne({ _id: id }, { $set: { status } })
    await audit(ctx, { action: status === 'open' ? 'claim_form.reopened' : 'claim_form.closed', entity: 'ClaimForm', entityId: id, summary: `${status === 'open' ? 'Reopened' : 'Closed'} claim form "${form.name}"`, product: 'muster' })
    revalidatePath(FORMS)
    revalidatePath(`${FORMS}/${id}`)
    return ok(status === 'closed' ? `Submissions closed for ${form.name}. Its link no longer takes claims.` : `${form.name} reopened. Its link takes claims until ${formatDate(companyDay(form.closesAt))}.`)
  },
  OPTS,
)

const categorySchema = z.object({
  id: objectId.optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]*$/, 'Start with a letter; use A–Z, 0–9 and _').min(2).max(20),
  name: requiredText('Name', 60),
  maxAmount: paise.optional(),
  displayOrder: z.coerce.number().int().min(0).max(9999).default(0),
})

export const saveClaimCategory = action(
  categorySchema,
  async ({ id, code, name, maxAmount, displayOrder }, ctx) => {
    if (maxAmount !== undefined && maxAmount > MAX_CATEGORY_CEILING_PAISE) return fail('Some fields need attention.', { maxAmount: 'At most ₹10 crore, or leave it blank for no ceiling' })
    const ceiling = maxAmount && maxAmount > 0 ? maxAmount : null
    if (id) {
      const existing = await ctx.db(ClaimCategory).findById(id).lean()
      if (!existing) throw new NotFoundError('That category')
      await ctx.db(ClaimCategory).updateOne({ _id: id }, { $set: { name, maxAmount: ceiling, displayOrder } })
      await audit(ctx, { action: 'claim_category.updated', entity: 'ClaimCategory', entityId: id, summary: `Claim category ${existing.code} updated`, product: 'muster' })
    } else {
      const taken = await ctx.db(ClaimCategory).findOne({ code }).lean()
      if (taken) return fail('Some fields need attention.', { code: `The code ${code} already belongs to ${taken.name}.` })
      const created = await ctx.db(ClaimCategory).create({ code, name, maxAmount: ceiling, displayOrder, isActive: true })
      await audit(ctx, { action: 'claim_category.added', entity: 'ClaimCategory', entityId: created._id, summary: `Claim category added: ${name} (${code})`, product: 'muster' })
    }
    revalidatePath(FORMS)
    return ok(`${name} saved${ceiling ? `, capped at ${formatINR(ceiling)} a claim` : ', no ceiling'}.`)
  },
  OPTS,
)

export const setClaimCategoryActive = action(
  z.object({ id: objectId, active: z.boolean() }),
  async ({ id, active }, ctx) => {
    const c = await ctx.db(ClaimCategory).findOneAndUpdate({ _id: id }, { $set: { isActive: active } })
    if (!c) throw new NotFoundError('That category')
    await audit(ctx, { action: active ? 'claim_category.restored' : 'claim_category.retired', entity: 'ClaimCategory', entityId: id, summary: `${active ? 'Restored' : 'Retired'} claim category ${c.code}`, product: 'muster' })
    revalidatePath(FORMS)
    return ok(active ? `${c.name} restored.` : `${c.name} retired. Existing claims keep it; new forms cannot use it.`)
  },
  OPTS,
)

export const loadStandardCategories = action(
  z.object({}),
  async (_input, ctx) => {
    const existing = new Set(await ctx.db(ClaimCategory).distinct('code'))
    const missing = STANDARD_CATEGORIES.filter((c) => !existing.has(c.code))
    if (!missing.length) return ok('Every standard category is already here.')
    await ctx.db(ClaimCategory).insertMany(missing.map((c, i) => ({ ...c, maxAmount: null, displayOrder: (i + 1) * 10, isActive: true })))
    await audit(ctx, { action: 'claim_category.loaded', entity: 'ClaimCategory', summary: `Loaded ${missing.length} standard claim categories`, product: 'muster' })
    revalidatePath(FORMS)
    return ok(`${missing.length} standard categor${missing.length === 1 ? 'y' : 'ies'} added.`)
  },
  OPTS,
)
