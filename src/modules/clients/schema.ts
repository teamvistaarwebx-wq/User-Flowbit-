/** Client form schema (shared clients pages). Pure. */
import { z } from 'zod'
import { CLIENT_KINDS, CLIENT_STATUSES } from '@/models/Client'
import { gstin, gstinStateIssue, optionalText, pan, pincode, stateCode } from '@/lib/validation'
import { blank, optEmail, optId, optPhone, optUrl } from '@/modules/orbit/schemas'

const opt = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional())

export const clientFieldsSchema = z
  .object({
    kind: z.enum(CLIENT_KINDS).default('company'),
    name: z.string({ error: 'Name is required' }).trim().min(2, 'Use at least 2 characters').max(120, 'Keep the name under 120 characters'),
    displayName: optionalText(120),
    email: optEmail,
    phone: optPhone,
    website: optUrl,
    gstin: opt(gstin),
    pan: opt(pan),
    state: opt(stateCode),
    billingAddress: z
      .object({ line1: optionalText(200), line2: optionalText(200), city: optionalText(80), state: opt(stateCode), pincode: opt(pincode), country: optionalText(60) })
      .optional(),
    ownerId: optId,
    /** Comma-separated in the form. */
    tags: z.preprocess((v) => (typeof v === 'string' ? v.split(',') : (v ?? [])), z.array(z.string().trim().max(30, 'Keep tags under 30 characters')).transform((t) => [...new Set(t.filter(Boolean))].slice(0, 12))),
    source: optionalText(60),
    sector: optionalText(60),
    status: z.enum(CLIENT_STATUSES).default('active'),
    notes: optionalText(2000),
  })
  .superRefine((v, c) => {
    const issue = gstinStateIssue(v.gstin, v.state)
    if (issue) c.addIssue({ code: 'custom', path: ['gstin'], message: issue })
    if (v.gstin && v.pan && v.gstin.slice(2, 12) !== v.pan) c.addIssue({ code: 'custom', path: ['pan'], message: 'The PAN should match characters 3–12 of the GSTIN' })
  })

export const firstContactSchema = z
  .object({ name: optionalText(80), role: optionalText(60), email: optEmail, phone: optPhone })
  .optional()

export const contactSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(2, 'Use at least 2 characters').max(80, 'Keep the name under 80 characters'),
  role: optionalText(60),
  email: optEmail,
  phone: optPhone,
  primary: z.union([z.literal('on'), z.literal('true'), z.literal('false'), z.boolean()]).optional().transform((v) => v === true || v === 'on' || v === 'true'),
})
