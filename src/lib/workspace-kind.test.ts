import { describe, expect, it } from 'vitest'
import { activeProducts, enabled, has } from './plans'
import { kindAllowsProduct, kindAllowsRole, kindChangeNote, WORKSPACE_KIND_DEFS, workspaceKindOf } from './workspace-kind'

const NOW = new Date('2026-10-24T06:00:00Z')
const trial = (extra: Record<string, unknown> = {}) => ({ subscription: { plan: 'trial', status: 'trialing', trialEndsAt: new Date('2026-11-08T00:00:00Z') }, ...extra })

describe('workspaceKindOf', () => {
  it('reads the stored kind and treats workspaces without one as agencies', () => {
    expect(workspaceKindOf({ workspaceKind: 'freelancer' })).toBe('freelancer')
    expect(workspaceKindOf({ workspaceKind: 'business' })).toBe('business')
    expect(workspaceKindOf({})).toBe('agency')
    expect(workspaceKindOf({ workspaceKind: 'nonsense' })).toBe('agency')
    expect(workspaceKindOf(null)).toBe('agency')
  })
})

describe('products by kind', () => {
  it('leaves Muster out of freelancer workspaces only', () => {
    expect(kindAllowsProduct('freelancer', 'muster')).toBe(false)
    expect(['work', 'orbit', 'folio'].every((p) => kindAllowsProduct('freelancer', p as 'work'))).toBe(true)
    expect(WORKSPACE_KIND_DEFS.agency.products).toEqual(['work', 'muster', 'orbit', 'folio'])
    expect(WORKSPACE_KIND_DEFS.business.products).toEqual(['work', 'muster', 'orbit', 'folio'])
  })

  it('keeps Muster closed for a freelancer even in a trial with every product switched on', () => {
    const org = trial({ workspaceKind: 'freelancer', enabledProducts: ['work', 'muster', 'orbit', 'folio'] })
    expect(enabled(org, 'muster')).toBe(false)
    expect(has(org, 'muster', NOW)).toBe(false)
    expect(activeProducts(org, NOW)).toEqual(['work', 'orbit', 'folio'])
  })

  it('changes nothing for agencies and workspaces created before the field', () => {
    expect(activeProducts(trial(), NOW)).toEqual(['work', 'muster', 'orbit', 'folio'])
    expect(activeProducts(trial({ workspaceKind: 'business' }), NOW)).toEqual(['work', 'muster', 'orbit', 'folio'])
  })
})

describe('roles by kind', () => {
  it('hides the HR roles from freelancer workspaces and keeps every other role', () => {
    expect(kindAllowsRole('freelancer', 'hr_admin')).toBe(false)
    expect(kindAllowsRole('freelancer', 'hr_exec')).toBe(false)
    expect(['admin', 'manager', 'finance', 'sales', 'member'].every((r) => kindAllowsRole('freelancer', r))).toBe(true)
    expect(kindAllowsRole('agency', 'hr_admin') && kindAllowsRole('business', 'hr_exec')).toBe(true)
  })

  it('allows custom roles (stored by id) in every kind', () => {
    expect(kindAllowsRole('freelancer', '64f000000000000000000001')).toBe(true)
  })
})

describe('kindChangeNote', () => {
  it('says what a switch hides, and nothing when no product is hidden', () => {
    expect(kindChangeNote('agency', 'freelancer')).toMatch(/^Muster is hidden while this is a freelancer workspace/)
    expect(kindChangeNote('freelancer', 'agency')).toBeNull()
    expect(kindChangeNote('agency', 'business')).toBeNull()
  })
})
