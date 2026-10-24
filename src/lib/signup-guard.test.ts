import { describe, expect, it } from 'vitest'
import { duplicateMessage, duplicateReason, freeDuplicateFilter, panOfGstin, taxIdField, trialUsedFilter, trialUsedMessage } from './signup-guard'

const GSTIN = '23ABCFV1234K1Z6'
const PAN = 'ABCFV1234K'

describe('taxIdField', () => {
  it('reads a GSTIN (with its PAN), a PAN, or nothing', () => {
    expect(taxIdField.parse(` ${GSTIN.toLowerCase()} `)).toEqual({ gstin: GSTIN, pan: PAN })
    expect(taxIdField.parse('abcfv1234k')).toEqual({ pan: PAN })
    expect(taxIdField.parse('')).toEqual({})
    expect(taxIdField.parse(undefined)).toEqual({})
  })

  it('refuses anything else', () => {
    const result = taxIdField.safeParse('12345')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toMatch(/GSTIN or a 10-character PAN/)
  })
})

describe('freeDuplicateFilter', () => {
  it('matches Free workspaces without a plan created by the same verified user', () => {
    expect(freeDuplicateFilter({ userId: 'u1' })).toEqual({ 'subscription.accountType': 'free', 'subscription.plan': 'trial', $or: [{ createdBy: 'u1' }] })
  })

  it('also matches the same GSTIN, the same PAN, or a GSTIN that contains the PAN', () => {
    const filter = freeDuplicateFilter({ userId: 'u1', gstin: GSTIN, pan: PAN }) as { $or: Record<string, unknown>[] }
    expect(filter.$or.slice(0, 3)).toEqual([{ createdBy: 'u1' }, { gstin: GSTIN }, { pan: PAN }])
    const byPan = filter.$or[3].gstin as RegExp
    expect(byPan.test(`27${PAN}1Z9`)).toBe(true)
    expect(byPan.test('27ZZZZZ9999Z1Z9')).toBe(false)
  })

  it('derives the PAN from a GSTIN when only the GSTIN is given', () => {
    expect(panOfGstin(GSTIN)).toBe(PAN)
    const filter = freeDuplicateFilter({ userId: 'u1', gstin: GSTIN }) as { $or: Record<string, unknown>[] }
    expect(filter.$or).toContainEqual({ pan: PAN })
  })
})

describe('duplicateReason', () => {
  it('names what matched: GSTIN first, then PAN, else the email', () => {
    expect(duplicateReason({ gstin: GSTIN }, { userId: 'u1', gstin: GSTIN, pan: PAN })).toBe('gstin')
    expect(duplicateReason({ gstin: `27${PAN}1Z9` }, { userId: 'u1', pan: PAN })).toBe('pan')
    expect(duplicateReason({ pan: PAN }, { userId: 'u1', gstin: GSTIN, pan: PAN })).toBe('pan')
    expect(duplicateReason({ createdBy: 'u1' }, { userId: 'u1' })).toBe('email')
  })

  it('explains the refusal and the way forward', () => {
    expect(duplicateMessage('pan', 'Acme')).toBe('Acme already uses the Free plan for this PAN. Each business gets one Free workspace. Choose more than 5 people to start a 15-day trial instead, or upgrade Acme.')
  })
})

describe('trialUsedFilter (owner decision D5: one trial per business)', () => {
  it('matches any workspace of the same user, GSTIN or PAN whose trial ever started', () => {
    // Arrange
    const userId = 'u1'
    // Act
    const filter = trialUsedFilter({ userId, gstin: '27ABCDE1234F1Z5' })
    // Assert
    expect(filter['subscription.trialStartedAt']).toEqual({ $ne: null })
    expect(filter).not.toHaveProperty('subscription.accountType')
    expect(filter.$or).toEqual(expect.arrayContaining([{ createdBy: 'u1' }, { gstin: '27ABCDE1234F1Z5' }, { pan: 'ABCDE1234F' }]))
    expect(filter).not.toHaveProperty('_id')
  })

  it('leaves out the asking workspace', () => {
    expect(trialUsedFilter({ userId: 'u1', excludeOrgId: 'o1' })._id).toEqual({ $ne: 'o1' })
  })

  it('names the earlier workspace in the signup refusal', () => {
    expect(trialUsedMessage('gstin', 'Acme')).toMatch(/^Acme already had the 15-day trial for this GSTIN\. Each business gets one trial\./)
  })
})
