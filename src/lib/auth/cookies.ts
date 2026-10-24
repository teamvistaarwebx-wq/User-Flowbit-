/** Cookie names and lifetimes shared by the proxy (edge-safe, no imports) and the server. */
export const SESSION_COOKIE = 'fb_session'
export const OAUTH_STATE_COOKIE = 'fb_oauth'
export const SESSION_DAYS = 30
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60

export const sessionCookieOptions = (secure: boolean) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure,
  path: '/',
  maxAge: SESSION_MAX_AGE,
})
