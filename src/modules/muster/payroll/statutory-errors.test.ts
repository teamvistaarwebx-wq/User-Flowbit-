import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUTORY, statutorySettingsSchema } from './statutory'
import { statutoryFieldLabel, statutoryIssueMessage } from './statutory-errors'

const firstMessage = (input: unknown) => {
  const parsed = statutorySettingsSchema.safeParse(input)
  if (parsed.success) throw new Error('expected a validation failure')
  return statutoryIssueMessage(parsed.error.issues[0], input)
}

describe('statutoryIssueMessage', () => {
  it('names the PF rate and gives the limit as a percentage', () => {
    // Arrange
    const input = { ...DEFAULT_STATUTORY, pf: { ...DEFAULT_STATUTORY.pf, employeeRatePercent: 40 } }
    // Act
    const message = firstMessage(input)
    // Assert
    expect(message).toBe('Employee PF rate must be 25% or less.')
  })

  it('gives rupee limits in Indian grouping', () => {
    const input = { ...DEFAULT_STATUTORY, esi: { ...DEFAULT_STATUTORY.esi, grossEligibilityLimit: 500_000 } }
    expect(firstMessage(input)).toBe('ESI gross limit must be ₹1,00,000 or less.')
  })

  it('names the professional tax state and slab', () => {
    const input = { ...DEFAULT_STATUTORY, pt: [{ ...DEFAULT_STATUTORY.pt[0], slabs: [{ upTo: 100, amount: 0 }, { upTo: null, amount: -5 }] }] }
    expect(firstMessage(input)).toBe('Professional tax (MP) slab 2 amount must be ₹0 or more.')
  })

  it('explains a bad state code', () => {
    const input = { ...DEFAULT_STATUTORY, lwf: [{ ...DEFAULT_STATUTORY.lwf[0], state: 'Madhya Pradesh' }] }
    expect(firstMessage(input)).toBe('LWF schedule 1 state must be a two-letter state code.')
  })

  it('reports a missing section without showing a path', () => {
    expect(firstMessage({ ...DEFAULT_STATUTORY, esi: undefined })).toBe('ESI settings is missing or not a valid value.')
  })
})

describe('statutoryFieldLabel', () => {
  it('falls back to a schedule number when the state is unknown', () => {
    expect(statutoryFieldLabel(['pt', 2, 'slabs', 0, 'upTo']).label).toBe('Professional tax schedule 3 slab 1 upper limit')
  })
})
