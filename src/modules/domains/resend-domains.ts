/**
 * Resend's Domains API behind a small interface (create, verify, read), so
 * tests pass a fake and never call Resend. The server builds it from the
 * Resend SDK with RESEND_API_KEY.
 */

export type DnsRecord = { purpose: string; type: string; name: string; value: string; priority?: number | null; status?: string | null }
export type ProviderDomain = { id: string; status: string; records: DnsRecord[] }

export interface DomainsProvider {
  create(name: string): Promise<ProviderDomain>
  verify(id: string): Promise<void>
  get(id: string): Promise<ProviderDomain>
  remove(id: string): Promise<void>
}

type SdkRecord = { record?: string; type?: string; name?: string; value?: string; priority?: number; status?: string }
type SdkDomain = { id?: string; status?: string; records?: SdkRecord[] }
type SdkResult<T> = Promise<{ data: T | null; error: { message: string } | null }>

/** The slice of the Resend SDK this uses. */
export type ResendDomainsLike = {
  domains: {
    create: (input: { name: string }) => SdkResult<SdkDomain>
    verify: (id: string) => SdkResult<unknown>
    get: (id: string) => SdkResult<SdkDomain>
    remove: (id: string) => SdkResult<unknown>
  }
}

export class DomainProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainProviderError'
  }
}

/** SPF, DKIM, return-path (MX) and DMARC words for each record Resend asks for. */
function purposeOf(r: SdkRecord): string {
  const record = (r.record ?? '').toUpperCase()
  if (record === 'DKIM') return 'DKIM'
  if (record === 'SPF' && r.type === 'MX') return 'Return path (MX)'
  if (record === 'SPF') return 'SPF'
  return record || (r.type ?? 'DNS')
}

function toDomain(d: SdkDomain | null): ProviderDomain {
  if (!d?.id) throw new DomainProviderError('Resend did not return the domain.')
  return {
    id: d.id,
    status: d.status ?? 'not_started',
    records: (d.records ?? []).map((r) => ({ purpose: purposeOf(r), type: r.type ?? '', name: r.name ?? '', value: r.value ?? '', priority: r.priority ?? null, status: r.status ?? null })),
  }
}

async function unwrap<T>(call: SdkResult<T>): Promise<T | null> {
  const { data, error } = await call
  if (error) throw new DomainProviderError(error.message)
  return data
}

export function resendDomains(client: ResendDomainsLike): DomainsProvider {
  return {
    create: async (name) => toDomain(await unwrap(client.domains.create({ name }))),
    verify: async (id) => {
      await unwrap(client.domains.verify(id))
    },
    get: async (id) => toDomain(await unwrap(client.domains.get(id))),
    remove: async (id) => {
      await unwrap(client.domains.remove(id))
    },
  }
}
