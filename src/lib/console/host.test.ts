import { describe, expect, it } from 'vitest'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookies'
import { readStaffCookie, STAFF_COOKIE_PLAIN, STAFF_COOKIE_SECURE, staffCookieName, staffCookieOptions } from './cookies'
import { consoleHostOf, isConsoleHost, isLoopbackHost, routeRequest, type RouteInput } from './host'
import { consoleUrl } from './urls'

const CONSOLE = 'console.useflowbit.com'
const req = (over: Partial<RouteInput>): RouteInput => ({ host: 'app.useflowbit.com', pathname: '/', search: '', consoleHost: CONSOLE, hasSession: false, hasStaffSession: false, ...over })

describe('console host detection', () => {
  it('defaults to console.useflowbit.com and honours CONSOLE_HOST', () => {
    expect(consoleHostOf({})).toBe(CONSOLE)
    expect(consoleHostOf({ CONSOLE_HOST: ' Console.Localhost:4100 ' })).toBe('console.localhost:4100')
  })
  it('matches the host name, and the port only when CONSOLE_HOST has one', () => {
    expect(isConsoleHost('console.useflowbit.com', CONSOLE)).toBe(true)
    expect(isConsoleHost('console.useflowbit.com:443', CONSOLE)).toBe(true)
    expect(isConsoleHost('app.useflowbit.com', CONSOLE)).toBe(false)
    expect(isConsoleHost('console.localhost:4100', 'console.localhost:4100')).toBe(true)
    expect(isConsoleHost('console.localhost:4200', 'console.localhost:4100')).toBe(false)
    expect(isConsoleHost(null, CONSOLE)).toBe(false)
  })
  it('knows loopback hosts', () => {
    expect(isLoopbackHost('127.0.0.1:4100')).toBe(true)
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('console.localhost:4100')).toBe(true)
    expect(isLoopbackHost('[::1]:4100')).toBe(true)
    expect(isLoopbackHost('app.useflowbit.com')).toBe(false)
  })
})

describe('routing on the console host', () => {
  const onConsole = (over: Partial<RouteInput>) => routeRequest(req({ host: CONSOLE, ...over }))
  it('rewrites pages under /console for a staff session', () => {
    expect(onConsole({ pathname: '/', hasStaffSession: true })).toEqual({ kind: 'rewrite', pathname: '/console' })
    expect(onConsole({ pathname: '/accounts/abc', hasStaffSession: true })).toEqual({ kind: 'rewrite', pathname: '/console/accounts/abc' })
    expect(onConsole({ pathname: '/console/accounts', hasStaffSession: true })).toEqual({ kind: 'next' })
  })
  it('sends a visitor without the staff cookie to the Console sign-in, even with a product session', () => {
    expect(onConsole({ pathname: '/accounts', hasSession: true })).toEqual({ kind: 'redirect', location: '/console/login?next=%2Fconsole%2Faccounts' })
  })
  it('leaves the sign-in pages open', () => {
    expect(onConsole({ pathname: '/login' })).toEqual({ kind: 'rewrite', pathname: '/console/login' })
    expect(onConsole({ pathname: '/console/login/verify' })).toEqual({ kind: 'next' })
    expect(onConsole({ pathname: '/console/login/setup', search: '?token=x' })).toEqual({ kind: 'next' })
    expect(onConsole({ pathname: '/console/setup' })).toEqual({ kind: 'redirect', location: '/console/login?next=%2Fconsole%2Fsetup' })
  })
  it('never serves product pages or product APIs', () => {
    expect(onConsole({ pathname: '/app', hasSession: true, hasStaffSession: true })).toEqual({ kind: 'rewrite', pathname: '/console/app' })
    expect(onConsole({ pathname: '/api/tasks', hasSession: true })).toEqual({ kind: 'not_found' })
    expect(onConsole({ pathname: '/api/cron/health' })).toEqual({ kind: 'not_found' })
    expect(onConsole({ pathname: '/api/subscription/invoices/1/pdf' })).toEqual({ kind: 'next' })
    expect(onConsole({ pathname: '/api/import-template/team' })).toEqual({ kind: 'next' })
  })
})

describe('routing on the product host', () => {
  it('keeps the signed-out redirect for /app and /onboarding', () => {
    expect(routeRequest(req({ pathname: '/app' }))).toEqual({ kind: 'redirect', location: '/login' })
    expect(routeRequest(req({ pathname: '/app/work', search: '?x=1' }))).toEqual({ kind: 'redirect', location: '/login?next=%2Fapp%2Fwork%3Fx%3D1' })
    expect(routeRequest(req({ pathname: '/onboarding' }))).toEqual({ kind: 'redirect', location: '/login?next=%2Fonboarding' })
  })
  it('does not count a staff cookie as a product session', () => {
    expect(routeRequest(req({ pathname: '/app', hasStaffSession: true }))).toEqual({ kind: 'redirect', location: '/login' })
    expect(routeRequest(req({ pathname: '/app', hasSession: true }))).toEqual({ kind: 'session' })
  })
  it('moves /platform and /console to the Console host in production', () => {
    expect(routeRequest(req({ pathname: '/platform' }))).toEqual({ kind: 'redirect', location: `https://${CONSOLE}/console` })
    expect(routeRequest(req({ pathname: '/platform/orgs/abc' }))).toEqual({ kind: 'redirect', location: `https://${CONSOLE}/console/accounts/abc` })
    expect(routeRequest(req({ pathname: '/console/accounts' }))).toEqual({ kind: 'redirect', location: `https://${CONSOLE}/console/accounts` })
  })
  it('serves /console on a loopback host (dev, the local server)', () => {
    const local = { host: '127.0.0.1:4100' }
    expect(routeRequest(req({ ...local, pathname: '/console', hasStaffSession: true }))).toEqual({ kind: 'next' })
    expect(routeRequest(req({ ...local, pathname: '/console' }))).toEqual({ kind: 'redirect', location: '/console/login?next=%2Fconsole' })
    expect(routeRequest(req({ ...local, pathname: '/platform/orgs', hasStaffSession: true }))).toEqual({ kind: 'redirect', location: '/console/accounts' })
  })
  it('leaves everything else alone', () => {
    expect(routeRequest(req({ pathname: '/pricing' }))).toEqual({ kind: 'next' })
    expect(routeRequest(req({ pathname: '/api/tasks' }))).toEqual({ kind: 'next' })
  })
})

describe('cookie separation', () => {
  it('uses a different cookie from the product session', () => {
    expect(staffCookieName(true)).not.toBe(SESSION_COOKIE)
    expect(staffCookieName(false)).not.toBe(SESSION_COOKIE)
  })
  it('is host-only: no Domain attribute, path /, __Host- prefix over https', () => {
    const secure = staffCookieOptions(true)
    expect(secure).not.toHaveProperty('domain')
    expect(secure.path).toBe('/')
    expect(secure.secure).toBe(true)
    expect(staffCookieName(true)).toBe('__Host-fb_console')
    expect(staffCookieName(false)).toBe('fb_console')
    expect(sessionCookieOptions(true)).not.toHaveProperty('domain')
  })
  it('is httpOnly and SameSite=Strict with a working-day lifetime', () => {
    const options = staffCookieOptions(true)
    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe('strict')
    expect(options.maxAge).toBe(12 * 3600)
  })
  it('reads either staff cookie name, never fb_session', () => {
    const jar = (cookies: Record<string, string>) => (name: string) => cookies[name]
    expect(readStaffCookie(jar({ [STAFF_COOKIE_SECURE]: 'a' }))).toBe('a')
    expect(readStaffCookie(jar({ [STAFF_COOKIE_PLAIN]: 'b' }))).toBe('b')
    expect(readStaffCookie(jar({ [SESSION_COOKIE]: 'c' }))).toBeUndefined()
  })
})

describe('console links', () => {
  it('points at the Console host in production and at /console locally', () => {
    expect(consoleUrl('/console/login/setup?token=t', { APP_URL: 'https://app.useflowbit.com' })).toBe('https://console.useflowbit.com/console/login/setup?token=t')
    expect(consoleUrl('/setup', { APP_URL: 'http://127.0.0.1:4100' })).toBe('http://127.0.0.1:4100/console/setup')
    expect(consoleUrl('/', { APP_URL: 'https://app.useflowbit.com', CONSOLE_HOST: 'ops.useflowbit.com' })).toBe('https://ops.useflowbit.com/console')
  })
})
