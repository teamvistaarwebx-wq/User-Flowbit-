import 'server-only'
import { cookies } from 'next/headers'
import { decodeUtm, SIGNUP_UTM_COOKIE, type SignupUtm } from '@/lib/utm'

/** The first-touch campaign data the proxy kept (lib/utm), cleared once read. Actions and route handlers only. */
export async function takeSignupUtm(): Promise<SignupUtm | null> {
  const jar = await cookies()
  const utm = decodeUtm(jar.get(SIGNUP_UTM_COOKIE)?.value)
  if (jar.has(SIGNUP_UTM_COOKIE)) jar.delete(SIGNUP_UTM_COOKIE)
  return utm
}
