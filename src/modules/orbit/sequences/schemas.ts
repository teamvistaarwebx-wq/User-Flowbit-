import { z } from 'zod'
import { objectId, optionalText, requiredText } from '@/lib/validation'
import { DEFAULT_DAILY_CAP, DEFAULT_WINDOW, MAX_DAILY_CAP, MAX_STEPS, MAX_WAIT_DAYS, STEP_KINDS, unknownVariables } from './rules'

/** The sequence builder form: up to 5 steps, the IST send window and the daily cap. Client-safe. */

const step = z
  .object({
    kind: z.enum(STEP_KINDS),
    subject: optionalText(200),
    body: optionalText(5000),
    note: optionalText(300),
    waitDays: z.coerce.number().int('Whole days').min(1, 'At least 1 day').max(MAX_WAIT_DAYS, `At most ${MAX_WAIT_DAYS} days`).optional(),
  })
  .superRefine((s, issue) => {
    if (s.kind === 'email') {
      if (!s.subject) issue.addIssue({ code: 'custom', path: ['subject'], message: 'Add a subject' })
      if (!s.body) issue.addIssue({ code: 'custom', path: ['body'], message: 'Write the email' })
      const unknown = unknownVariables(`${s.subject ?? ''} ${s.body ?? ''}`)
      if (unknown.length) issue.addIssue({ code: 'custom', path: ['body'], message: `Unknown variable: {{${unknown[0]}}}. Use {{first_name}}, {{company}} or {{owner}}.` })
    }
    if (s.kind === 'wait' && !s.waitDays) issue.addIssue({ code: 'custom', path: ['waitDays'], message: 'How many days?' })
  })

const hour = (label: string, min: number, max: number) => z.coerce.number({ error: `Pick the ${label}` }).int().min(min).max(max)

export const sequenceSchema = z
  .object({
    id: objectId.optional(),
    name: requiredText('Name', 100),
    steps: z.array(step).min(1, 'Add at least one step').max(MAX_STEPS, `Up to ${MAX_STEPS} steps`),
    startHour: hour('start time', 0, 23).default(DEFAULT_WINDOW.startHour),
    endHour: hour('end time', 1, 24).default(DEFAULT_WINDOW.endHour),
    dailyCap: z.coerce.number().int().min(1, 'At least 1').max(MAX_DAILY_CAP, `At most ${MAX_DAILY_CAP}`).default(DEFAULT_DAILY_CAP),
  })
  .refine((s) => s.endHour > s.startHour, { path: ['endHour'], message: 'End after the start time' })
  .refine((s) => s.steps.some((x) => x.kind !== 'wait'), { path: ['steps'], message: 'Add an email, call or reminder step' })

export type SequenceInput = z.output<typeof sequenceSchema>
