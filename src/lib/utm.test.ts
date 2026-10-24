import { describe, expect, it } from 'vitest'
import { decodeUtm, encodeUtm, utmFromRequest, utmSourceLabel } from './utm'

describe('signup campaign capture', () => {
  it('keeps utm_* tags, the landing path and an outside referrer host', () => {
    const utm = utmFromRequest({ search: '?utm_source=google&utm_medium=cpc&utm_campaign=tab-tax&gclid=x', pathname: '/pricing', referrer: 'https://www.google.com/search?q=hrms+india', host: 'useflowbit.com' })
    expect(utm).toEqual({ source: 'google', medium: 'cpc', campaign: 'tab-tax', referrer: 'www.google.com', landing: '/pricing' })
  })

  it('keeps nothing for direct visits or our own pages as referrer', () => {
    expect(utmFromRequest({ search: '', pathname: '/', referrer: null, host: 'useflowbit.com' })).toBeNull()
    expect(utmFromRequest({ search: '', pathname: '/signup', referrer: 'https://useflowbit.com/pricing', host: 'useflowbit.com' })).toBeNull()
    expect(utmFromRequest({ search: '', pathname: '/signup', referrer: 'https://www.useflowbit.com/', host: 'useflowbit.com' })).toBeNull()
  })

  it('round-trips through the cookie and re-checks what the browser sends back', () => {
    const utm = utmFromRequest({ search: '?utm_source=linkedin&utm_campaign=<script>', pathname: '/', host: 'useflowbit.com' })!
    expect(utm.campaign).toBe('script')
    expect(decodeUtm(encodeUtm(utm))).toEqual(utm)
    expect(decodeUtm('not-json')).toBeNull()
    expect(decodeUtm(encodeURIComponent(JSON.stringify({ source: 'x'.repeat(500), evil: 'y' })))).toEqual({ source: 'x'.repeat(100) })
  })

  it('labels the source for reports', () => {
    expect(utmSourceLabel({ source: 'google' })).toBe('google')
    expect(utmSourceLabel({ referrer: 'news.ycombinator.com' })).toBe('Referral: news.ycombinator.com')
    expect(utmSourceLabel(null)).toBe('Direct')
  })
})
