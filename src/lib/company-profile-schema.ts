import { z } from 'zod'
import { checkbox, email, gstin, gstinStateIssue, optionalText, pan, phone, pincode, requiredText, stateCode } from '@/lib/validation'

/** Form schemas for Settings → Company profile (client-safe, so the form and the server agree). */

const CIN = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/
const LLPIN = /^[A-Z]{3}-\d{4}$/
const WEBSITE = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i

const blank = (v: unknown) => (typeof v === 'string' && !v.trim() ? undefined : v)
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional())

export const cinLlpin = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => CIN.test(v) || LLPIN.test(v), 'Enter a 21-character CIN or an LLPIN like AAB-1234')

export const website = z
  .string()
  .trim()
  .max(200, 'This is too long')
  .refine((v) => WEBSITE.test(v), 'Enter a website like www.example.com')
  .transform((v) => v.replace(/\/+$/, ''))

export const companyProfileSchema = z
  .object({
    legalName: requiredText('Legal name', 160),
    tradeName: optionalText(160),
    gstRegistered: z.enum(['yes', 'no'], { error: 'Choose whether the company is GST registered' }),
    gstin: optional(gstin),
    pan: optional(pan),
    cinLlpin: optional(cinLlpin),
    website: optional(website),
    email: optional(email),
    phone: optional(phone),
    line1: requiredText('Address line 1', 120),
    line2: optionalText(120),
    city: requiredText('City', 60),
    state: stateCode,
    pincode,
  })
  .superRefine((v, issue) => {
    if (v.gstRegistered === 'no') return
    if (!v.gstin) {
      issue.addIssue({ code: 'custom', path: ['gstin'], message: 'Enter the GSTIN, or choose Not registered' })
      return
    }
    const mismatch = gstinStateIssue(v.gstin, v.state)
    if (mismatch) issue.addIssue({ code: 'custom', path: ['gstin'], message: mismatch })
    if (v.pan && v.gstin.slice(2, 12) !== v.pan) issue.addIssue({ code: 'custom', path: ['pan'], message: `The PAN inside this GSTIN is ${v.gstin.slice(2, 12)}` })
  })

export type CompanyProfileInput = z.output<typeof companyProfileSchema>

export const signatorySchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  name: requiredText('Name', 80),
  designation: requiredText('Designation', 80),
  isDefault: checkbox,
  removeSeal: checkbox,
})

export type SignatoryInput = z.output<typeof signatorySchema>
