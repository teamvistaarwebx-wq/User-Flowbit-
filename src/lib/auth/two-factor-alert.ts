import 'server-only'
import { emailLayout, sendMail } from '@/lib/mail'
import { RATE_LIMITS, rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { User } from '@/models/User'

/**
 * Two-factor code limits beyond the 15-minute window: a daily cap per user,
 * and an email to the person when wrong codes pile up (at most one a day),
 * because repeated wrong codes after a correct password mean someone else
 * may know it.
 */

const DAY_MS = 24 * 60 * 60_000

/** Counts one code attempt against the 15-minute and daily limits; the refusal message, or null. */
export async function twoFactorCodeLimit(userId: string): Promise<string | null> {
  const short = RATE_LIMITS.twoFactorCode
  const shortResult = await rateLimit(`twoFactorCode:${userId}`, short.limit, short.windowMs)
  if (!shortResult.ok) return rateLimitMessage(shortResult.retryAfterSeconds)
  const daily = RATE_LIMITS.twoFactorDaily
  const dailyResult = await rateLimit(`twoFactorDaily:${userId}`, daily.limit, daily.windowMs)
  return dailyResult.ok ? null : 'Too many two-factor attempts today. Try again tomorrow, or use a recovery code after the wait.'
}

type Send = typeof sendMail

/** Records one wrong code; past the threshold, emails the person once a day. True when an alert was sent. */
export async function noteWrongTwoFactorCode(userId: string, send: Send = sendMail): Promise<boolean> {
  const { limit, windowMs } = RATE_LIMITS.twoFactorAlert
  const failures = await rateLimit(`twoFactorFail:${userId}`, limit - 1, windowMs)
  if (failures.ok) return false
  const firstToday = await rateLimit(`twoFactorAlertSent:${userId}`, 1, DAY_MS)
  if (!firstToday.ok) return false
  const user = await User.findById(userId, { name: 1, email: 1 }).lean()
  if (!user?.email) return false
  const mail = emailLayout({
    title: 'Several wrong two-factor codes',
    paragraphs: [
      `Hi ${user.name}, someone entered ${limit} or more wrong two-factor codes for your Flowbit account in the last hour.`,
      'If it was you, nothing needs doing. If not, your password may be known to someone else: change it now, and sign out everywhere from Settings → Security.',
    ],
    cta: { label: 'Open Security settings', href: '/app/settings/security' },
  })
  await send({ to: user.email, subject: 'Wrong two-factor codes on your Flowbit account', ...mail, kind: 'security' })
  return true
}
