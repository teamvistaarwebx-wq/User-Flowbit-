import { describe, expect, it, vi } from 'vitest'
import { checkCname } from './dns-check'
import { DomainProviderError, resendDomains, type ResendDomainsLike } from './resend-domains'
import { cnameMatches, isCandidatePortalHost, isFlowbitDomain, isSubdomain, normalizeDomain, portalPathFor, sendingFrom } from './rules'

describe('domain names', () => {
  it('normalises what people paste and refuses what is not a public domain', () => {
    expect(normalizeDomain(' https://Portal.BrightFoods.in/login ')).toBe('portal.brightfoods.in')
    expect(normalizeDomain('brightfoods.in.')).toBe('brightfoods.in')
    expect(normalizeDomain('localhost')).toBeNull()
    expect(normalizeDomain('10.0.0.1')).toBeNull()
    expect(normalizeDomain('intranet.local')).toBeNull()
    expect(normalizeDomain('-bad.example.in')).toBeNull()
    expect(normalizeDomain('a_b.in')).toBeNull()
  })

  it('keeps Flowbit hosts out and wants a subdomain for the portal', () => {
    expect(isFlowbitDomain('app.useflowbit.com', ['useflowbit.com'])).toBe(true)
    expect(isFlowbitDomain('useflowbit.co', ['useflowbit.com'])).toBe(false)
    expect(isSubdomain('brightfoods.in')).toBe(false)
    expect(isSubdomain('portal.brightfoods.in')).toBe(true)
  })

  it('writes a clean From line', () => {
    expect(sendingFrom('Bright "Foods" <Pvt>', 'brightfoods.in')).toBe('Bright Foods Pvt <billing@brightfoods.in>')
  })
})

describe('portal host routing', () => {
  const own = ['https://app.useflowbit.com', 'console.useflowbit.com', 'portal.useflowbit.com', 'useflowbit.com']

  it('only looks up hosts that are not Flowbit, loopback or previews', () => {
    expect(isCandidatePortalHost('portal.brightfoods.in', own)).toBe(true)
    expect(isCandidatePortalHost('app.useflowbit.com', own)).toBe(false)
    expect(isCandidatePortalHost('www.useflowbit.com', own)).toBe(false)
    expect(isCandidatePortalHost('127.0.0.1:4100', own)).toBe(false)
    expect(isCandidatePortalHost('console.localhost:4100', own)).toBe(false)
    expect(isCandidatePortalHost('flowbit-git-main.vercel.app', own)).toBe(false)
    expect(isCandidatePortalHost(null, own)).toBe(false)
  })

  it("maps every path under the workspace's portal and keeps product pages out", () => {
    expect(portalPathFor('bright', '/')).toEqual({ kind: 'rewrite', pathname: '/portal/bright' })
    expect(portalPathFor('bright', '/login')).toEqual({ kind: 'rewrite', pathname: '/portal/bright/login' })
    expect(portalPathFor('bright', '/portal/bright/files/1')).toEqual({ kind: 'next' })
    expect(portalPathFor('bright', '/portal/other')).toEqual({ kind: 'not_found' })
    expect(portalPathFor('bright', '/app/settings')).toEqual({ kind: 'not_found' })
    expect(portalPathFor('bright', '/_next/static/x.js')).toEqual({ kind: 'next' })
    expect(portalPathFor('bright', '/api/files/1')).toEqual({ kind: 'next' })
  })
})

describe('CNAME check (mocked DNS)', () => {
  it('passes when the CNAME points at the target', async () => {
    const resolve = vi.fn().mockResolvedValue(['Portal.UseFlowbit.com.'])
    expect(await checkCname('portal.brightfoods.in', 'portal.useflowbit.com', resolve)).toEqual({ ok: true })
    expect(cnameMatches(['x.example.com'], 'portal.useflowbit.com')).toBe(false)
  })

  it('explains a wrong or missing record and never looks up an invalid name', async () => {
    const wrong = await checkCname('portal.brightfoods.in', 'portal.useflowbit.com', async () => ['ghs.google.com'])
    expect(wrong.ok).toBe(false)
    const missing = await checkCname('portal.brightfoods.in', 'portal.useflowbit.com', async () => Promise.reject(Object.assign(new Error('x'), { code: 'ENODATA' })))
    expect(missing).toMatchObject({ ok: false, reason: expect.stringMatching(/No CNAME/) })
    const resolve = vi.fn()
    expect((await checkCname('localhost', 'portal.useflowbit.com', resolve)).ok).toBe(false)
    expect(resolve).not.toHaveBeenCalled()
  })
})

describe('Resend Domains API (mocked)', () => {
  const domain = { id: 'd1', status: 'not_started', records: [{ record: 'SPF', type: 'MX', name: 'send', value: 'feedback-smtp.ap-south-1.amazonses.com', priority: 10, status: 'not_started' }, { record: 'SPF', type: 'TXT', name: 'send', value: 'v=spf1 include:amazonses.com ~all' }, { record: 'DKIM', type: 'TXT', name: 'resend._domainkey', value: 'p=MIGf' }] }
  const client = (overrides: Partial<ResendDomainsLike['domains']> = {}): ResendDomainsLike => ({
    domains: {
      create: vi.fn().mockResolvedValue({ data: domain, error: null }),
      verify: vi.fn().mockResolvedValue({ data: {}, error: null }),
      get: vi.fn().mockResolvedValue({ data: { ...domain, status: 'verified' }, error: null }),
      remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
      ...overrides,
    },
  })

  it('creates the domain and names the SPF, return-path and DKIM records', async () => {
    const created = await resendDomains(client()).create('brightfoods.in')
    expect(created.id).toBe('d1')
    expect(created.records.map((r) => r.purpose)).toEqual(['Return path (MX)', 'SPF', 'DKIM'])
    expect(created.records[0]).toMatchObject({ type: 'MX', name: 'send', priority: 10 })
  })

  it('verifies, reads the status and surfaces Resend errors', async () => {
    const provider = resendDomains(client())
    await provider.verify('d1')
    expect((await provider.get('d1')).status).toBe('verified')
    const failing = resendDomains(client({ create: vi.fn().mockResolvedValue({ data: null, error: { message: 'Domain already exists' } }) }))
    await expect(failing.create('brightfoods.in')).rejects.toBeInstanceOf(DomainProviderError)
  })
})
