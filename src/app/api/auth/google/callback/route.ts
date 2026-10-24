import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { OAUTH_STATE_COOKIE } from '@/lib/auth/cookies'
import { exchangeGoogleCode } from '@/lib/auth/google'
import { acceptInvite } from '@/lib/auth/invites'
import { UserError } from '@/lib/errors'
import { markEmailVerified, setActiveOrg } from '@/lib/auth/session'
import { startSignIn, TWO_FACTOR_PATH } from '@/lib/auth/two-factor'
import { unsign } from '@/lib/auth/tokens'
import { dbConnect } from '@/lib/db'
import { appUrl } from '@/lib/env'
import { safeNextPath } from '@/lib/safe-next'
import { hasLiveWorkspace } from '@/lib/workspace'
import { Session } from '@/models/Session'
import { User } from '@/models/User'

type State = { state: string; next: string; invite: string }

function readState(raw: string | undefined): State | null {
  const payload = unsign(raw)
  if (!payload) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as State
  } catch {
    return null
  }
}

/** Google redirects here with ?code&state. Finds or creates the user, then signs them in. */
export async function GET(request: NextRequest) {
  const jar = await cookies()
  const saved = readState(jar.get(OAUTH_STATE_COOKIE)?.value)
  jar.delete(OAUTH_STATE_COOKIE)
  const code = request.nextUrl.searchParams.get('code')
  if (!saved || !code || saved.state !== request.nextUrl.searchParams.get('state')) {
    return NextResponse.redirect(appUrl('/login?error=google_state'))
  }
  try {
    const profile = await exchangeGoogleCode(code)
    if (!profile.email_verified) return NextResponse.redirect(appUrl('/login?error=google_unverified'))
    await dbConnect()
    const email = profile.email.toLowerCase()
    const existing = (await User.findOne({ googleId: profile.sub }).lean()) ?? (await User.findOne({ email }).lean())
    // First Google link to a password account: signup never verified that email, so whoever set the password
    // may not own it. The verified Google owner wins; the old password and every session stop working.
    const takesOver = Boolean(existing && !existing.googleId && existing.passwordHash)
    if (existing && takesOver) await Session.deleteMany({ userId: existing._id })
    const user = existing
      ? await User.findOneAndUpdate(
          { _id: existing._id },
          { $set: { googleId: profile.sub, ...(existing.name ? {} : { name: profile.name ?? email }) }, ...(takesOver ? { $unset: { passwordHash: 1 } } : {}) },
          { returnDocument: 'after' },
        ).lean()
      : (await User.create({ email, name: profile.name ?? email.split('@')[0], googleId: profile.sub })).toObject()
    await markEmailVerified(user!._id)
    // Two-factor sign-in asks for the code after Google too; the invite and `next` ride along.
    if (!(await startSignIn(user!, { activeOrgId: user!.lastOrgId, next: saved.next, invite: saved.invite || undefined }))) return NextResponse.redirect(appUrl(TWO_FACTOR_PATH))
    if (saved.invite) {
      // A Google account other than the invited email is still a verified sign-in, but the invite page must
      // explain the mismatch (and offer to switch accounts) instead of a generic Google error.
      const invite = await acceptInvite(saved.invite, user!._id).catch((error: unknown) => {
        if (error instanceof UserError) return null
        throw error
      })
      if (!invite) return NextResponse.redirect(appUrl(`/invite/${encodeURIComponent(saved.invite)}`))
      await setActiveOrg(invite.orgId)
      return NextResponse.redirect(appUrl('/app'))
    }
    const hasWorkspace = await hasLiveWorkspace(user!._id)
    const next = safeNextPath(saved.next, '/app')
    return NextResponse.redirect(appUrl(hasWorkspace ? next : '/onboarding'))
  } catch (error) {
    console.error('[auth] Google callback failed', error)
    return NextResponse.redirect(appUrl('/login?error=google_failed'))
  }
}
