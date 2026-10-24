import { describe, expect, it, vi } from 'vitest'
import { portalHostResolver, type PortalHostSource } from './portal-host'

const source = (hosts: Array<readonly [string, string]>) => {
  const s = { verifiedHosts: vi.fn(async () => hosts), slugFor: vi.fn(async (orgId: string) => (orgId === 'o1' ? 'acme' : null)) }
  return s as typeof s & PortalHostSource
}

describe('portal host cache (L9)', () => {
  it('answers random hosts from the verified set, with one read per refresh and none per host', async () => {
    const src = source([['portal.acme.in', 'o1']])
    let t = 0
    const r = portalHostResolver(src, () => t)
    for (let i = 0; i < 500; i += 1) expect(await r.slugForHost(`x${i}.attacker.test`)).toBeNull()
    expect(src.verifiedHosts).toHaveBeenCalledTimes(1)
    expect(src.slugFor).not.toHaveBeenCalled()
    expect(r.cachedSlugs()).toBe(0)
    expect(await r.slugForHost('Portal.Acme.in')).toBe('acme')
    expect(await r.slugForHost('portal.acme.in')).toBe('acme')
    expect(src.slugFor).toHaveBeenCalledTimes(1)
    t = 31_000
    await r.slugForHost('nope.test')
    expect(src.verifiedHosts).toHaveBeenCalledTimes(2)
  })

  it('reads the verified set once when many requests arrive together', async () => {
    const src = source([])
    const r = portalHostResolver(src, () => 0)
    await Promise.all(Array.from({ length: 20 }, (_, i) => r.slugForHost(`h${i}.test`)))
    expect(src.verifiedHosts).toHaveBeenCalledTimes(1)
  })

  it('re-reads after forget, so a newly verified or removed host takes effect at once', async () => {
    const hosts: Array<readonly [string, string]> = []
    const src = source(hosts)
    const r = portalHostResolver(src, () => 0)
    expect(await r.slugForHost('portal.acme.in')).toBeNull()
    hosts.push(['portal.acme.in', 'o1'])
    r.forget('portal.acme.in')
    expect(await r.slugForHost('portal.acme.in')).toBe('acme')
  })

  it('treats a lookup failure as unknown instead of breaking the request', async () => {
    const r = portalHostResolver({ verifiedHosts: async () => Promise.reject(new Error('down')), slugFor: async () => 'x' }, () => 0)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await r.slugForHost('portal.acme.in')).toBeNull()
  })
})

describe('custom domain claims (L9)', () => {
  it('makes only verified hosts unique, so a pending row cannot squat a hostname', async () => {
    const { CustomDomain } = await import('@/models/integrations/CustomDomain')
    const unique = CustomDomain.schema.indexes().filter(([, opts]) => opts?.unique)
    const hostIndex = unique.find(([fields]) => 'domain' in fields)
    expect(hostIndex?.[1]).toMatchObject({ partialFilterExpression: { status: 'verified' } })
  })
})
