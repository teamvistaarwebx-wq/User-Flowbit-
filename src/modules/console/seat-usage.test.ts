import { describe, expect, it } from 'vitest'
import { entitlements } from '@/lib/entitlements'
import { newFreeSubscription } from '@/lib/plans'
import { seatUsageByOrg, usageFor } from './seat-usage'

const NOW = new Date('2026-10-08T06:00:00Z')

describe('Console seat usage', () => {
  it('counts members, pending invites, payroll employees and persons per workspace', () => {
    const usage = seatUsageByOrg({
      members: [{ orgId: 'a', _id: 'm1' }, { orgId: 'a', _id: 'm2' }, { orgId: 'b', _id: 'm3' }],
      invites: [{ orgId: 'a' }],
      employees: [{ orgId: 'a', memberId: 'm1' }, { orgId: 'a', memberId: null }, { orgId: 'a', memberId: 'gone' }],
    })
    expect(usageFor(usage, 'a')).toMatchObject({ members: 2, pendingInvites: 1, employees: 3, persons: 4 })
    expect(usageFor(usage, 'b')).toMatchObject({ members: 1, pendingInvites: 0, employees: 0, persons: 1 })
    expect(usageFor(usage, 'none')).toMatchObject({ members: 0, persons: 0 })
  })

  it('a Free account with 3 logins and 40 payroll employees uses 40 seats, as the account page shows', () => {
    const members = [1, 2, 3].map((n) => ({ orgId: 'a', _id: `m${n}` }))
    const employees = Array.from({ length: 40 }, () => ({ orgId: 'a', memberId: null }))
    const usage = usageFor(seatUsageByOrg({ members, invites: [], employees }), 'a')
    const ent = entitlements({ subscription: { ...newFreeSubscription(NOW), accountType: 'free' } }, NOW, usage, { freeSeats: 5 })
    expect(ent.seatsUsed).toBe(40)
    expect(ent.seatLimit).toBe(5)
  })
})
