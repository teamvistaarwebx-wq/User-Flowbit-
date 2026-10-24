import { z } from 'zod'
import { PRODUCTS } from '@/lib/catalog'
import { email } from '@/lib/validation'
import {
  COMPANY_MAX, COMPANY_MIN, DEMO_PRODUCTS, DEMO_TEAM_SIZES, HONEYPOT_FIELD, MESSAGE_MAX, MESSAGE_MIN, NAME_MAX, NAME_MIN,
  TEAM_SIZE_LABELS, type DemoProduct, type DemoTeamSize,
} from './demo'

/** Server-side validation for the /contact demo request (pure; tested). */
export const demoRequestSchema = z.object({
  name: z
    .string({ error: 'Enter your name' })
    .trim()
    .min(NAME_MIN, 'Enter your name')
    .max(NAME_MAX, `Keep your name under ${NAME_MAX} characters`),
  email: z.string({ error: 'Enter your work email' }).pipe(email),
  company: z
    .string({ error: 'Enter your company name' })
    .trim()
    .min(COMPANY_MIN, 'Enter your company name')
    .max(COMPANY_MAX, `Keep the company name under ${COMPANY_MAX} characters`),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{6,17}$/, 'Enter a phone number like +91 98765 43210')
    .optional(),
  teamSize: z.enum(DEMO_TEAM_SIZES, { error: 'Choose your team size' }),
  products: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(DEMO_PRODUCTS))),
  message: z
    .string({ error: 'Tell us a little about your team' })
    .trim()
    .min(MESSAGE_MIN, `Write at least ${MESSAGE_MIN} characters so we can prepare`)
    .max(MESSAGE_MAX, `Keep the message under ${MESSAGE_MAX.toLocaleString('en-IN')} characters`),
  [HONEYPOT_FIELD]: z.string().optional(),
})

export type DemoRequestInput = z.output<typeof demoRequestSchema>

/** True when the hidden honeypot was filled: treat as a bot, pretend success, store nothing. */
export const isBot = (input: DemoRequestInput) => Boolean(input[HONEYPOT_FIELD]?.trim())

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name

export const productNames = (products: readonly DemoProduct[]) =>
  products.length ? products.map((p) => PRODUCTS[p].name).join(', ') : 'Not sure yet'

export const teamSizeLabel = (size: DemoTeamSize) => `${TEAM_SIZE_LABELS[size]} people`

/** Subject and plain paragraphs for the staff notification (emailLayout escapes them). */
export function demoRequestMail(input: Pick<DemoRequestInput, 'name' | 'email' | 'company' | 'phone' | 'teamSize' | 'products' | 'message'>) {
  return {
    subject: `Demo request: ${input.company} (${teamSizeLabel(input.teamSize)})`,
    paragraphs: [
      `${input.name} from ${input.company} asked for a Flowbit demo.`,
      `Email: ${input.email}${input.phone ? ` · Phone: ${input.phone}` : ''}`,
      `Team size: ${teamSizeLabel(input.teamSize)} · Interested in: ${productNames(input.products)}`,
      `Message: ${input.message}`,
    ],
  }
}

/** Where staff notifications go: PLATFORM_ADMIN_EMAILS, or the support inbox when none are set. */
export const demoRecipients = (adminEmails: readonly string[], supportEmail: string) =>
  adminEmails.length ? [...adminEmails] : [supportEmail]
