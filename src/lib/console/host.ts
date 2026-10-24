/**
 * Host routing for the Console (console spec 7): the same app serves
 * console.<domain>, where every page lives under /console. Pure and edge-safe:
 * src/proxy.ts calls `routeRequest` and turns the decision into a response.
 */

export const DEFAULT_CONSOLE_HOST = 'console.useflowbit.com'
export const CONSOLE_PREFIX = '/console'
export const CONSOLE_LOGIN = '/console/login'

/** The Console host: CONSOLE_HOST, else console.useflowbit.com. May carry a port ("console.localhost:4100"). */
export const consoleHostOf = (env: Record<string, string | undefined>) => (env.CONSOLE_HOST?.trim().toLowerCase() || DEFAULT_CONSOLE_HOST)

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])$/i

const hostnameOf = (host: string) => (host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]).toLowerCase()

/** Loopback hosts (dev and the local prod server) may open /console on the main host. */
export const isLoopbackHost = (host: string) => {
  const name = hostnameOf(host)
  return LOOPBACK.test(name) || name.endsWith('.localhost')
}

/** True when the request's Host is the Console host (with the port only when CONSOLE_HOST names one). */
export function isConsoleHost(host: string | null | undefined, consoleHost: string): boolean {
  if (!host) return false
  const wanted = consoleHost.toLowerCase()
  const got = host.toLowerCase()
  return wanted.includes(':') && !wanted.startsWith('[') ? got === wanted : hostnameOf(got) === hostnameOf(wanted)
}

const isConsolePath = (path: string) => path === CONSOLE_PREFIX || path.startsWith(`${CONSOLE_PREFIX}/`)
/** Pages a signed-out staff member may open: sign in, its 2FA steps and the password setup link (all under /console/login). */
const isConsolePublic = (path: string) => path === CONSOLE_LOGIN || path.startsWith(`${CONSOLE_LOGIN}/`)
/** API routes the Console itself calls on its host; every other /api path is the product's. */
const CONSOLE_API = ['/api/console/', '/api/subscription/invoices/', '/api/import-template/']
const PRODUCT_GATED = ['/app', '/onboarding']

export type RouteInput = {
  host: string | null
  pathname: string
  search: string
  consoleHost: string
  hasSession: boolean
  hasStaffSession: boolean
}

export type RouteDecision =
  | { kind: 'next' }
  | { kind: 'rewrite'; pathname: string }
  | { kind: 'redirect'; location: string }
  | { kind: 'not_found' }
  /** Product page with a session: let it through and slide the session cookie. */
  | { kind: 'session' }

const loginRedirect = (pathname: string, search: string, login: string): RouteDecision => {
  const next = `${pathname}${search}`
  return { kind: 'redirect', location: `${login}?next=${encodeURIComponent(next)}` }
}

/** Console paths: sign-in pages are open, the rest need a staff cookie (the page checks the session for real). */
function consoleGate(path: string, input: RouteInput): RouteDecision | null {
  if (isConsolePublic(path) || input.hasStaffSession) return null
  return loginRedirect(path, input.search, CONSOLE_LOGIN)
}

function onConsoleHost(input: RouteInput): RouteDecision {
  const { pathname } = input
  if (pathname.startsWith('/_next/')) return { kind: 'next' }
  if (pathname.startsWith('/api/')) return CONSOLE_API.some((p) => pathname.startsWith(p)) ? { kind: 'next' } : { kind: 'not_found' }
  const path = isConsolePath(pathname) ? pathname : `${CONSOLE_PREFIX}${pathname === '/' ? '' : pathname}`
  const gate = consoleGate(path, input)
  if (gate) return gate
  return path === pathname ? { kind: 'next' } : { kind: 'rewrite', pathname: path }
}

/** /platform and /console on the product host: the Console's own host in production, the path locally. */
function toConsole(input: RouteInput, consolePath: string): RouteDecision {
  if (input.host && isLoopbackHost(input.host)) {
    const gate = consoleGate(consolePath, input)
    if (gate) return gate
    return consolePath === input.pathname ? { kind: 'next' } : { kind: 'redirect', location: `${consolePath}${input.search}` }
  }
  return { kind: 'redirect', location: `https://${input.consoleHost}${consolePath}${input.search}` }
}

/**
 * Where a request goes. On the Console host everything is rewritten under
 * /console and product routes are refused; on the product host /platform
 * (the old staff area) and /console move to the Console, and /app and
 * /onboarding keep their signed-out redirect to /login.
 */
export function routeRequest(input: RouteInput): RouteDecision {
  if (isConsoleHost(input.host, input.consoleHost)) return onConsoleHost(input)
  const { pathname } = input
  if (pathname === '/platform' || pathname.startsWith('/platform/')) return toConsole(input, pathname.startsWith('/platform/orgs') ? pathname.replace('/platform/orgs', '/console/accounts') : CONSOLE_PREFIX)
  if (isConsolePath(pathname)) return toConsole(input, pathname)
  if (PRODUCT_GATED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!input.hasSession) return `${pathname}${input.search}` === '/app' ? { kind: 'redirect', location: '/login' } : loginRedirect(pathname, input.search, '/login')
    return { kind: 'session' }
  }
  return { kind: 'next' }
}
