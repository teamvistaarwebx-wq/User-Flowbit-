import { z } from 'zod'

/**
 * A meeting's video link (pure). https only: the link is rendered as a link in the app,
 * goes into invite emails and the calendar location, so `javascript:` or `data:` must never pass (R3 L-23b).
 */
export const meetingLink = z
  .string()
  .trim()
  .max(500)
  .url('Use a full link like https://meet.google.com/abc-defg-hij')
  .refine((u) => /^https:\/\//i.test(u), 'Use an https link like https://meet.google.com/abc-defg-hij')
  .optional()
  .or(z.literal('').transform(() => undefined))
