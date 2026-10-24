'use server'

import { z } from 'zod'
import { fail, ok, publicAction } from '@/lib/actions'
import { getSession } from '@/lib/auth/session'
import { rateLimit, rateLimitMessage, RATE_LIMITS } from '@/lib/rate-limit'
import { requestIp } from '@/lib/request'
import { runActionLink } from './execute'
import { ACTION_CHOICES } from './kinds'

/**
 * Confirming a decision from an emailed link (the page at /a/<token>). The
 * signed token is the key; a signed-in viewer must be the person it was sent
 * to. Opening the page decides nothing: only this POST does, so a mail
 * scanner that fetches the link cannot approve anything.
 */

const schema = z.object({
  token: z.string().trim().min(40).max(80),
  choice: z.enum(ACTION_CHOICES),
  note: z.string().trim().max(500).optional().default(''),
})

async function limited(token: string): Promise<string | null> {
  const ip = await requestIp()
  for (const [scope, key] of [['actionLink', ip], ['actionLinkToken', token.split('.')[0] ?? token]] as const) {
    const { limit, windowMs } = RATE_LIMITS[scope]
    const result = await rateLimit(`${scope}:${key}`, limit, windowMs)
    if (!result.ok) return rateLimitMessage(result.retryAfterSeconds)
  }
  return null
}

export const confirmActionLinkAction = publicAction(schema, async (input) => {
  const blocked = await limited(input.token)
  if (blocked) return fail(blocked)
  const session = await getSession().catch(() => null)
  const result = await runActionLink({ token: input.token, choice: input.choice, note: input.note, viewer: { userId: session ? String(session.user._id) : null } })
  if (!result.ok) return fail(result.message, result.reason === 'note' ? { note: result.message } : undefined)
  return ok(result.message)
})
