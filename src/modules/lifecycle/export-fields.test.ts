import { describe, expect, it } from 'vitest'
import { WORKSPACE_EXPORT_FIELDS, WORKSPACE_EXPORT_NEVER, workspaceProjection } from './export-fields'

describe('workspace export fields (R3 L-30a)', () => {
  it('includes the v2 company data', () => {
    for (const field of ['profile', 'signatories', 'attendanceGeo', 'breakTypes', 'security', 'meetingsAi']) expect(WORKSPACE_EXPORT_FIELDS).toContain(field)
  })

  it('never includes keys or payment-provider internals', () => {
    // Arrange
    const exported = new Set<string>(WORKSPACE_EXPORT_FIELDS)

    // Act
    const leaked = WORKSPACE_EXPORT_NEVER.filter((f) => exported.has(f) || exported.has(f.split('.')[0]))

    // Assert
    expect(leaked).toEqual([])
    expect(workspaceProjection()).not.toMatch(/brandKey|razorpay|pendingCheckout/)
  })
})
