import { z } from 'zod'
import { TALLY_LEDGER_KEYS, type TallyLedgerKey } from '../tally/ledgers'
import { checkbox, objectId, optionalText, paise, requiredText } from '@/lib/validation'
import { isValidGstin, stateCodeOfGstin } from '../engine/gst'
import { FY_FORMATS } from '../engine/numbering'
import { seriesLengthProblems } from '../engine/series-rules'
import { ENTITY_KINDS } from '../types'

/** Zod schemas for Folio settings forms. Error copy follows folio.md 7.14. */

const blank = (v: unknown) => (v === '' || v === null ? undefined : v)
const optionalId = z.preprocess(blank, objectId.optional())
const upper = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : v)
const prefix = (label: string) => z.preprocess(upper, z.string({ error: `${label} is required` }).regex(/^[A-Z0-9-]{1,12}$/, 'Use 1–12 letters, digits or hyphens'))

export const entitySchema = z
  .object({
    id: optionalId,
    code: z.preprocess(upper, z.string({ error: 'Code is required' }).regex(/^[A-Z0-9]{2,10}$/, 'Use 2–10 letters or digits, like VWX')),
    legalName: requiredText('Legal name', 160),
    tradeName: optionalText(160),
    kind: z.enum(ENTITY_KINDS),
    gstin: z.preprocess((v) => blank(upper(v)), z.string().optional()),
    pan: z.preprocess((v) => blank(upper(v)), z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'That is not a valid PAN. It should look like AAXFS1234A.').optional()),
    cinLlpin: optionalText(30),
    address: z.object({
      line1: requiredText('Address line 1', 200),
      line2: optionalText(200),
      city: requiredText('City', 80),
      stateCode: z.string({ error: 'Choose a state' }).regex(/^\d{2}$/, 'Choose a state'),
      pincode: z.string({ error: 'PIN code is required' }).trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit PIN code'),
    }),
    email: z.preprocess(blank, z.string().trim().toLowerCase().email('Enter a valid email address').optional()),
    phone: optionalText(20),
    website: optionalText(120),
    logo: z.instanceof(File).optional(),
    removeLogo: checkbox,
    isDefault: checkbox,
    isActive: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'gst') {
      if (!v.gstin) ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'A GST-registered firm must have a GSTIN.' })
      else if (!isValidGstin(v.gstin)) ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'That is not a valid GSTIN. It should be 15 characters, like 27AABCA1234B1Z9.' })
      else if (stateCodeOfGstin(v.gstin) !== v.address.stateCode) ctx.addIssue({ code: 'custom', path: ['gstin'], message: `This GSTIN is registered in state ${stateCodeOfGstin(v.gstin)}, but the address is in state ${v.address.stateCode}.` })
    } else if (v.gstin) {
      ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'A non-GST firm cannot hold a GSTIN.' })
    }
  })

export const bankAccountSchema = z.object({
  entityId: objectId,
  id: optionalId,
  label: requiredText('Label', 60),
  accountName: requiredText('Account name', 120),
  accountNumber: z.preprocess((v) => (typeof v === 'string' ? v.replace(/\s+/g, '') : v), z.string({ error: 'Account number is required' }).regex(/^\d{9,18}$/, 'Use 9 to 18 digits')),
  ifsc: z.preprocess(upper, z.string({ error: 'IFSC is required' }).regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC, like HDFC0001234.')),
  bankName: requiredText('Bank', 80),
  branch: optionalText(80),
  upiId: z.preprocess(blank, z.string().trim().regex(/^[\w.-]+@[\w.-]+$/, 'Enter a UPI id like name@bank').optional()),
  isDefault: checkbox,
})

export const seriesSchema = z.object({
  entityId: objectId,
  invoicePrefix: prefix('Invoice prefix'),
  creditNotePrefix: prefix('Credit note prefix'),
  receiptPrefix: prefix('Receipt prefix'),
  quotePrefix: prefix('Quote prefix'),
  proformaPrefix: prefix('Proforma prefix'),
  padding: z.coerce.number().int().min(3, 'At least 3').max(6, 'At most 6'),
  fyFormat: z.enum(FY_FORMATS, { error: 'Choose how the year prints' }).default('long'),
}).superRefine((v, ctx) => {
  // GST documents allow at most 16 characters (CGST Rule 46(b)); refuse a series that cannot fit.
  for (const p of seriesLengthProblems(v)) ctx.addIssue({ code: 'custom', path: [p.field], message: p.message })
})

export const taxSettingsSchema = z.object({
  taxRates: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.coerce.number().min(0).max(100)).min(1, 'Keep at least one rate')),
  roundOffTotal: checkbox,
  showTdsOnInvoice: checkbox,
  defaultValidityDays: z.coerce.number().int().min(1, 'At least 1 day').max(365, 'At most 365 days'),
})

export const termsSchema = z.object({
  entityId: objectId,
  paymentTermsDays: z.coerce.number().int('Use whole days').min(0).max(365, 'At most 365 days'),
  gstRatePercent: z.coerce.number().min(0).max(100),
  terms: optionalText(2000),
  notes: optionalText(2000),
})

export const signatorySchema = z.object({
  entityId: objectId,
  signatoryName: optionalText(120),
  signatoryTitle: optionalText(120),
  signature: z.instanceof(File).optional(),
  removeSignature: checkbox,
})

export const serviceItemSchema = z.object({
  id: optionalId,
  code: z.preprocess(upper, z.string({ error: 'Code is required' }).regex(/^[A-Z0-9-]{2,20}$/, 'Use 2–20 letters, digits or hyphens')),
  name: requiredText('Name', 120),
  description: optionalText(500),
  hsnSac: z.preprocess(blank, z.string().trim().regex(/^\d{4,8}$/, 'SAC/HSN is 4 to 8 digits').optional()),
  unit: z.preprocess((v) => blank(v) ?? 'nos', z.string().trim().max(20)),
  rate: paise,
  gstRatePercent: z.coerce.number().min(0).max(100),
})

export const remindersSchema = z.object({
  enabled: checkbox,
  autoRetainerDrafts: checkbox,
  cadence: z
    .string({ error: 'Enter the days' })
    .transform((v) => v.split(',').map((d) => d.trim()).filter(Boolean).map(Number))
    .refine((days) => days.every((d) => Number.isInteger(d) && d >= -30 && d <= 365), 'Use whole days from -30 to 365')
    .refine((days) => days.length >= 1 && days.length <= 8, 'Use 1 to 8 days')
    .refine((days) => new Set(days).size === days.length, 'Each day can appear once')
    .transform((days) => [...days].sort((a, b) => a - b)),
  channels: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(['email', 'whatsapp'])).min(1, 'Pick at least one channel.')),
})

/** Tally ledger names (blank keeps the default) and the Tally company name. */
export const tallySettingsSchema = z.object({
  company: z.string().trim().max(120).optional(),
  ...Object.fromEntries(TALLY_LEDGER_KEYS.map((k) => [k, z.string().trim().max(100).optional()])) as Record<TallyLedgerKey, z.ZodOptional<z.ZodString>>,
})
