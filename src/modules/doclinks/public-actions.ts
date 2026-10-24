'use server'

import { z } from 'zod'
import { fail, ok, publicAction } from '@/lib/actions'
import { formatINR } from '@/lib/money'
import { rateLimit, rateLimitMessage, RATE_LIMITS } from '@/lib/rate-limit'
import { requestIp, requestUserAgent } from '@/lib/request'
import { paise } from '@/lib/validation'
import { respondToQuote, shareUtr } from './respond'

/**
 * The client's actions on a public document page: accept or decline a quote,
 * and "I've paid" with a UTR. No login: the signed token is the only key, and
 * every action is rate-limited per IP and per link.
 */

const token = z.string().trim().min(10).max(80)
const NOT_AVAILABLE = 'This link is no longer available. Ask the sender for a new one.'

async function limited(linkKey: string): Promise<string | null> {
  const ip = await requestIp()
  for (const [scope, key] of [['publicDoc', ip], ['publicDocLink', linkKey]] as const) {
    const { limit, windowMs } = RATE_LIMITS[scope]
    const result = await rateLimit(`${scope}:${key}`, limit, windowMs)
    if (!result.ok) return rateLimitMessage(result.retryAfterSeconds)
  }
  return null
}

const respondSchema = z.object({
  token,
  decision: z.enum(['accept', 'decline']),
  name: z.string().trim().min(2, 'Type your full name').max(120),
  comment: z.string().trim().max(1000).optional().default(''),
})

export const respondToQuoteAction = publicAction(respondSchema, async (input) => {
  const blocked = await limited(input.token.split('.')[0] ?? input.token)
  if (blocked) return fail(blocked)
  const result = await respondToQuote(input.token, { decision: input.decision, name: input.name, comment: input.comment, ip: await requestIp(), userAgent: await requestUserAgent() })
  if (result === 'missing') return fail(NOT_AVAILABLE)
  if (typeof result === 'object') return fail(result.error)
  return ok(input.decision === 'accept' ? 'Thank you. The quote is accepted and the team has been told.' : 'Thank you for letting us know.')
})

const utrSchema = z.object({
  token,
  utr: z.string().trim().min(6, 'Enter the UTR or UPI reference').max(40),
  amount: paise.optional(),
  note: z.string().trim().max(500).optional().default(''),
})

export const shareUtrAction = publicAction(utrSchema, async (input) => {
  const blocked = await limited(input.token.split('.')[0] ?? input.token)
  if (blocked) return fail(blocked)
  const result = await shareUtr(input.token, { utr: input.utr, amountPaise: input.amount ?? null, note: input.note, ip: await requestIp(), userAgent: await requestUserAgent() })
  if (result === 'missing') return fail(NOT_AVAILABLE)
  if (typeof result === 'object') return fail(result.error, result.field ? { [result.field]: result.error } : undefined)
  return ok(`Thank you. We will confirm once ${input.amount ? formatINR(input.amount) : 'the payment'} shows in our bank.`)
})
