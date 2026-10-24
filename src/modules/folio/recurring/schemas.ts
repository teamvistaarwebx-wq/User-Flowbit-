import { z } from 'zod'
import { checkbox, isoDate, objectId, optionalText, paise, requiredText } from '@/lib/validation'
import { PLAN_STATUSES, RETAINER_FREQUENCIES } from '../types'

/** Zod schemas for retainers and billing plans (forms post rupees; paise come out). */

const blank = (v: unknown) => (v === '' || v === null ? undefined : v)
const optionalDate = z.preprocess(blank, isoDate.optional())
const optionalId = z.preprocess(blank, objectId.optional())
const sac = z.preprocess(blank, z.string().trim().regex(/^\d{4,8}$/, 'SAC/HSN is 4 to 8 digits').optional())
const rate = z.coerce.number({ error: 'GST rate must be a number' }).min(0).max(100)

export const retainerSchema = z
  .object({
    id: optionalId,
    clientId: objectId,
    entityId: objectId,
    name: requiredText('Name', 120).refine((v) => v.length >= 2, 'Use at least 2 characters'),
    description: optionalText(500),
    hsnSac: sac,
    amount: paise.refine((v) => v > 0, 'Enter an amount above zero'),
    gstRatePercent: z.preprocess((v) => blank(v) ?? 0, rate),
    frequency: z.enum(RETAINER_FREQUENCIES),
    startDate: isoDate,
    endDate: optionalDate,
    billingDay: z.coerce.number({ error: 'Billing day must be a number' }).int().min(1, 'Use 1 to 31').max(31, 'Use 1 to 31'),
    billInAdvance: checkbox,
    autoGenerate: checkbox,
    paymentTermsDays: z.preprocess(blank, z.coerce.number().int('Use whole days').min(0).max(365).optional()),
    hoursPerMonth: z.preprocess(blank, z.coerce.number({ error: 'Hours must be a number' }).min(0, 'Use 0 or more').max(10_000, 'At most 10,000').optional()),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'A retainer cannot end before it starts.' })
  })

export type RetainerInput = z.output<typeof retainerSchema>

const phaseSchema = z
  .object({
    id: optionalId,
    name: requiredText('Phase name', 120),
    description: optionalText(500),
    mode: z.enum(['percent', 'amount']),
    percent: z.preprocess(blank, z.coerce.number().gt(0, 'Above 0').max(100, 'At most 100').optional()),
    amount: z.preprocess(blank, paise.optional()),
    dueOn: optionalDate,
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'percent' && v.percent == null) ctx.addIssue({ code: 'custom', path: ['percent'], message: 'Enter the share of the value' })
    if (v.mode === 'amount' && !v.amount) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter the amount' })
  })

export const planSchema = z
  .object({
    id: optionalId,
    clientId: objectId,
    entityId: objectId,
    workProjectId: optionalId,
    name: requiredText('Name', 160),
    description: optionalText(1000),
    hsnSac: sac,
    totalValue: paise.refine((v) => v > 0, 'Enter the agreed value'),
    gstRatePercent: z.preprocess((v) => blank(v) ?? 0, rate),
    startDate: optionalDate,
    targetEndDate: optionalDate,
    status: z.preprocess((v) => blank(v) ?? 'active', z.enum(PLAN_STATUSES)),
    notes: optionalText(2000),
    milestones: z.preprocess((v) => v ?? [], z.array(phaseSchema).max(40, 'At most 40 phases')),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.targetEndDate && v.targetEndDate < v.startDate) ctx.addIssue({ code: 'custom', path: ['targetEndDate'], message: 'The target end cannot be before the start' })
  })

export type PlanInput = z.output<typeof planSchema>
