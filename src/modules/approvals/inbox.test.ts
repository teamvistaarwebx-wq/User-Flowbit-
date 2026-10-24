import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Permission, ProductKey } from '@/lib/catalog'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/notify', () => ({ notify: vi.fn(), notifyMembers: vi.fn(), userIdsWithPermission: vi.fn() }))
vi.mock('@/models/Member', () => ({ Member: 'Member' }))
vi.mock('@/models/Role', () => ({ Role: { find: () => ({ lean: async () => [] }) } }))
const userFind = vi.fn()
vi.mock('@/models/User', () => ({ User: { find: (...args: unknown[]) => userFind(...args) } }))
vi.mock('@/models/muster/AttendanceCorrection', () => ({ AttendanceCorrection: 'AttendanceCorrection' }))
vi.mock('@/models/muster/BankChangeRequest', () => ({ BankChangeRequest: 'BankChangeRequest' }))
vi.mock('@/models/muster/Claim', () => ({ Claim: 'Claim' }))
vi.mock('@/models/muster/CompOff', () => ({ CompOff: 'CompOff' }))
vi.mock('@/models/muster/Employee', () => ({ Employee: 'Employee' }))
vi.mock('@/models/muster/LeaveRequest', () => ({ LeaveRequest: 'LeaveRequest' }))
vi.mock('@/models/work/Timesheet', () => ({ Timesheet: 'Timesheet' }))
vi.mock('@/models/work/TimeEntry', () => ({ TimeEntry: 'TimeEntry' }))
vi.mock('@/modules/work/teams/people', () => ({ peopleMap: vi.fn(), nameOf: vi.fn() }))
vi.mock('@/modules/work/time/targets', () => ({ labelTargets: vi.fn(), targetKeyOf: vi.fn() }))

const EMP = '650000000000000000000001'
const MGR = '650000000000000000000002'
const ME = '650000000000000000000003'

const LEAVE = (id: string, over: Record<string, unknown>) => ({
  _id: id, employeeId: EMP, managerId: MGR, stages: ['manager', 'hr'], completedStages: [], status: 'pending',
  leaveName: 'Casual leave', startDate: '2026-10-20', endDate: '2026-10-21', dayCount: 2, createdAt: new Date('2026-10-10'), ...over,
})

type Rows = Partial<Record<string, Record<string, unknown>[]>>
type Call = { model: string; op: string; filter: Record<string, unknown> }

/** A ctx whose ctx.db(model) answers from `rows` and records every read (the tenant boundary). */
function fakeCtx(opts: { perms: Permission[]; products?: ProductKey[]; employeeId?: string | null; memberId?: string; rows?: Rows }) {
  const calls: Call[] = []
  const rows = opts.rows ?? {}
  const query = (model: string, op: string, filter: Record<string, unknown>) => {
    calls.push({ model, op, filter })
    const ids = (filter._id as { $in?: unknown[] } | undefined)?.$in?.map(String)
    const result = (rows[model] ?? []).filter((r) => !ids || ids.includes(String(r._id)))
    const chain = { sort: () => chain, limit: () => chain, lean: async () => result }
    return chain
  }
  const db = (model: string) => ({
    find: (filter: Record<string, unknown>) => query(model, 'find', filter),
    countDocuments: async (filter: Record<string, unknown>) => {
      calls.push({ model, op: 'count', filter })
      return (rows[model] ?? []).length
    },
  })
  const products = opts.products ?? ['work', 'muster']
  const ctx = {
    orgId: 'org-1',
    memberId: opts.memberId ?? 'm-me',
    member: { employeeId: opts.employeeId ?? null },
    db,
    has: (p: ProductKey) => products.includes(p),
    can: (p: Permission) => opts.perms.includes(p),
    canAny: (...ps: Permission[]) => ps.some((p) => opts.perms.includes(p)),
  }
  return { ctx: ctx as never, calls }
}

const HR: Permission[] = ['leave.read', 'leave.approve', 'attendance.approve', 'people.read_all', 'claims.review', 'people.read_sensitive']

describe('approvals inbox', () => {
  beforeEach(() => userFind.mockReset().mockReturnValue({ lean: async () => [{ _id: 'u-1', name: 'Asha Rao' }] }))

  it('shows a member with no approving permission nothing, and reads nothing', async () => {
    const { approvalsInbox, visibleQueues } = await import('./inbox')
    const { ctx, calls } = fakeCtx({ perms: ['leave.read', 'time.write'], employeeId: ME })
    expect(visibleQueues(ctx)).toEqual([])
    expect(await approvalsInbox(ctx)).toEqual([])
    expect(calls).toEqual([])
  })

  it('gives HR every Muster queue, with requests at the HR stage and not those still with a manager', async () => {
    const { approvalsInbox } = await import('./inbox')
    const rows: Rows = {
      LeaveRequest: [LEAVE('l-hr', { completedStages: ['manager'] }), LEAVE('l-mgr', {})],
      Employee: [{ _id: EMP, fullName: 'Ravi Kumar', managerId: MGR }, { _id: MGR, fullName: 'Meera Shah', memberId: 'm-mgr' }],
      Member: [{ _id: 'm-mgr', role: 'manager', status: 'active' }],
      Claim: [{ _id: 'c-1', employeeId: EMP, amountClaimed: 125_000, purpose: 'Client visit', createdAt: new Date('2026-10-09') }],
    }
    const { ctx, calls } = fakeCtx({ perms: HR, products: ['muster'], rows })
    const groups = await approvalsInbox(ctx)
    expect(groups.map((g) => g.kind)).toEqual(['leave', 'correction', 'comp_off', 'claim', 'bank_change'])
    const leave = groups.find((g) => g.kind === 'leave')!
    expect(leave.items.map((i) => i.id)).toEqual(['l-hr'])
    expect(leave.items[0]).toMatchObject({ who: 'Ravi Kumar', href: '/app/hr/leave' })
    expect(groups.find((g) => g.kind === 'claim')).toMatchObject({ total: 1, items: [{ who: 'Ravi Kumar', href: '/app/hr/claims' }] })
    // HR reads every pending leave request; the Work queue is not read without Work.
    expect(calls.find((c) => c.model === 'LeaveRequest')?.filter).toEqual({ status: 'pending' })
    expect(calls.some((c) => c.model === 'Timesheet')).toBe(false)
  })

  it("gives a reporting manager only their direct reports' requests at the manager stage", async () => {
    const { approvalsInbox } = await import('./inbox')
    const rows: Rows = {
      LeaveRequest: [LEAVE('l-mgr', {}), LEAVE('l-hr', { completedStages: ['manager'] })],
      Employee: [{ _id: EMP, fullName: 'Ravi Kumar', managerId: MGR }, { _id: MGR, fullName: 'Meera Shah', memberId: 'm-me' }],
      Member: [{ _id: 'm-me', role: 'manager', status: 'active' }],
    }
    const { ctx, calls } = fakeCtx({ perms: ['leave.read', 'leave.approve'], employeeId: MGR, rows })
    const groups = await approvalsInbox(ctx)
    expect(groups.map((g) => g.kind)).toEqual(['leave'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['l-mgr'])
    expect(calls.find((c) => c.model === 'LeaveRequest')?.filter).toEqual({ status: 'pending', managerId: MGR })
  })

  it('never lists the approver their own claim unless they may decide their own', async () => {
    const { approvalsInbox } = await import('./inbox')
    const { ctx, calls } = fakeCtx({ perms: ['claims.review', 'people.read_all'], employeeId: ME, rows: {} })
    await approvalsInbox(ctx)
    expect(calls.find((c) => c.model === 'Claim')?.filter).toMatchObject({ $nor: [{ employeeId: ME }] })
  })

  it('routes timesheets to the approver they were sent to, never their own', async () => {
    const { approvalsInbox } = await import('./inbox')
    const rows: Rows = { Timesheet: [{ _id: 't-1', memberId: 'm-emp', weekStart: '2026-10-05', totalMinutes: 2_400, submittedAt: new Date('2026-10-10') }], Member: [{ _id: 'm-emp', userId: 'u-1' }] }
    const { ctx, calls } = fakeCtx({ perms: ['time.approve'], products: ['work'], memberId: 'm-boss', rows })
    const [group] = await approvalsInbox(ctx)
    expect(group).toMatchObject({ kind: 'timesheet', total: 1, items: [{ who: 'Asha Rao', what: 'Week of 5 Oct 2026 · 40 h' }] })
    expect(calls.find((c) => c.model === 'Timesheet')?.filter).toEqual({ status: 'submitted', memberId: { $ne: 'm-boss' }, approverId: 'm-boss' })
  })

  it('reads workspace data only through ctx.db (tenant-scoped); users are looked up by the ids it returned', async () => {
    const { approvalsInbox } = await import('./inbox')
    const rows: Rows = { Timesheet: [{ _id: 't-1', memberId: 'm-emp', weekStart: '2026-10-05', totalMinutes: 60 }], Member: [{ _id: 'm-emp', userId: 'u-1' }] }
    const { ctx, calls } = fakeCtx({ perms: [...HR, 'time.approve', 'org.manage'], rows })
    await approvalsInbox(ctx)
    expect(new Set(calls.map((c) => c.model))).toEqual(new Set(['LeaveRequest', 'AttendanceCorrection', 'CompOff', 'Claim', 'BankChangeRequest', 'Timesheet', 'Member']))
    expect(userFind).toHaveBeenCalledWith({ _id: { $in: ['u-1'] } }, { name: 1 })
  })
})
