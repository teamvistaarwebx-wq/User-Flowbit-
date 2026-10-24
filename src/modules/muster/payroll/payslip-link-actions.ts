'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'
import { fail, ok, publicAction } from '@/lib/actions'
import { appUrl } from '@/lib/env'
import { rateLimit, rateLimitMessage, RATE_LIMITS } from '@/lib/rate-limit'
import { requestIp } from '@/lib/request'
import { loadPayslipLink, PAYSLIP_COOKIE, PAYSLIP_SESSION_MS, payslipSession, sendPayslipCode, verifyPayslipCode } from './payslip-link'

/** The OTP steps of a WhatsApp payslip link (/p/<token>): send a code to the work email, then check it. */

const token = z.string().trim().min(40).max(80)
const GONE = 'This link is no longer available. Ask for a new one on WhatsApp (send payslip).'

async function ipLimited(): Promise<string | null> {
  const { limit, windowMs } = RATE_LIMITS.payslipLink
  const result = await rateLimit(`payslipLink:${await requestIp()}`, limit, windowMs)
  return result.ok ? null : rateLimitMessage(result.retryAfterSeconds)
}

export const sendPayslipCodeAction = publicAction(z.object({ token }), async (input) => {
  const blocked = await ipLimited()
  if (blocked) return fail(blocked)
  const view = await loadPayslipLink(input.token)
  if (!view) return fail(GONE)
  const sent = await sendPayslipCode(view, await requestIp())
  return sent.ok ? ok(`Code sent to ${view.emailHint}. It works for 10 minutes.`) : fail(sent.error)
})

export const verifyPayslipCodeAction = publicAction(z.object({ token, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') }), async (input) => {
  const blocked = await ipLimited()
  if (blocked) return fail(blocked)
  const view = await loadPayslipLink(input.token)
  if (!view) return fail(GONE)
  const result = await verifyPayslipCode(view, input.code)
  if (!result.ok) return fail(result.error, { code: result.error })
  const jar = await cookies()
  jar.set(PAYSLIP_COOKIE, payslipSession(view.linkId), { httpOnly: true, sameSite: 'strict', secure: appUrl().startsWith('https://'), path: `/p/${input.token}`, maxAge: PAYSLIP_SESSION_MS / 1000 })
  return ok('Verified. You can open your payslip now.', undefined, `/p/${input.token}`)
})
