/**
 * The Console's staff session cookie (console spec 7): separate from the
 * product's `fb_session`, host-only (no Domain attribute, so it never reaches
 * app.<domain> or www), SameSite=Strict. Over https it carries the `__Host-`
 * prefix, which browsers only accept with Secure, Path=/ and no Domain.
 * Edge-safe: no imports (the proxy reads it).
 */
export const STAFF_COOKIE_SECURE = '__Host-fb_console'
export const STAFF_COOKIE_PLAIN = 'fb_console'
/** A staff session lasts one working day; there is no sliding renewal. */
export const STAFF_SESSION_HOURS = 12
export const STAFF_SESSION_MAX_AGE = STAFF_SESSION_HOURS * 60 * 60
/** Time allowed between the password step and the code step. */
export const STAFF_MFA_MINUTES = 10

export const staffCookieName = (secure: boolean) => (secure ? STAFF_COOKIE_SECURE : STAFF_COOKIE_PLAIN)

export const staffCookieOptions = (secure: boolean, maxAge = STAFF_SESSION_MAX_AGE) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure,
  path: '/',
  maxAge,
})

/** Either cookie name present (the proxy does not know whether the request came over TLS). */
export function readStaffCookie(get: (name: string) => string | undefined): string | undefined {
  return get(STAFF_COOKIE_SECURE) ?? get(STAFF_COOKIE_PLAIN)
}
