import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/files', () => ({ streamStoredFile: vi.fn() }))
vi.mock('@/modules/muster/people/scope', () => ({ visibleEmployeeIds: vi.fn(async () => null), visibleFilter: () => ({}) }))
const rows = { sort: () => ({ lean: async () => [] }), lean: async () => [] }
const ctx = { has: () => true, can: () => true, db: () => ({ find: () => rows }) }
vi.mock('@/lib/ctx', () => ({ getCtx: async () => ctx, routeRefused: () => false, blockedResponse: () => new Response('Blocked', { status: 403 }) }))

const { GET } = await import('./route')

const exportWith = (status: string) => GET({ nextUrl: new URL(`http://x/api/muster/people/export?status=${encodeURIComponent(status)}`) } as never)

describe('people export file name (R3 L-23d)', () => {
  test('names the file after a known status', async () => {
    const res = await exportWith('probation')
    expect(res.headers.get('Content-Disposition')).toContain('filename="people-probation.csv"')
  })

  test('never reflects an unknown status into the header', async () => {
    // Arrange
    const crafted = 'x"; filename="payroll.exe'
    // Act
    const res = await exportWith(crafted)
    // Assert
    const header = res.headers.get('Content-Disposition') ?? ''
    expect(header).toContain('filename="people-all.csv"')
    expect(header).not.toContain('payroll')
  })
})
