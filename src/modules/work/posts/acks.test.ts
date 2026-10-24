import { describe, expect, it } from 'vitest'
import { ACK_REMIND_GAP_MS, ackRows, acksCsv, nextReminderAt, pendingAckIds, withAck } from './acks'

const people = [{ id: 'author', name: 'Asha' }, { id: 'b', name: 'Bina', email: 'b@x.in' }, { id: 'c', name: 'Chetan' }, { id: 'd', name: 'Deepa' }]
const acks = [{ memberId: 'd', at: new Date('2026-10-02T05:00:00Z') }, { memberId: 'b', at: new Date('2026-10-01T05:00:00Z') }]

describe('policy acknowledgements', () => {
  it('lists acknowledged people first by time, then pending by name, without the author', () => {
    const rows = ackRows(people, acks, 'author')
    expect(rows.map((r) => [r.id, Boolean(r.ackAt)])).toEqual([['b', true], ['d', true], ['c', false]])
    expect(rows[0]).toMatchObject({ name: 'Bina', email: 'b@x.in', ackAt: '2026-10-01T05:00:00.000Z' })
  })

  it('re-notifies only the audience members who have not acknowledged (never the author)', () => {
    expect(pendingAckIds(['author', 'b', 'c', 'd', 'c'], acks, 'author')).toEqual(['c'])
    expect(pendingAckIds(['b', 'd'], acks, 'author')).toEqual([])
  })

  it('records an acknowledgement once, without mutating', () => {
    const now = new Date('2026-10-05T00:00:00Z')
    const once = withAck(acks, 'c', now)
    expect(once).toHaveLength(3)
    expect(withAck(once, 'c', now)).toHaveLength(3)
    expect(acks).toHaveLength(2)
  })

  it('allows a reminder at most once an hour', () => {
    const now = new Date('2026-10-05T10:00:00Z')
    expect(nextReminderAt(null, now)).toBeNull()
    expect(nextReminderAt(new Date(now.getTime() - ACK_REMIND_GAP_MS - 1), now)).toBeNull()
    expect(nextReminderAt(new Date(now.getTime() - 10 * 60_000), now)?.toISOString()).toBe('2026-10-05T10:50:00.000Z')
  })

  it('exports a formula-safe CSV', () => {
    const csv = acksCsv([{ id: 'x', name: '=HYPERLINK("bad")', email: '', ackAt: null }, { id: 'y', name: 'Ravi, Jr', email: 'r@x.in', ackAt: '2026-10-01T05:00:00.000Z' }])
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('Name,Email,Status,Acknowledged at (UTC)')
    expect(lines[1]).toBe(`"'=HYPERLINK(""bad"")",,Pending,`)
    expect(lines[2]).toBe('"Ravi, Jr",r@x.in,Acknowledged,2026-10-01T05:00:00.000Z')
  })
})
