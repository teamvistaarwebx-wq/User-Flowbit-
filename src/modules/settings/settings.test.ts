import { describe, expect, it } from 'vitest'
import { auditProduct, changeRows, entityHref, isSensitiveAction } from './audit-meta'
import { dayGroup, deviceLabel, formatBytes, groupByDay, mailKindLabel, maskKey, notificationArea, previewHtml, whenInDayGroup } from './format'
import { escalationMessage, missingGrants, normalizePermissions, permissionDiff, permissionGroups, wouldLoop } from './roles'

describe('roles', () => {
  it('groups every catalog permission by product', () => {
    const groups = permissionGroups()
    expect(groups.map((g) => g.area)).toEqual(['core', 'work', 'muster', 'orbit', 'folio'])
    expect(groups[0].permissions.some((p) => p.key === 'billing.manage')).toBe(true)
  })

  it('drops unknown keys and duplicates', () => {
    expect(normalizePermissions(['tasks.write', 'nope', 'tasks.write', 'org.manage'])).toEqual(['org.manage', 'tasks.write'])
  })

  it('names the permissions an actor cannot grant', () => {
    const actor = new Set(['tasks.write', 'projects.write'])
    expect(missingGrants(actor, ['tasks.write', 'payroll.approve'])).toEqual(['payroll.approve'])
    expect(escalationMessage(['payroll.approve'])).toBe("You can't grant 'Approve payroll (finance)': you don't have it yourself.")
  })

  it('diffs permission lists', () => {
    expect(permissionDiff(['tasks.write', 'tasks.read'], ['tasks.read', 'projects.write'])).toEqual({ added: ['projects.write'], removed: ['tasks.write'] })
  })

  it('detects manager loops', () => {
    const managerOf = new Map([
      ['rahul', 'aditi'],
      ['aditi', 'meera'],
    ])
    expect(wouldLoop('meera', 'rahul', managerOf)).toBe(true)
    expect(wouldLoop('rahul', 'meera', managerOf)).toBe(false)
    expect(wouldLoop('rahul', 'rahul', managerOf)).toBe(true)
  })
})

describe('format', () => {
  it('reads common user agents', () => {
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36')).toBe('Chrome on macOS')
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0')).toBe('Edge on Windows')
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS')
    expect(deviceLabel('')).toBe('Unknown device')
  })

  it('groups by IST day across midnight', () => {
    const now = new Date('2026-10-01T00:30:00+05:30')
    expect(dayGroup(new Date('2026-10-01T00:05:00+05:30'), now)).toBe('Today')
    expect(dayGroup(new Date('2026-09-30T23:55:00+05:30'), now)).toBe('Yesterday')
    expect(dayGroup(new Date('2026-09-27T10:00:00+05:30'), now)).toBe('Earlier this week')
    expect(dayGroup(new Date('2026-09-20T10:00:00+05:30'), now)).toBe('Earlier')
    const groups = groupByDay([{ createdAt: '2026-09-30T18:45:00Z' }, { createdAt: '2026-09-30T18:40:00Z' }, { createdAt: '2026-09-30T10:00:00Z' }], now)
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
    ])
  })

  it('formats sizes and masks keys', () => {
    expect(formatBytes(1_572_864)).toBe('1.5 MB')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(maskKey('rzp_test_ABCDEFGH1234')).toBe('rzp_test_…1234')
  })

  it('maps notifications to product chips', () => {
    expect(notificationArea({ event: 'leave.approved' })).toBe('muster')
    expect(notificationArea({ product: 'folio', event: 'x.y' })).toBe('folio')
    expect(notificationArea({ event: 'subscription.trial_ending' })).toBe('workspace')
  })
})

describe('audit meta', () => {
  it('derives the product from the action prefix', () => {
    expect(auditProduct({ action: 'invoice.issued' })).toBe('folio')
    expect(auditProduct({ action: 'member.invited' })).toBe('workspace')
  })
  it('flags sensitive actions', () => {
    expect(isSensitiveAction('member.role_changed')).toBe(true)
    expect(isSensitiveAction('platform.trial_extended')).toBe(true)
    expect(isSensitiveAction('member.invited')).toBe(false)
  })
  it('links entities and lists changes', () => {
    expect(entityHref('Invoice', 'abc')).toBe('/app/folio/invoices/abc')
    expect(changeRows({ before: { role: 'member' }, after: { role: 'admin', title: 'Lead' } })).toEqual([
      { field: 'role', before: 'member', after: 'admin' },
      { field: 'title', before: '—', after: 'Lead' },
    ])
  })

  it('compares product lists as a whole, not index by index', () => {
    expect(changeRows({ before: ['work', 'muster', 'orbit', 'folio'], after: ['work', 'muster', 'folio'] })).toEqual([
      { field: 'Removed', before: 'orbit', after: '—' },
      { field: 'All', before: 'work, muster, orbit, folio', after: 'work, muster, folio' },
    ])
  })

  it('names the permissions a role edit added and removed', () => {
    expect(changeRows({ added: ['leads.write'], removed: [] })).toEqual([{ field: 'Added', before: '—', after: 'leads.write' }])
  })

  it('shows nested objects field by field, only where they changed', () => {
    expect(changeRows({ before: { officeHours: { start: '09:30', end: '18:30' } }, after: { officeHours: { start: '10:00', end: '18:30' } } })).toEqual([
      { field: 'officeHours.start', before: '09:30', after: '10:00' },
    ])
  })
})

describe('email log and notification labels', () => {
  it('labels Outbox kinds in sentence case', () => {
    expect(mailKindLabel('password_reset')).toBe('Password reset')
    expect(mailKindLabel('invite')).toBe('Invite')
  })

  it('opens preview links in a new tab', () => {
    expect(previewHtml('<html><head><title>x</title></head><body></body></html>')).toBe('<html><head><base target="_blank"><title>x</title></head><body></body></html>')
    expect(previewHtml('<p>Hi</p>')).toBe('<base target="_blank"><p>Hi</p>')
  })

  it('shows times that agree with the day heading (IST)', () => {
    const now = new Date('2026-10-02T03:00:00Z') // 8:30 am IST
    expect(whenInDayGroup(new Date('2026-10-02T00:00:00Z'), now)).toBe('3 h ago')
    expect(whenInDayGroup(new Date('2026-10-01T14:45:00Z'), now)).toBe('8:15 pm')
    expect(whenInDayGroup(new Date('2026-09-28T15:42:00Z'), now)).toBe('28 Sep, 9:12 pm')
  })
})
