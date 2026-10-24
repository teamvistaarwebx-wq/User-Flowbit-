/** Zod schemas shared by Orbit's server actions (kept out of 'use server' files). */
import { z } from 'zod'
import { email, hhmm, isoDate, objectId, optionalText, paise, requiredText, checkbox } from '@/lib/validation'
import { ACTIVITY_TYPES, CHANNELS, LEAD_STAGES, PLANNABLE_TYPES } from './constants'
import { INSTAGRAM_RE, isPhoneLike, isWebUrl, normaliseInstagram, normaliseUrl } from './normalize'

export const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

export const optId = z.preprocess(blank, objectId.optional())
export const optEmail = z.preprocess(blank, email.optional())
export const optPhone = z.preprocess(blank, z.string().trim().refine(isPhoneLike, 'Enter 7 to 15 digits').optional())
export const optUrl = z.preprocess(blank, z.string().trim().max(300, 'This link is too long').transform(normaliseUrl).refine(isWebUrl, 'Enter a link like kesarclay.in').optional())
export const optLinkedin = optUrl.refine((v) => !v || /linkedin\.com/i.test(v), 'Use a linkedin.com link')
export const optInstagram = z.preprocess((v) => blank(typeof v === 'string' ? normaliseInstagram(v) : v), z.string().regex(INSTAGRAM_RE, 'Use a handle like kesar.clay').optional())
export const optPaise = z.preprocess(blank, paise.optional())
export const optDate = z.preprocess(blank, isoDate.optional())
export const optTime = z.preprocess(blank, hhmm.optional())
export const optInt = (min: number, max: number) =>
  z.preprocess(blank, z.coerce.number({ error: 'Enter a number' }).int('Use a whole number').min(min, `Use ${min} to ${max}`).max(max, `Use ${min} to ${max}`).optional())
/** A required rupee amount: a blank field says what to enter instead of "This field is required." / "Invalid input". */
export const requiredPaise = (missing: string) => z.preprocess(blank, z.any().refine((v) => v !== undefined && v !== null, missing).pipe(paise))
/** A deal title: blank says "Add a title". */
export const dealTitle = z.string({ error: 'Add a title' }).trim().min(2, 'Use at least 2 characters').max(140, 'Keep the title under 140 characters')

export const followUpSchema = z
  .object({ title: optionalText(140), dueDate: optDate, dueTime: optTime, type: z.preprocess(blank, z.enum(PLANNABLE_TYPES).optional()) })
  .optional()

export const leadProfileSchema = z.object({
  companyName: requiredText('Company', 120),
  contactName: optionalText(80),
  designation: optionalText(80),
  email: optEmail,
  phone: optPhone,
  linkedinUrl: optLinkedin,
  instagramHandle: optInstagram,
  website: optUrl,
  sector: requiredText('Sector', 40),
  source: requiredText('Source', 40),
  icpScore: optInt(1, 5),
  valueRupees: optPaise.refine((v) => v === undefined || v <= 1e12, 'That amount is too large'),
  notes: optionalText(2000),
  ownerId: optId,
  reviewerId: optId,
})

export const createLeadSchema = leadProfileSchema.extend({ followUp: followUpSchema, allowDuplicate: checkbox, addAnother: checkbox })
export const updateLeadSchema = leadProfileSchema.extend({ id: objectId })

export const moveLeadSchema = z.object({
  id: objectId,
  fromStage: z.enum(LEAD_STAGES),
  toStage: z.enum(LEAD_STAGES),
  reasonCode: z.preprocess(blank, z.string().max(40).optional()),
  reasonNote: optionalText(300),
  meetingDate: optDate,
  meetingTime: optTime,
  meetingLink: optUrl,
  meetingNotes: optionalText(4000),
})

export const convertLeadSchema = z.object({
  id: objectId,
  clientMode: z.enum(['new', 'existing']),
  clientId: optId,
  title: dealTitle,
  valueRupees: requiredPaise('Enter the deal value'),
  stage: requiredText('Stage', 40),
  expectedCloseDate: optDate,
  ownerId: optId,
})

export const importRowSchema = z.object({
  companyName: requiredText('Company', 120),
  contactName: optionalText(80),
  designation: optionalText(80),
  email: optEmail,
  phone: optPhone,
  linkedinUrl: optLinkedin,
  instagramHandle: optInstagram,
  website: optUrl,
  sector: requiredText('Sector', 40),
  source: requiredText('Source', 40),
  notes: optionalText(2000),
})

/** Optional contact fields an import row can lose (left blank) without losing the lead. */
const SALVAGEABLE_IMPORT_FIELDS = ['contactName', 'designation', 'email', 'phone', 'linkedinUrl', 'instagramHandle', 'website', 'notes'] as const
export type ImportRowParse = { ok: true; row: z.output<typeof importRowSchema>; blanked: string[] } | { ok: false; error: string }

/**
 * Parses one import row. A bad optional field (an email like 'bala@qa-import', a phone with 'ext 12') is left
 * blank and named in `blanked`, so the lead still imports; a bad company, sector or source refuses the row.
 */
export function parseImportRow(raw: Record<string, unknown>): ImportRowParse {
  const first = importRowSchema.safeParse(raw)
  if (first.success) return { ok: true, row: first.data, blanked: [] }
  const bad = [...new Set(first.error.issues.map((i) => String(i.path[0] ?? '')))]
  const salvageable = (SALVAGEABLE_IMPORT_FIELDS as readonly string[])
  if (!bad.every((f) => salvageable.includes(f))) return { ok: false, error: first.error.issues.find((i) => !salvageable.includes(String(i.path[0] ?? '')))?.message ?? 'This row is not valid' }
  const second = importRowSchema.safeParse({ ...raw, ...Object.fromEntries(bad.map((f) => [f, ''])) })
  return second.success ? { ok: true, row: second.data, blanked: bad } : { ok: false, error: second.error.issues[0]?.message ?? 'This row is not valid' }
}

const related = { leadId: optId, dealId: optId, clientId: optId, contactId: optId }

export const logActivitySchema = z.object({
  ...related,
  type: z.enum(ACTIVITY_TYPES),
  channel: z.preprocess(blank, z.enum(CHANNELS).optional()),
  notes: optionalText(4000),
  /** 'YYYY-MM-DDTHH:mm' in IST (datetime-local). */
  occurredAt: z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'Pick a date and time').optional()),
  followUp: followUpSchema,
})

export const scheduleActivitySchema = z.object({
  ...related,
  type: z.enum(PLANNABLE_TYPES),
  title: requiredText('Title', 140),
  dueDate: isoDate,
  dueTime: optTime,
  assigneeId: optId,
  meetingLink: optUrl,
  notes: optionalText(4000),
})

export const dealFieldsSchema = z.object({
  title: dealTitle,
  valueRupees: requiredPaise('Enter the deal value'),
  probability: optInt(0, 100),
  expectedCloseDate: optDate,
  contactId: optId,
  source: z.preprocess(blank, z.string().max(40).optional()),
  sector: z.preprocess(blank, z.string().max(40).optional()),
  notes: optionalText(2000),
  ownerId: optId,
})

export const reasonSchema = z.object({ id: objectId, reasonCode: requiredText('Reason', 40), reasonNote: optionalText(300) })
