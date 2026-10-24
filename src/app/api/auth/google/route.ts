import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { OAUTH_STATE_COOKIE } from '@/lib/auth/cookies'
import { googleAuthUrl } from '@/lib/auth/google'
import { rememberPlanIntent } from '@/lib/auth/plan-intent-cookie'
import { randomToken, signed } from '@/lib/auth/tokens'
import { appUrl, isGoogleConfigured, secureCookies } from '@/lib/env'

const STATE_MAX_AGE = 10 * 60

/** Starts Google sign-in: stores a signed state cookie (and any pricing-page plan pick) and redirects to Google. */
export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) return NextResponse.redirect(appUrl('/login?error=google_not_configured'))
  const next = request.nextUrl.searchParams.get('next') ?? ''
  const invite = request.nextUrl.searchParams.get('invite') ?? ''
  if (!invite) await rememberPlanIntent(request.nextUrl.searchParams.get('intent'))
  const state = randomToken(16)
  const payload = Buffer.from(JSON.stringify({ state, next, invite })).toString('base64url')
  ;(await cookies()).set(OAUTH_STATE_COOKIE, signed(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(),
    path: '/',
    maxAge: STATE_MAX_AGE,
  })
  return NextResponse.redirect(googleAuthUrl(state))
}
