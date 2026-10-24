import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }))
vi.mock('@/modules/muster/people/scope', () => ({
  assertVisible: async (_ctx: unknown, id: string) => {
    if (id !== 'visible') throw new Error('That employee was not found.')
  },
  mayDecideOwn: () => false,
  ownEmployeeId: () => null,
}))

const fakeCtx = (employeeId: string) => {
  const updateOne = vi.fn(async () => ({ modifiedCount: 1 }))
  const db = () => ({ findById: () => ({ lean: async () => ({ _id: 'b1', employeeId, employeeName: 'Asha', newMasked: 'XXXX1234' }) }), updateOne })
  return { ctx: { db, userId: 'u1', user: { name: 'HR' } } as never, updateOne }
}

describe('bank-change verification respects team visibility (R1 4.2)', () => {
  it('refuses someone outside the verifier’s view without writing', async () => {
    const { verifyBankChangeCore } = await import('./bank-verify')
    const { ctx, updateOne } = fakeCtx('hidden')
    await expect(verifyBankChangeCore(ctx, 'b1')).rejects.toThrow(/not found/)
    expect(updateOne).not.toHaveBeenCalled()
  })
  it('verifies someone in view', async () => {
    const { verifyBankChangeCore } = await import('./bank-verify')
    const { ctx, updateOne } = fakeCtx('visible')
    const result = await verifyBankChangeCore(ctx, 'b1')
    expect(result.ok).toBe(true)
    expect(updateOne).toHaveBeenCalledOnce()
  })
})
