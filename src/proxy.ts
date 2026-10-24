import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookies'
import { readStaffCookie } from '@/lib/console/cookies'
import { consoleHostOf, routeRequest } from '@/lib/console/host'
import { encodeUtm, SIGNUP_UTM_COOKIE, SIGNUP_UTM_MAX_AGE, utmFromRequest } from '@/lib/utm'
import { SITE_DOMAIN } from '@/lib/company'
import { isCandidatePortalHost, portalPathFor } from '@/modules/domains/rules'
import { portalSlugForHost } from '@/modules/domains/portal-host'

/**
 * Host routing and the optimistic sign-in gate (lib/console/host):
 *  - console.<domain> (CONSOLE_HOST) serves the Console: paths are rewritten
 *    under /console, product routes 404, no staff cookie -> /console/login.
 *  - On the product host /platform and /console move to the Console.
 *  - No session cookie on /app or /onboarding -> /login?next=<path>; with
 *    one, its lifetime slides forward 30 days on each page load.
 *  - A workspace's verified portal host (add-on 'domains', e.g.
 *    portal.brightfoods.in CNAMEd to Flowbit) serves its /portal/<slug>.
 * The real checks (sessions in MongoDB, membership, staff roles) happen in
 * requireMember/requireStaff and in every server action.
 */
export async function proxy(request: NextRequest) {
  const portal = await customPortal(request)
  if (portal) return portal
  const decision = routeRequest({
    host: request.headers.get('host'),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    consoleHost: consoleHostOf(process.env),
    hasSession: Boolean(request.cookies.get(SESSION_COOKIE)?.value),
    hasStaffSession: Boolean(readStaffCookie((name) => request.cookies.get(name)?.value)),
  })
  switch (decision.kind) {
    case 'redirect':
      return NextResponse.redirect(new URL(decision.location, request.url))
    case 'rewrite': {
      const url = request.nextUrl.clone()
      url.pathname = decision.pathname
      return NextResponse.rewrite(url)
    }
    case 'not_found':
      return new NextResponse('Not found', { status: 404 })
    case 'session':
      return slideSession(request)
    default:
      return rememberCampaign(request, NextResponse.next())
  }
}

/** Flowbit's own hosts: the app (APP_URL or Vercel's production URL), the Console and the portal CNAME target. */
const ownHosts = () => [process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL, consoleHostOf(process.env), process.env.PORTAL_CNAME_TARGET, SITE_DOMAIN]

/** A request on a workspace's verified portal host, rewritten under /portal/<slug>; null for every other host. */
async function customPortal(request: NextRequest): Promise<NextResponse | null> {
  const host = request.headers.get('host')
  if (!isCandidatePortalHost(host, ownHosts())) return null
  const slug = host ? await portalSlugForHost(host.split(':')[0]) : null
  // Unknown hosts carry on as before (an app alias missing from APP_URL must never 404).
  if (!slug) return null
  const decision = portalPathFor(slug, request.nextUrl.pathname)
  if (decision.kind === 'not_found') return new NextResponse('Not found', { status: 404 })
  if (decision.kind === 'next') return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = decision.pathname
  return NextResponse.rewrite(url)
}

/**
 * First touch only: a page load on the product host with utm_* tags (or from
 * another site) keeps them for 30 days, so the workspace created at signup
 * records the campaign (lib/utm). Never on the Console host or API calls.
 */
function rememberCampaign(request: NextRequest, response: NextResponse): NextResponse {
  if (request.method !== 'GET' || request.cookies.has(SIGNUP_UTM_COOKIE)) return response
  const { pathname, search } = request.nextUrl
  if (pathname.startsWith('/api/') || pathname.startsWith('/console') || pathname.startsWith('/app')) return response
  if (consoleHostOf(process.env) === (request.headers.get('host') ?? '').toLowerCase()) return response
  const utm = utmFromRequest({ search, pathname, referrer: request.headers.get('referer'), host: request.headers.get('host') })
  if (!utm) return response
  const secure = (process.env.APP_URL ?? '').startsWith('https://') || process.env.VERCEL === '1' || request.nextUrl.protocol === 'https:'
  response.cookies.set(SIGNUP_UTM_COOKIE, encodeUtm(utm), { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SIGNUP_UTM_MAX_AGE })
  return response
}

function slideSession(request: NextRequest) {
  const response = NextResponse.next()
  // Slide only on page loads. A server action (POST) may be signing out: re-setting the cookie
  // here would race the action's own delete and could leave the browser holding the cookie.
  if (request.method !== 'GET') return response
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return response
  // Same Secure rule as createSession (secureCookies): behind a TLS-terminating proxy the request itself reads http:.
  const secure = (process.env.APP_URL ?? '').startsWith('https://') || process.env.VERCEL === '1' || request.nextUrl.protocol === 'https:'
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(secure))
  return response
}

export const config = {
  // Every page and API route (the Console host routes them all); never static files. The public/ asset
  // folders stay out too: the Console and portal hosts would otherwise rewrite /brand/x.svg under /console
  // or /portal/<slug> and answer an image request with the sign-in page.
  matcher: ['/((?!_next/static|_next/image|brand/|icons/|manual-img/|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)'],
}
