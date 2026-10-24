import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, permissionsOf } from './catalog'
import { BUILTIN_ROLES, builtInRoleDocs, resolvePermissions, roleLabel } from './permissions'

describe('built-in roles', () => {
  it('gives the owner everything and the admin everything but billing and deletion', () => {
    expect(resolvePermissions('owner').size).toBe(ALL_PERMISSIONS.length)
    const admin = resolvePermissions('admin')
    expect(admin.has('billing.manage')).toBe(false)
    expect(admin.has('org.delete')).toBe(false)
    expect(admin.has('payroll.approve')).toBe(true)
  })

  it('gives HR admin all of Muster and HR exec no payroll approval or salary edits', () => {
    const hr = resolvePermissions('hr_admin')
    expect(permissionsOf('muster').every((p) => hr.has(p))).toBe(true)
    const exec = resolvePermissions('hr_exec')
    expect(exec.has('people.write')).toBe(true)
    expect(exec.has('payroll.approve')).toBe(false)
    expect(exec.has('people.salary')).toBe(false)
  })

  it('gives finance Folio and payroll release, sales Orbit and quotes', () => {
    const finance = resolvePermissions('finance')
    expect(permissionsOf('folio').every((p) => finance.has(p))).toBe(true)
    expect(finance.has('payroll.release')).toBe(true)
    expect(finance.has('claims.pay')).toBe(true)
    const sales = resolvePermissions('sales')
    expect(permissionsOf('orbit').every((p) => sales.has(p))).toBe(true)
    expect(sales.has('quotes.write')).toBe(true)
    expect(sales.has('invoices.issue')).toBe(false)
    // SPEC: sales gets Folio quotes only, not invoices, receipts or ledgers.
    expect(sales.has('folio.read')).toBe(false)
  })

  it('gives managers Work and approvals, members only basics', () => {
    const manager = resolvePermissions('manager')
    expect(permissionsOf('work').every((p) => manager.has(p))).toBe(true)
    expect(manager.has('leave.approve')).toBe(true)
    expect(manager.has('orbit.read')).toBe(true)
    expect(manager.has('deals.write')).toBe(false)
    const member = resolvePermissions('member')
    expect(member.has('tasks.write')).toBe(true)
    expect(member.has('tasks.manage')).toBe(false)
    expect(member.has('people.read')).toBe(false)
  })

  it('scopes Muster visibility and Orbit reach by role (patch 1 keys)', () => {
    const manager = resolvePermissions('manager')
    expect(manager.has('people.read_team')).toBe(true)
    expect(manager.has('people.read_all')).toBe(false)
    expect(manager.has('orbit.view_all')).toBe(true)
    expect(manager.has('orbit.close')).toBe(false)
    expect(resolvePermissions('hr_exec').has('people.read_sensitive')).toBe(false)
    expect(resolvePermissions('hr_exec').has('claims.read')).toBe(true)
    expect(resolvePermissions('finance').has('people.read_sensitive')).toBe(true)
    expect(resolvePermissions('finance').has('payroll.unlock')).toBe(false)
    expect(resolvePermissions('hr_admin').has('payroll.unlock')).toBe(true)
    expect(resolvePermissions('sales').has('orbit.close')).toBe(true)
    expect(resolvePermissions('finance').has('collections.write')).toBe(true)
  })

  it('resolves custom roles by id and drops unknown permission names', () => {
    const custom = [{ _id: 'abc123', key: 'abc123', label: 'Recruiter', permissions: ['people.read', 'not.a.permission'] }]
    expect([...resolvePermissions('abc123', custom)]).toEqual(['people.read'])
    expect(roleLabel('abc123', custom)).toBe('Recruiter')
    expect(resolvePermissions('ghost', custom).size).toBe(0)
  })

  it('creates one Role document per built-in role', () => {
    const docs = builtInRoleDocs()
    expect(docs.map((d) => d.key)).toEqual(Object.keys(BUILTIN_ROLES))
    expect(docs.every((d) => d.builtIn)).toBe(true)
  })
})
