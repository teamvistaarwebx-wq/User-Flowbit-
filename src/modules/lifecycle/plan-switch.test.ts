import { Types } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newFreeSubscription, newSignupTrialSubscription, type OrgLike } from '@/lib/plans'

vi.mock('server-only', () => ({}))
const org = { findById: vi.fn(), exists: vi.fn(), updateOne: vi.fn() }
vi.mock('@/models/Org', () => ({ Org: org }))
vi.mock('@/modules/subscription/usage', () => ({ usageOf: vi.fn(async () => ({})) }))
vi.mock('@/lib/billing', () => ({ billableSeats: () => 3 }))

const lean = <T>(value: T) => ({ lean: async () => value })

describe('V2-REVIEW E1: back to Free only when no other Free workspace exists', () => {
  const now = new Date('2026-10-08T06:00:00Z')
  const orgId = new Types.ObjectId()
  const trial: OrgLike = { createdAt: new Date(now.getTime() - 20 * 86_400_000), subscription: newSignupTrialSubscription(new Date(now.getTime() - 20 * 86_400_000)) }

  beforeEach(() => {
    vi.clearAllMocks()
    org.findById.mockReturnValue(lean({ _id: orgId, createdBy: new Types.ObjectId(), gstin: null, pan: null }))
    org.updateOne.mockResolvedValue({ modifiedCount: 1 })
  })

  it('refuses when the same user, GSTIN or PAN already has a Free workspace', async () => {
    org.exists.mockResolvedValue({ _id: new Types.ObjectId() })
    const { returnToFree } = await import('./plan-switch')
    expect(await returnToFree({ orgId, db: (() => null) as never }, trial, now)).toEqual({ ok: false, reason: 'duplicate' })
    expect(org.exists).toHaveBeenCalledWith(expect.objectContaining({ _id: { $ne: orgId }, 'subscription.accountType': 'free' }))
    expect(org.updateOne).not.toHaveBeenCalled()
  })

  it('moves to Free when none exists', async () => {
    org.exists.mockResolvedValue(null)
    const { returnToFree } = await import('./plan-switch')
    expect(await returnToFree({ orgId, db: (() => null) as never }, trial, now)).toMatchObject({ ok: true })
    expect(org.updateOne).toHaveBeenCalled()
  })
})

describe('one 15-day trial per business (owner decision D5)', () => {
  const now = new Date('2026-10-08T06:00:00Z')
  const orgId = new Types.ObjectId()
  const ownerId = new Types.ObjectId()
  const free: OrgLike = { createdAt: now, subscription: newFreeSubscription(new Date(now.getTime() - 10 * 86_400_000)) }

  beforeEach(() => {
    vi.clearAllMocks()
    org.findById.mockReturnValue(lean({ _id: orgId, createdBy: ownerId, gstin: '23ABCDE1234F1Z5', pan: null }))
    org.updateOne.mockResolvedValue({ modifiedCount: 1 })
  })

  it('refuses a Free workspace whose business already used its trial elsewhere', async () => {
    // Arrange
    org.exists.mockResolvedValue({ _id: new Types.ObjectId() })
    const { startTrial } = await import('./plan-switch')
    // Act
    const result = await startTrial(orgId, free, now)
    // Assert: looked up by the same user, GSTIN and the PAN inside it, leaving this workspace out
    expect(result).toEqual({ ok: false, reason: 'business_used' })
    const filter = org.exists.mock.calls[0][0] as Record<string, unknown>
    expect(filter).toMatchObject({ 'subscription.trialStartedAt': { $ne: null }, _id: { $ne: orgId } })
    expect(filter.$or).toEqual(expect.arrayContaining([{ createdBy: ownerId }, { gstin: '23ABCDE1234F1Z5' }, { pan: 'ABCDE1234F' }]))
    expect(org.updateOne).not.toHaveBeenCalled()
  })

  it('starts the trial when no workspace of the business had one', async () => {
    org.exists.mockResolvedValue(null)
    const { startTrial } = await import('./plan-switch')
    expect(await startTrial(orgId, free, now)).toMatchObject({ ok: true })
    expect(org.updateOne).toHaveBeenCalled()
  })
})
