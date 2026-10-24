import { Types } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }))
vi.mock('@/models/AttendanceDay', () => ({ AttendanceDay: { name: 'AttendanceDay' } }))
vi.mock('@/models/Member', () => ({ Member: { name: 'Member' } }))
vi.mock('@/models/muster/Employee', () => ({ Employee: { name: 'Employee' } }))
const users: { _id: Types.ObjectId; email: string; name: string }[] = []
vi.mock('@/models/User', () => ({
  User: { find: (q: { _id: { $in: Types.ObjectId[] }; email?: { $in: string[] } }) => ({ lean: async () => users.filter((u) => q._id.$in.some((id) => String(id) === String(u._id)) && (!q.email || q.email.$in.includes(u.email))) }) },
}))
vi.mock('./scope', () => ({ visibleEmployeeIds: async () => null, visibleFilter: () => ({}), ownEmployeeId: () => null, mayDecideOwn: (ctx: { owner?: boolean }) => Boolean(ctx.owner) }))

const { linkChosen, loginLinkPlan } = await import('./login-links')

type Row = Record<string, unknown> & { _id: Types.ObjectId }
const id = () => new Types.ObjectId()

/** Rows per model, a filter good enough for the queries under test, and a log of writes. */
function fakeDb(rows: { Employee: Row[]; Member: Row[] }) {
  const writes: { model: string; filter: unknown; update: unknown }[] = []
  const matches = (row: Row, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, want]) => {
      const have = row[key]
      if (key === 'status' && want && typeof want === 'object' && '$in' in want) return (want.$in as unknown[]).includes(have)
      if (key === '_id' && want && typeof want === 'object' && '$in' in want) return (want.$in as Types.ObjectId[]).some((w) => String(w) === String(have))
      if (want === null) return have == null
      return String(have) === String(want)
    })
  const db = (model: { name: string }) => {
    const list = model.name === 'Employee' ? rows.Employee : model.name === 'Member' ? rows.Member : []
    const find = (filter: Record<string, unknown>) => {
      const found = list.filter((r) => matches(r, filter))
      return { sort: () => ({ lean: async () => found }), lean: async () => found }
    }
    return {
      find,
      updateOne: async (filter: Record<string, unknown>, update: unknown) => {
        writes.push({ model: model.name, filter, update })
        const row = list.find((r) => matches(r, filter))
        const set = (update as { $set?: Record<string, unknown> }).$set
        if (row && set) Object.assign(row, set)
      },
      updateMany: async (filter: unknown, update: unknown) => {
        writes.push({ model: model.name, filter, update })
      },
    }
  }
  return { db, writes }
}

describe('Link logins', () => {
  let asha: Row, ravi: Row, kiran: Row, ashaLogin: Row, raviLogin: Row, strayLogin: Row
  beforeEach(() => {
    users.length = 0
    const [ashaUser, raviUser, strayUser] = [id(), id(), id()]
    users.push({ _id: ashaUser, email: 'asha@vistaar.in', name: 'Asha Verma' }, { _id: raviUser, email: 'ravi@vistaar.in', name: 'Ravi Kumar' }, { _id: strayUser, email: 'owner@gmail.com', name: 'Owner' })
    asha = { _id: id(), fullName: 'Asha Verma', code: 'VW-1', workEmailLower: 'asha@vistaar.in', status: 'active', deletedAt: null, memberId: null }
    ravi = { _id: id(), fullName: 'Ravi Kumar', code: 'VW-2', workEmailLower: 'ravi@vistaar.in', status: 'probation', deletedAt: null, memberId: null }
    kiran = { _id: id(), fullName: 'Kiran Rao', code: 'VW-3', workEmailLower: 'kiran@vistaar.in', status: 'active', deletedAt: null, memberId: null }
    ashaLogin = { _id: id(), userId: ashaUser, status: 'active', employeeId: null }
    raviLogin = { _id: id(), userId: raviUser, status: 'invited', employeeId: null }
    strayLogin = { _id: id(), userId: strayUser, status: 'active', employeeId: null }
  })
  const ctxFor = (db: ReturnType<typeof fakeDb>['db'], viewer = 'hr@vistaar.in', owner = false) => ({ db, user: { email: viewer }, owner }) as never

  it('pairs employees and logins by work email, and lists what is left on each side', async () => {
    const { db } = fakeDb({ Employee: [asha, ravi, kiran], Member: [ashaLogin, raviLogin, strayLogin] })
    const plan = await loginLinkPlan(ctxFor(db))
    expect(plan.matches.map((m) => [m.name, m.email, m.invited, m.own])).toEqual([
      ['Asha Verma', 'asha@vistaar.in', false, false],
      ['Ravi Kumar', 'ravi@vistaar.in', true, false],
    ])
    expect(plan.withoutLogin.map((e) => e.name)).toEqual(['Kiran Rao'])
    expect(plan.withoutEmployee).toEqual([{ name: 'Owner', email: 'owner@gmail.com', invited: false }])
  })

  it("marks the viewer's own record, which they cannot link unless they may decide their own matters", async () => {
    const { db } = fakeDb({ Employee: [asha], Member: [ashaLogin] })
    expect((await loginLinkPlan(ctxFor(db, 'asha@vistaar.in'))).matches[0].own).toBe(true)
    expect((await loginLinkPlan(ctxFor(db, 'asha@vistaar.in', true))).matches[0].own).toBe(false)
  })

  it('links only fresh matches that were ticked, both ways, and moves past check-ins over', async () => {
    const { db, writes } = fakeDb({ Employee: [asha, ravi, kiran], Member: [ashaLogin, raviLogin, strayLogin] })
    const result = await linkChosen(ctxFor(db), [String(asha._id), String(kiran._id)])
    expect(result).toEqual({ linked: 1, skipped: 1 })
    expect(asha.memberId).toEqual(ashaLogin._id)
    expect(ashaLogin.employeeId).toEqual(asha._id)
    expect(ravi.memberId).toBeNull()
    expect(writes.some((w) => w.model === 'AttendanceDay' && String((w.filter as { memberId: unknown }).memberId) === String(ashaLogin._id))).toBe(true)
  })

  it("never links someone's own record through the bulk button", async () => {
    const { db } = fakeDb({ Employee: [asha], Member: [ashaLogin] })
    expect(await linkChosen(ctxFor(db, 'asha@vistaar.in'), [String(asha._id)])).toEqual({ linked: 0, skipped: 1 })
    expect(asha.memberId).toBeNull()
  })
})
