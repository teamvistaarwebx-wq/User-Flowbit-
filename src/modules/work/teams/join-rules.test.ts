import { describe, expect, it } from 'vitest'
import { INVITE_ONLY_REFUSAL, joinRefusal } from './join-rules'

const ME = '64b000000000000000000001'
const OTHER = '64b000000000000000000002'

describe('joinRefusal (R3 M2)', () => {
  it('refuses to let a member join an invite-only team themselves', () => {
    // Arrange
    const team = { isActive: true, isPrivate: true, members: [{ memberId: OTHER }] }

    // Act
    const refusal = joinRefusal(team, ME)

    // Assert
    expect(refusal).toBe(INVITE_ONLY_REFUSAL)
  })

  it('lets a member join an open team', () => {
    expect(joinRefusal({ isActive: true, isPrivate: false, members: [] }, ME)).toBeNull()
    expect(joinRefusal({ members: [{ memberId: OTHER }] }, ME)).toBeNull()
  })

  it('refuses an inactive team and someone already in it', () => {
    expect(joinRefusal({ isActive: false, members: [] }, ME)).toMatch(/not taking new members/)
    expect(joinRefusal({ isActive: true, members: [{ memberId: ME }] }, ME)).toMatch(/already in this team/)
  })
})
