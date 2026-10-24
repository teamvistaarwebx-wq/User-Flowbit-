import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
type Row = { _id: string; name: string; status: string; updatedAt: Date }
const CLIENTS: Row[] = [
  { _id: 'a', name: 'Acme', status: 'active', updatedAt: new Date() },
  { _id: 'b', name: 'Bright', status: 'active', updatedAt: new Date() },
  { _id: 'c', name: 'Cedar', status: 'active', updatedAt: new Date() },
  { _id: 'd', name: 'Delta', status: 'lead', updatedAt: new Date() },
]
// Health from signals: b is overdue for long (at risk); the rest are fine.
vi.mock('./signals', () => ({
  clientSignals: async () => new Map([['b', { overduePaise: 1 }]]),
  healthOf: (c: Row, signal: { overduePaise: number } | undefined) => (c.status !== 'active' ? null : signal?.overduePaise ? 'at_risk' : 'good'),
}))
vi.mock('./card-metrics', () => ({ cardMetrics: async () => ({}) }))
vi.mock('./references', () => ({ workModels: async () => null }))
vi.mock('./columns', () => ({ clientColumns: () => ({ work: false, folio: false, orbit: false }) }))
vi.mock('@/modules/orbit/folio-links', () => ({ outstandingByClient: async () => new Map() }))
vi.mock('@/modules/orbit/scope', () => ({ dealAccess: () => ({}) }))

const matches = (row: Row, f: Record<string, unknown>) =>
  Object.entries(f).every(([k, v]) => (v && typeof v === 'object' && '$in' in (v as object) ? (v as { $in: string[] }).$in.map(String).includes(row[k as keyof Row] as string) : k.startsWith('$') || v === undefined || typeof v === 'object' || row[k as keyof Row] === v))
const query = (rows: Row[]) => {
  const q = { sort: () => q, limit: (n: number) => ({ lean: async () => rows.slice(0, n) }), lean: async () => rows }
  return q
}
const ctx = { db: () => ({ find: (f: Record<string, unknown>) => query(CLIENTS.filter((r) => matches(r, f))) }) } as never

describe('clients CSV export respects every list filter', () => {
  it('applies the health filter, which the stored-field filter alone cannot', async () => {
    const { exportClients, parseClientQuery } = await import('./queries')
    const out = await exportClients(ctx, parseClientQuery({ health: 'at_risk' }), '2026-10-09', 100)
    expect(out.map((r) => r.client.name)).toEqual(['Bright'])
    expect(out[0].health).toBe('at_risk')
  })

  it('without a computed filter, exports the stored-filter rows with their health', async () => {
    const { exportClients, parseClientQuery } = await import('./queries')
    const out = await exportClients(ctx, parseClientQuery({ status: 'all' }), '2026-10-09', 100)
    expect(out.map((r) => [r.client.name, r.health])).toEqual([['Acme', 'good'], ['Bright', 'at_risk'], ['Cedar', 'good'], ['Delta', null]])
  })
})
