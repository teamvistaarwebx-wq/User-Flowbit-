import 'server-only'
import { appUrl, serverEnv } from '@/lib/env'
import { PROVIDER_TIMEOUT_MS } from '@/lib/fetch-timeout'

/** Google OAuth (authorization-code flow). Enabled when GOOGLE_CLIENT_ID/SECRET are set. */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

export const googleRedirectUri = () => appUrl('/api/auth/google/callback')

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: serverEnv().GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  })
  return `${AUTH_URL}?${params}`
}

export type GoogleProfile = { sub: string; email: string; email_verified: boolean; name?: string; picture?: string }

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const env = serverEnv()
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })
  if (!tokenRes.ok) throw new Error(`Google token exchange failed (${tokenRes.status})`)
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string }
  if (!accessToken) throw new Error('Google returned no access token')
  const profileRes = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
  if (!profileRes.ok) throw new Error(`Google profile request failed (${profileRes.status})`)
  return (await profileRes.json()) as GoogleProfile
}
