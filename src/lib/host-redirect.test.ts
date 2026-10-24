// @ts-expect-error Next's compiled path-to-regexp (the matcher it uses for redirects) ships no types.
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import { describe, expect, it } from 'vitest'
import { NON_API_PATHS, VERCEL_APP_HOST, vercelHostRedirects } from './host-redirect'

const PROD = { VERCEL: '1', VERCEL_ENV: 'production', APP_URL: 'https://app.flowbit.in/' }

describe('vercel.app host redirect', () => {
  it('sends page visits on *.vercel.app to APP_URL on a production deployment with its own domain', () => {
    expect(vercelHostRedirects(PROD)).toEqual([{ source: NON_API_PATHS, has: [{ type: 'host', value: VERCEL_APP_HOST }], destination: 'https://app.flowbit.in/:path', permanent: false }])
  })

  it('does nothing locally, on previews, or while APP_URL is itself the vercel.app address', () => {
    expect(vercelHostRedirects({ ...PROD, VERCEL: undefined })).toEqual([])
    expect(vercelHostRedirects({ ...PROD, VERCEL_ENV: 'preview' })).toEqual([])
    expect(vercelHostRedirects({ ...PROD, APP_URL: 'https://flowbit-abc.vercel.app' })).toEqual([])
    expect(vercelHostRedirects({ ...PROD, APP_URL: '' })).toEqual([])
  })

  it('matches pages but leaves /api (cron, webhooks, health) on both hosts', () => {
    const source = pathToRegexp(NON_API_PATHS, [], {})
    expect(['/', '/login', '/app/hr/payroll'].every((p) => source.test(p))).toBe(true)
    expect(['/api/cron/folio', '/api/health', '/api/subscription/razorpay/webhook'].some((p) => source.test(p))).toBe(false)
    const host = new RegExp(`^${VERCEL_APP_HOST}$`)
    expect(host.test('flowbit-abc.vercel.app')).toBe(true)
    expect(host.test('app.flowbit.in')).toBe(false)
  })
})
