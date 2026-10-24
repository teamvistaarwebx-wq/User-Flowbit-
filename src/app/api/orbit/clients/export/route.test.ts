import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const getCtx = vi.fn()
vi.mock('@/lib/ctx', () => ({ getCtx: () => getCtx(), routeRefused: () => false, blockedResponse: () => new Response('Blocked', { status: 403 }) }))
vi.mock('@/modules/clients/queries', () => ({ exportClients: vi.fn(async () => []), parseClientQuery: () => ({}) }))
vi.mock('@/modules/orbit/people', () => ({ orbitPeople: vi.fn(async () => []), peopleIndex: () => new Map(), nameOf: () => '' }))

const { GET } = await import('./route')

const memberWith = (perms: string[]) => ({ has: () => true, can: (p: string) => perms.includes(p) })
const request = { nextUrl: new URL('http://x/api/orbit/clients/export') } as never

describe('client CSV export permission (R3 L-21d)', () => {
  test('refuses a member who can only read clients', async () => {
    getCtx.mockResolvedValue(memberWith(['clients.read']))
    expect((await GET(request)).status).toBe(403)
  })

  test('allows someone who manages clients', async () => {
    getCtx.mockResolvedValue(memberWith(['clients.read', 'clients.write']))
    expect((await GET(request)).status).toBe(200)
  })
})
