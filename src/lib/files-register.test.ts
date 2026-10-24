import { Types } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const driver = { size: vi.fn(), delete: vi.fn(async () => undefined) }
vi.mock('@/lib/storage', () => ({ storage: () => driver }))
const create = vi.fn(async (doc: Record<string, unknown>) => ({ toObject: () => doc }))
vi.mock('@/models/StoredFile', () => ({ StoredFile: { create } }))
vi.mock('@/models/Member', () => ({ Member: {} }))

const { registerUploadedFile } = await import('./files')

const ORG_A = new Types.ObjectId('64f000000000000000000001')
const ID = new Types.ObjectId('64f0000000000000000000aa')
const ctx = { orgId: ORG_A, userId: new Types.ObjectId() }
const MAX = 1000
const base = { id: ID, name: 'rec.mp3', mime: 'audio/mpeg', kind: 'meeting_recording', maxBytes: MAX }

describe('registerUploadedFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses the traversal key from R3 H1 without touching storage', async () => {
    // Arrange
    const key = `${ORG_A}/2026-10/${ID}-x/../../../64f000000000000000000002/2026-09/64f0000000000000000000bb-payslip.pdf`

    // Act
    const file = await registerUploadedFile(ctx, { ...base, key })

    // Assert
    expect(file).toBeNull()
    expect(driver.size).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('stores the real object size, not the declared one (R3 M1)', async () => {
    driver.size.mockResolvedValueOnce(640)
    const file = await registerUploadedFile(ctx, { ...base, key: `${ORG_A}/2026-10/${ID}-rec.mp3` })
    expect(file?.size).toBe(640)
  })

  it('deletes and refuses an object over the cap (R3 M1)', async () => {
    // Arrange
    const key = `${ORG_A}/2026-10/${ID}-rec.mp3`
    driver.size.mockResolvedValueOnce(MAX + 1)

    // Act + Assert
    await expect(registerUploadedFile(ctx, { ...base, key })).rejects.toThrow(/larger than/)
    expect(driver.delete).toHaveBeenCalledWith(key)
    expect(create).not.toHaveBeenCalled()
  })

  it('returns null when nothing was uploaded', async () => {
    driver.size.mockResolvedValueOnce(null)
    expect(await registerUploadedFile(ctx, { ...base, key: `${ORG_A}/2026-10/${ID}-rec.mp3` })).toBeNull()
  })
})
