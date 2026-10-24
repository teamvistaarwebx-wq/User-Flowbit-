import { describe, expect, it } from 'vitest'
import { maskEmployee, maskPan, maskPreviewRow, maskSensitiveText, maskTail } from './mask'
import { STAFF_ROLES } from './roles'
import { activeGrant, DPA_VERSION, dpaAccepted, grantEndsAt, grantHours, staffImportRefusal, supportStatus, type SupportGrant } from './support-access'

const now = new Date('2026-11-10T06:00:00Z')
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000)
const grant = (over: Partial<SupportGrant>): SupportGrant => ({ mode: 'read', status: 'approved', hours: 24, approvedAt: hours(-1), expiresAt: hours(23), ...over })

describe('support access expiry', () => {
  it('is active only while approved and before its end', () => {
    expect(supportStatus(grant({}), now)).toBe('active')
    expect(supportStatus(grant({ expiresAt: hours(-0.01) }), now)).toBe('expired')
    expect(supportStatus(grant({ expiresAt: now }), now)).toBe('expired')
    expect(supportStatus(grant({ status: 'requested', expiresAt: null }), now)).toBe('requested')
    expect(supportStatus(grant({ status: 'revoked' }), now)).toBe('revoked')
    expect(supportStatus(grant({ status: 'denied' }), now)).toBe('denied')
  })

  it('clamps read access to 1–72 hours and fixes import access at 7 days', () => {
    expect(grantHours('read')).toBe(24)
    expect(grantHours('read', 0)).toBe(1)
    expect(grantHours('read', 500)).toBe(72)
    expect(grantHours('import', 1)).toBe(168)
    expect(grantEndsAt({ mode: 'read', hours: 48 }, now)).toEqual(hours(48))
    expect(grantEndsAt({ mode: 'import', hours: 1 }, now)).toEqual(hours(168))
  })

  it('picks the running grant of the mode asked for; import access never opens the read view', () => {
    const later = grant({ expiresAt: hours(40) })
    expect(activeGrant([grant({}), later, grant({ expiresAt: hours(-1) })], 'read', now)).toBe(later)
    expect(activeGrant([grant({ mode: 'import', expiresAt: hours(100) })], 'read', now)).toBeNull()
    expect(activeGrant([], 'read', now)).toBeNull()
  })
})

describe('consent gate for staff imports (spec 9)', () => {
  const dpa = { version: DPA_VERSION, acceptedAt: hours(-48) }
  const importGrant = grant({ mode: 'import', hours: 168, expiresAt: hours(100) })

  it('needs the current DPA', () => {
    expect(dpaAccepted(dpa)).toBe(true)
    expect(dpaAccepted({ version: 'old', acceptedAt: hours(-1) })).toBe(false)
    expect(dpaAccepted(null)).toBe(false)
    expect(staffImportRefusal({ dpa: null, grants: [importGrant], now })).toMatch(/data processing agreement/)
    expect(staffImportRefusal({ dpa: { version: 'old', acceptedAt: hours(-1) }, grants: [importGrant], now })).toMatch(/data processing agreement/)
  })

  it('needs an approved, running import grant', () => {
    expect(staffImportRefusal({ dpa, grants: [], now })).toMatch(/no approved import access/)
    expect(staffImportRefusal({ dpa, grants: [grant({ mode: 'import', status: 'requested', expiresAt: null })], now })).toMatch(/no approved import access/)
    expect(staffImportRefusal({ dpa, grants: [grant({ mode: 'import', expiresAt: hours(-1) })], now })).toMatch(/no approved import access/)
    expect(staffImportRefusal({ dpa, grants: [grant({ mode: 'read' })], now })).toMatch(/no approved import access/)
  })

  it('passes with both', () => {
    expect(staffImportRefusal({ dpa, grants: [importGrant], now })).toBeNull()
  })
})

describe('masking salary, bank and PAN (owner decision D3)', () => {
  const employee = { pan: 'ABCDE1234F', bank: { accountNumber: '50100123456789', ifsc: 'HDFC0001234' }, monthlyGrossPaise: 6_500_000 }

  it('masks for every staff role, Admin included', () => {
    for (const role of STAFF_ROLES) {
      // Act: the support view masks the same way whoever opens it
      const m = maskEmployee(employee)
      // Assert
      expect(m).toEqual({ pan: '••••234F', bankAccount: '••••6789', ifsc: '••••', salary: '••••', masked: true })
      expect(JSON.stringify(m)).not.toContain('ABCDE1234F')
      expect(JSON.stringify(m)).not.toContain('50100123456789')
      expect(JSON.stringify(m)).not.toContain('65,000')
      expect(maskPan('ABCDE1234F')).toBe('••••234F')
      expect(role).toBeTruthy()
    }
  })

  it('shows a dash for missing values and hides short ones entirely', () => {
    expect(maskEmployee({})).toEqual({ pan: '—', bankAccount: '—', ifsc: '—', salary: '—', masked: true })
    expect(maskTail('123')).toBe('••••')
    expect(maskTail('')).toBe('—')
  })

  it('masks amounts, PANs and account numbers in workspace audit text', () => {
    // Arrange
    const summary = 'Salary structure saved for Asha from 1 Oct 2026: ₹65,000.50 a month; PAN ABCDE1234F, account 50100123456789'
    // Act
    const shown = maskSensitiveText(summary)
    // Assert
    expect(shown).toBe('Salary structure saved for Asha from 1 Oct 2026: ₹•••• a month; PAN ••••234F, account ••••6789')
    expect(maskSensitiveText(null)).toBe('')
  })

  it('masks a staff import preview row without changing the original', () => {
    const row = { line: 4, label: 'Asha · ABCDE1234F', errors: ['Bank account 50100123456789 is already on another employee'], warnings: ['Monthly gross ₹65,000 is ignored'] }
    const shown = maskPreviewRow(row)
    expect(shown).toEqual({ line: 4, label: 'Asha · ••••234F', errors: ['Bank account ••••6789 is already on another employee'], warnings: ['Monthly gross ₹•••• is ignored'] })
    expect(row.label).toBe('Asha · ABCDE1234F')
  })
})

describe('V2-REVIEW Console access fixes', () => {
  it('C3: a grant covers only the staff member the owner approved', async () => {
    const { grantsFor } = await import('./support-access')
    const grants = [{ staffId: 'a', mode: 'read' as const }, { staffId: 'b', mode: 'read' as const }, { mode: 'read' as const }]
    expect(grantsFor(grants, 'a')).toEqual([grants[0]])
    expect(grantsFor(grants, 'c')).toEqual([])
  })

  it('C2: the Internal workspace is locked to everyone but the founder', async () => {
    const { internalLocked } = await import('./support-access')
    expect(internalLocked('internal', false)).toBe(true)
    expect(internalLocked('internal', true)).toBe(false)
    expect(internalLocked('paid', false)).toBe(false)
    expect(internalLocked(undefined, false)).toBe(false)
  })

  it('C1: workspace audit rows show only to an Admin with an active read grant', async () => {
    const { showsWorkspaceAudit } = await import('./support-access')
    expect(showsWorkspaceAudit('sales', true)).toBe(false)
    expect(showsWorkspaceAudit('accounts', true)).toBe(false)
    expect(showsWorkspaceAudit('admin', false)).toBe(false)
    expect(showsWorkspaceAudit('admin', true)).toBe(true)
  })
})
