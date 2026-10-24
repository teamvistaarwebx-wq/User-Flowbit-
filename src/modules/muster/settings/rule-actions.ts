'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { NotFoundError } from '@/lib/errors'
import { saveUpload } from '@/lib/files'
import { checkbox, hhmm, listOf, objectId, optionalText, requiredText } from '@/lib/validation'
import { Org } from '@/models/Org'
import { LeaveType } from '@/models/muster/LeaveType'
import { MusterPolicy, PolicyDocument } from '@/models/muster/Policy'
import { ACCRUAL_MODELS } from '../leave/accrual'
import { docLabel, DOCUMENT_TYPES, STANDARD_LEAVE_TYPES } from './defaults'
import { BREAK_LABEL, BREAK_TYPES, MAX_BREAK_LIMIT, MIN_BREAK_LIMIT, mergeBreakPolicies, type BreakType } from '@/lib/break-types'

const SETTINGS = '/app/hr/settings'
const OPTS = { product: 'muster', perm: 'hr.settings' } as const

const blankToNull = z.preprocess((v) => (v === undefined || v === '' ? null : v), z.coerce.number().int('Use a whole number').min(0, 'Use 0–365').max(365, 'Use 0–365').nullable())

const leaveTypeSchema = z.object({
  id: objectId.optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,19}$/, 'Use 2–20 capitals, digits or _, starting with a letter'),
  name: z.string().trim().min(2, 'Enter a name').max(60),
  isPaid: checkbox,
  accrualModel: z.enum(ACCRUAL_MODELS),
  annualQuota: z.coerce.number().min(0, 'Use 0–365').max(365, 'Use 0–365').default(0),
  accrualPerMonth: z.coerce.number().min(0, 'Use 0–31').max(31, 'Use 0–31').default(0),
  carryForwardCap: blankToNull,
  proofRequiredAfterDays: blankToNull,
  allowHalfDay: checkbox,
  requiresProof: checkbox,
  displayOrder: z.coerce.number().int('Use a whole number').min(0, 'Use 0–9999').max(9999, 'Use 0–9999').default(0),
})

export const saveLeaveType = action(
  leaveTypeSchema,
  async ({ id, ...input }, ctx) => {
    const clash = await ctx.db(LeaveType).findOne({ code: input.code, ...(id ? { _id: { $ne: id } } : {}) }).lean()
    if (clash) return fail(`The code ${input.code} already belongs to ${clash.name}.`, { code: 'Already used' })
    if (id) {
      const res = await ctx.db(LeaveType).updateOne({ _id: id }, { $set: input })
      if (!res.matchedCount) throw new NotFoundError('That leave type')
    } else {
      await ctx.db(LeaveType).create({ ...input, isActive: true })
    }
    await audit(ctx, { action: id ? 'leave_type.updated' : 'leave_type.added', entity: 'LeaveType', entityId: id ?? input.code, summary: `Leave type ${id ? 'saved' : 'added'}: ${input.name} (${input.code})`, product: 'muster', meta: input })
    revalidatePath(SETTINGS)
    return ok(`Leave type ${id ? 'saved' : 'added'}: ${input.name} (${input.code}).`)
  },
  OPTS,
)

export const setLeaveTypeActive = action(
  z.object({ id: objectId, active: z.boolean() }),
  async ({ id, active }, ctx) => {
    const type = await ctx.db(LeaveType).findOneAndUpdate({ _id: id }, { $set: { isActive: active } }).lean()
    if (!type) throw new NotFoundError('That leave type')
    const unpaidLeft = await ctx.db(LeaveType).exists({ isActive: true, isPaid: false })
    await audit(ctx, { action: active ? 'leave_type.restored' : 'leave_type.retired', entity: 'LeaveType', entityId: id, summary: `${type.name} ${active ? 'restored' : 'retired'}`, product: 'muster' })
    revalidatePath(SETTINGS)
    const warning = unpaidLeft ? '' : ' There is no active unpaid leave type now; add one so loss-of-pay leave can be recorded.'
    return ok(`${type.name} ${active ? 'restored' : 'retired. Existing requests keep it'}.${warning}`)
  },
  OPTS,
)

export const loadStandardLeaveTypes = action(
  z.object({}),
  async (_input, ctx) => {
    const existing = new Set((await ctx.db(LeaveType).distinct('code')).map(String))
    const missing = STANDARD_LEAVE_TYPES.filter((t) => !existing.has(t.code))
    if (!missing.length) return ok('Every standard leave type is already here.')
    await ctx.db(LeaveType).insertMany(missing.map((t) => ({ ...t, isActive: true })))
    await audit(ctx, { action: 'leave_type.standard_loaded', entity: 'LeaveType', summary: `Loaded ${missing.length} standard leave types`, product: 'muster', meta: { codes: missing.map((t) => t.code) } })
    revalidatePath(SETTINGS)
    return ok(`Added ${missing.length} standard leave types: ${missing.map((t) => t.code).join(', ')}.`)
  },
  OPTS,
)

export const saveLeavePolicy = action(
  z.object({
    leaveYearStartMonth: z.coerce.number().int('Use a whole number').min(1, 'Use 1–12').max(12, 'Use 1–12'),
    carryForwardPercent: z.coerce.number().min(0, 'Use 0–100').max(100, 'Use 0–100'),
    allowNegativeBalance: checkbox,
    internDays: z.coerce.number().int('Use a whole number').min(0, 'Use 0–365').max(365, 'Use 0–365'),
    probationDays: z.coerce.number().int('Use a whole number').min(0, 'Use 0–365').max(365, 'Use 0–365'),
    confirmedDays: z.coerce.number().int('Use a whole number').min(0, 'Use 0–365').max(365, 'Use 0–365'),
  }),
  async (input, ctx) => {
    await ctx.db(MusterPolicy).updateOne(
      {},
      { $set: { 'leave.leaveYearStartMonth': input.leaveYearStartMonth, 'leave.carryForwardPercent': input.carryForwardPercent, 'leave.allowNegativeBalance': input.allowNegativeBalance, 'notice.internDays': input.internDays, 'notice.probationDays': input.probationDays, 'notice.confirmedDays': input.confirmedDays } },
      { upsert: true },
    )
    await audit(ctx, { action: 'muster.leave_policy_saved', entity: 'MusterPolicy', summary: 'Leave and notice policy saved', product: 'muster', meta: input })
    revalidatePath(SETTINGS)
    return ok('Leave policy saved. Balances use it from now on.')
  },
  OPTS,
)

const breakPolicySchema = z.object({
  paid: checkbox,
  limitMinutes: z.coerce.number().int('Use a whole number').min(MIN_BREAK_LIMIT, `Use ${MIN_BREAK_LIMIT}–${MAX_BREAK_LIMIT}`).max(MAX_BREAK_LIMIT, `Use ${MIN_BREAK_LIMIT}–${MAX_BREAK_LIMIT}`),
})

export const saveAttendanceRules = action(
  z.object({
    start: hhmm,
    end: hhmm,
    graceMinutes: z.coerce.number().int('Use a whole number').min(0, 'Use 0–180').max(180, 'Use 0–180'),
    halfDayHours: z.coerce.number().min(1, 'Use 1–12').max(12, 'Use 1–12'),
    workWeek: listOf(z.coerce.number().int('Use a whole number').min(0, 'Use 0–6').max(6, 'Use 0–6')),
    unmarkedPolicy: z.enum(['present', 'absent', 'pending']),
    correctionWindowDays: z.coerce.number().int('Use a whole number').min(1, 'Use 1–365').max(365, 'Use 1–365'),
    compOffValidDays: z.coerce.number().int('Use a whole number').min(0, 'Use 0–365').max(365, 'Use 0–365'),
    breaks: z.object(Object.fromEntries(BREAK_TYPES.map((t) => [t, breakPolicySchema])) as Record<BreakType, typeof breakPolicySchema>).optional(),
  }),
  async (input, ctx) => {
    if (input.end <= input.start) return fail('Office hours must end after they start.', { end: 'Before the start' })
    const workWeek = [...new Set(input.workWeek)].sort()
    if (!workWeek.length) return fail('Pick at least one working day.', { workWeek: 'Pick at least one' })
    if (workWeek.length === 7) return fail('Leave at least one weekly off.', { workWeek: 'All seven are working days' })
    const breakTypes = input.breaks ? mergeBreakPolicies(input.breaks) : null
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'officeHours.start': input.start, 'officeHours.end': input.end, 'officeHours.graceMinutes': input.graceMinutes, 'officeHours.halfDayHours': input.halfDayHours, workWeek, ...(breakTypes ? { breakTypes } : {}) } })
    await ctx.db(MusterPolicy).updateOne(
      {},
      { $set: { 'attendance.unmarkedPolicy': input.unmarkedPolicy, 'attendance.correctionWindowHours': input.correctionWindowDays * 24, 'attendance.compOffValidDays': input.compOffValidDays } },
      { upsert: true },
    )
    await audit(ctx, { action: 'muster.attendance_rules_saved', entity: 'Org', entityId: ctx.orgId, summary: `Attendance rules saved: ${input.start}–${input.end}, late after ${input.graceMinutes} min, half day under ${input.halfDayHours} h${breakTypes ? `; breaks ${BREAK_TYPES.map((t) => `${BREAK_LABEL[t]} ${breakTypes[t].paid ? 'paid' : 'unpaid'} ${breakTypes[t].limitMinutes} min`).join(', ')}` : ''}`, product: 'muster', meta: { ...input, workWeek } })
    revalidatePath(SETTINGS)
    revalidatePath('/app/hr/attendance')
    return ok('Attendance rules saved. Check-ins and the register use them from now on.')
  },
  OPTS,
)

export const saveOnboardingRules = action(
  z.object({
    mandatoryDocuments: listOf(z.enum(DOCUMENT_TYPES, { error: 'Pick from the list' })),
    thresholdPercent: z.coerce.number({ error: 'Enter a percentage' }).int('Use a whole number').min(0, 'At least 0%').max(100, 'At most 100%'),
  }),
  async (input, ctx) => {
    const mandatoryDocuments = DOCUMENT_TYPES.filter((t) => input.mandatoryDocuments.includes(t))
    await ctx.db(MusterPolicy).updateOne({}, { $set: { 'onboarding.mandatoryDocuments': mandatoryDocuments, 'onboarding.thresholdPercent': input.thresholdPercent } }, { upsert: true })
    await audit(ctx, { action: 'muster.onboarding_rules_saved', entity: 'MusterPolicy', summary: `Joining documents: ${mandatoryDocuments.length} mandatory, ${input.thresholdPercent}% needed to start`, product: 'muster', meta: { mandatoryDocuments, thresholdPercent: input.thresholdPercent } })
    revalidatePath(SETTINGS)
    revalidatePath('/app/hr/people')
    const list = mandatoryDocuments.length ? mandatoryDocuments.map(docLabel).join(', ') : 'nothing'
    return ok(`Joining documents saved: ${list} mandatory, ${input.thresholdPercent}% needed before someone can start.`)
  },
  OPTS,
)

export const uploadPolicyDocument = action(
  z.object({ title: requiredText('Title', 120), category: optionalText(60), description: optionalText(500), file: z.instanceof(File, { error: 'Choose a PDF to upload' }) }),
  async (input, ctx) => {
    const stored = await saveUpload(ctx, input.file, { kind: 'policy', entity: 'PolicyDocument', accept: ['application/pdf'] })
    if (!stored) return fail('Choose a PDF to upload.', { file: 'Choose a file' })
    await ctx.db(PolicyDocument).create({ title: input.title, category: input.category, description: input.description, fileId: stored._id, fileName: stored.name, sizeBytes: stored.size, publishedBy: ctx.userId, publishedByName: ctx.user.name })
    await audit(ctx, { action: 'policy_document.published', entity: 'PolicyDocument', summary: `Policy published: ${input.title}`, product: 'muster' })
    revalidatePath(SETTINGS)
    return ok(`"${input.title}" published. Everyone sees it under My documents.`)
  },
  OPTS,
)

export const archivePolicyDocument = action(
  z.object({ id: objectId, reason: requiredText('Reason', 300) }),
  async ({ id, reason }, ctx) => {
    const doc = await ctx.db(PolicyDocument).findOneAndUpdate({ _id: id, archivedAt: null }, { $set: { archivedAt: new Date(), archivedReason: reason } }).lean()
    if (!doc) throw new NotFoundError('That policy document')
    await audit(ctx, { action: 'policy_document.archived', entity: 'PolicyDocument', entityId: id, summary: `Policy archived: ${doc.title}`, product: 'muster', meta: { reason } })
    revalidatePath(SETTINGS)
    return ok(`"${doc.title}" archived. It no longer shows to employees.`)
  },
  OPTS,
)
