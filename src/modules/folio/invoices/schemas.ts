import { z } from 'zod'
import { isoDate, objectId, optionalText, requiredText } from '@/lib/validation'
import { BUILDER_BILLING_TYPES, QUOTE_KINDS, SUPPLY_MODES } from '../types'

/**
 * Zod schemas for the document builder (invoices and quotes). Rates arrive in
 * rupees and leave as paise; every total is recomputed on the server.
 */

const MAX_RATE_RUPEES = 10_00_00_000
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v)
const optionalId = z.preprocess(blankToUndefined, objectId.optional())
const optionalDate = z.preprocess(blankToUndefined, isoDate.optional())

const decimals = (value: number, places: number) => Math.abs(Math.round(value * 10 ** places) - value * 10 ** places) < 1e-6

const number = (label: string) => z.preprocess((v) => (typeof v === 'string' ? Number(v.replace(/[₹,\s]/g, '')) : v), z.number({ error: `${label} must be a number` }).refine(Number.isFinite, `${label} must be a number`))

export const lineSchema = z.object({
  serviceItemId: optionalId,
  description: requiredText('Description', 500),
  hsnSac: z.preprocess(blankToUndefined, z.string().trim().regex(/^\d{4,8}$/, 'SAC/HSN is 4 to 8 digits').optional()),
  quantity: number('Quantity').pipe(z.number().gt(0, 'Quantity must be above zero').max(1_000_000, 'Quantity is too large').refine((v) => decimals(v, 3), 'Use at most 3 decimals')),
  unit: z.preprocess((v) => blankToUndefined(v) ?? 'nos', z.string().trim().min(1).max(20, 'Unit is too long')),
  rate: number('Rate').pipe(z.number().min(0, 'Rate cannot be negative').max(MAX_RATE_RUPEES, 'Rate is too large').refine((v) => decimals(v, 2), 'Use at most 2 decimals')),
  discountPercent: z.preprocess((v) => blankToUndefined(v) ?? 0, number('Discount').pipe(z.number().min(0).max(100, 'Discount is at most 100%'))),
  gstRatePercent: z.preprocess((v) => blankToUndefined(v) ?? 0, number('GST rate').pipe(z.number().min(0).max(100))),
})

export type LineInputRaw = z.output<typeof lineSchema>

const commonFields = {
  entityId: objectId,
  clientId: objectId,
  subject: optionalText(200),
  placeOfSupplyStateCode: z.preprocess(blankToUndefined, z.string().regex(/^\d{2}$/, 'Choose a state').optional()),
  supplyMode: z.preprocess((v) => blankToUndefined(v) ?? 'auto', z.enum(SUPPLY_MODES)),
  lines: z.array(lineSchema, { error: 'Add at least one line' }).min(1, 'Add at least one line').max(100, 'An invoice can have at most 100 lines'),
  discountType: z.preprocess((v) => blankToUndefined(v) ?? 'none', z.enum(['none', 'percent', 'amount'])),
  discountValue: z.preprocess((v) => blankToUndefined(v) ?? 0, number('Discount').pipe(z.number().min(0, 'Discount cannot be negative'))),
  notes: optionalText(2000),
  terms: optionalText(2000),
  dealId: optionalId,
}

const discountCheck = (v: { discountType: string; discountValue: number }, ctx: z.RefinementCtx) => {
  if (v.discountType === 'percent' && v.discountValue > 100) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'A percentage discount is at most 100' })
}

export const invoiceFormSchema = z
  .object({
    ...commonFields,
    id: optionalId,
    issueDate: isoDate,
    paymentTermsDays: z.coerce.number({ error: 'Terms must be a number' }).int('Use whole days').min(0, 'Terms cannot be negative').max(365, 'At most 365 days'),
    billingType: z.preprocess((v) => blankToUndefined(v) ?? 'one_time', z.enum(BUILDER_BILLING_TYPES)),
    purchaseOrderRef: optionalText(60),
    bankAccountId: optionalId,
    reverseCharge: z.union([z.literal('on'), z.literal('true'), z.literal('false'), z.boolean()]).optional().transform((v) => v === true || v === 'on' || v === 'true'),
    periodStart: optionalDate,
    periodEnd: optionalDate,
    internalNotes: optionalText(2000),
    quoteId: optionalId,
  })
  .superRefine((v, ctx) => {
    discountCheck(v, ctx)
    if (v.periodStart && v.periodEnd && v.periodEnd < v.periodStart) ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'The period cannot end before it starts' })
  })

export type InvoiceFormInput = z.output<typeof invoiceFormSchema>

export const quoteFormSchema = z
  .object({
    ...commonFields,
    id: optionalId,
    kind: z.preprocess((v) => blankToUndefined(v) ?? 'quote', z.enum(QUOTE_KINDS)),
    quoteDate: isoDate,
    validUntil: isoDate,
  })
  .superRefine((v, ctx) => {
    discountCheck(v, ctx)
    if (v.validUntil < v.quoteDate) ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'Valid until cannot be before the quote date' })
  })

export type QuoteFormInput = z.output<typeof quoteFormSchema>
