import { Types } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }))
vi.mock('@/lib/env', async (orig) => ({ ...(await orig<typeof import('@/lib/env')>()), appUrl: (p = '') => `https://app.test${p}` }))
vi.mock('./lookups', () => ({ planLookups: () => ({}) }))

const executed: string[] = []
const exec = (model: string) => vi.fn(async (_ctx: unknown, p: Record<string, unknown>) => {
  executed.push(`${model}:${String(p.title ?? p.leadId ?? p.companyName ?? '')}`)
  if (p.title === 'Boom') throw new (await import('@/lib/errors')).UserError('Assignee left the workspace')
  const id = new Types.ObjectId()
  return { model, id: String(id), label: String(p.title ?? p.companyName ?? model), link: `https://app.test/x/${id}`, action: 'created', created: [{ model, ids: [id] }], restore: p.restoreDoc ? [{ model, docs: [p.restoreDoc] }] : [] }
})
vi.mock('../apply/work', () => ({ createTaskMcp: exec('Task'), updateTaskMcp: exec('Task'), commentTaskMcp: exec('TaskComment') }))
vi.mock('../apply/orbit', () => ({ upsertLeadMcp: exec('Lead'), logActivityMcp: exec('Activity'), scheduleFollowupMcp: exec('Activity'), moveDealMcp: exec('Deal') }))
vi.mock('../apply/folio', () => ({ draftInvoiceMcp: exec('Invoice'), draftQuoteMcp: exec('Quote') }))
const undoCalls: unknown[] = []
vi.mock('@/modules/imports/batch-store', () => ({
  mongoUndoStore: {
    deleteIds: async (model: string, _org: unknown, ids: unknown[]) => {
      undoCalls.push({ model, ids: ids.length })
      return model === 'Invoice' ? 0 : ids.length
    },
    replaceDocs: async (_m: string, _o: unknown, docs: unknown[]) => docs.length,
  },
}))

type Row = Record<string, unknown> & { _id: Types.ObjectId }
const tables = new Map<string, Row[]>()
const table = (name: string) => tables.get(name) ?? (tables.set(name, []), tables.get(name)!)
const matches = (row: Row, filter: Record<string, unknown>) =>
  Object.entries(filter).every(([k, v]) => {
    const value = row[k]
    if (v === null) return value == null
    if (v && typeof v === 'object' && '$ne' in (v as object)) return String(value) !== String((v as { $ne: unknown }).$ne)
    return String(value) === String(v)
  })
function fakeModel(name: string) {
  const rows = () => table(name)
  return {
    findOne: (f: Record<string, unknown>) => ({ lean: async () => rows().find((r) => matches(r, f)) ?? null }),
    findById: (id: unknown) => ({ lean: async () => rows().find((r) => String(r._id) === String(id)) ?? null }),
    create: async (doc: Record<string, unknown>) => {
      if (name === 'McpIdempotency' && rows().some((r) => r.key === doc.key)) throw Object.assign(new Error('dup'), { code: 11000 })
      const row = { _id: new Types.ObjectId(), status: name === 'ImportBatch' ? 'done' : undefined, createdAt: new Date(), ...doc } as Row
      rows().push(row)
      return row
    },
    updateOne: async (f: Record<string, unknown>, u: { $set: Record<string, unknown> }) => {
      const row = rows().find((r) => matches(r, f))
      if (!row) return { modifiedCount: 0, matchedCount: 0 }
      Object.assign(row, u.$set)
      return { modifiedCount: 1, matchedCount: 1 }
    },
    deleteMany: async (f: Record<string, unknown>) => {
      const keep = rows().filter((r) => !matches(r, f))
      tables.set(name, keep)
    },
  }
}

function session() {
  const ctx = {
    orgId: new Types.ObjectId(), userId: new Types.ObjectId(), memberId: new Types.ObjectId(),
    user: { name: 'Sanskaar via Claude' },
    can: () => true, has: () => true, assertWritable: () => undefined,
    entitlements: { readOnly: false, readOnlyMessage: '' },
    db: (model: { modelName: string }) => fakeModel(model.modelName),
  }
  return { ctx, scopes: ['work.read', 'work.write', 'orbit.write', 'folio.draft'], clientName: 'Claude', grantId: String(new Types.ObjectId()), personName: 'Sanskaar' }
}

function storePlan(s: ReturnType<typeof session>, items: Record<string, unknown>[], minutesLeft = 20) {
  const planId = `pln_${Math.random().toString(36).slice(2)}`
  table('McpPlan').push({ _id: new Types.ObjectId(), planId, grantId: new Types.ObjectId(s.grantId), memberId: s.ctx.memberId, clientName: 'Claude', source: { kind: 'slack', ref: '#design' }, items, expiresAt: new Date(Date.now() + minutesLeft * 60_000), appliedAt: null })
  return planId
}
const item = (index: number, op: string, status: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ index, op, status, summary: `${op} ${index}`, notes: [], payload, idempotencyKey: `k${index}`, already: null, ...extra })

beforeEach(() => {
  tables.clear()
  executed.length = 0
  undoCalls.length = 0
})

describe('apply: one batch', () => {
  it('runs ok items, runs confirm items only when confirmed, never refused ones, and records one batch', async () => {
    const { applyPlan } = await import('./run')
    const { memoryLimitStore } = await import('../limits')
    const s = session()
    const planId = storePlan(s, [
      item(0, 'create_task', 'ok', { title: 'Banner' }),
      item(1, 'create_task', 'confirm', { title: 'Maybe dupe' }),
      item(2, 'record_payment', 'refused', {}),
      item(3, 'draft_invoice', 'confirm', { title: 'Invoice' }),
    ])
    const res = await applyPlan(s as never, planId, [3], memoryLimitStore())
    expect(executed).toEqual(['Task:Banner', 'Invoice:Invoice'])
    expect(res).toMatchObject({ applied: 2, skipped: 2, failed: 0 })
    const batches = table('ImportBatch')
    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({ kind: 'mcp', source: 'mcp', clientName: 'Claude', actorName: 'Sanskaar via Claude', imported: 2 })
    expect((batches[0].created as { model: string }[]).map((g) => g.model).sort()).toEqual(['Invoice', 'Task'])
  })

  it('wires a lead added earlier in the plan into later changes', async () => {
    const { applyPlan } = await import('./run')
    const { memoryLimitStore } = await import('../limits')
    const s = session()
    const planId = storePlan(s, [item(0, 'upsert_lead', 'ok', { companyName: 'Nimbus' }), item(1, 'log_activity', 'ok', { leadId: 'pending:0', notes: 'Intro' })])
    await applyPlan(s as never, planId, [], memoryLimitStore())
    expect(executed[1]).toMatch(/^Activity:[a-f0-9]{24}$/)
  })

  it('keeps going when one change fails and reports it', async () => {
    const { applyPlan } = await import('./run')
    const { memoryLimitStore } = await import('../limits')
    const s = session()
    const planId = storePlan(s, [item(0, 'create_task', 'ok', { title: 'Boom' }), item(1, 'create_task', 'ok', { title: 'Fine' })])
    const res = await applyPlan(s as never, planId, [], memoryLimitStore())
    expect(res.failed).toBe(1)
    expect(res.lines[0]).toMatchObject({ status: 'failed', error: 'Assignee left the workspace' })
    expect(res.applied).toBe(1)
  })

  it('lets a plan in which every change failed be applied again (QA 10.3)', async () => {
    const { applyPlan } = await import('./run')
    const { memoryLimitStore } = await import('../limits')
    const s = session()
    const planId = storePlan(s, [item(0, 'create_task', 'ok', { title: 'Boom' })])
    const first = await applyPlan(s as never, planId, [], memoryLimitStore())
    expect(first).toMatchObject({ applied: 0, failed: 1, undo: 'Nothing was changed.' })
    const again = await applyPlan(s as never, planId, [], memoryLimitStore())
    expect(again.failed).toBe(1)
  })

  it('refuses expired, foreign and already-applied plans', async () => {
    const { applyPlan } = await import('./run')
    const { memoryLimitStore } = await import('../limits')
    const s = session()
    const old = storePlan(s, [item(0, 'create_task', 'ok', { title: 'A' })], -1)
    await expect(applyPlan(s as never, old, [], memoryLimitStore())).rejects.toThrow(/expired/)
    const planId = storePlan(s, [item(0, 'create_task', 'ok', { title: 'A' })])
    const other = { ...session(), ctx: { ...s.ctx, memberId: new Types.ObjectId() } }
    await expect(applyPlan(other as never, planId, [], memoryLimitStore())).rejects.toThrow(/another connection/)
    await applyPlan(s as never, planId, [], memoryLimitStore())
    await expect(applyPlan(s as never, planId, [], memoryLimitStore())).rejects.toThrow(/already applied/)
  })

  it('stores idempotency keys so the same source is skipped next time', async () => {
    const { applyPlan } = await import('./run')
    const { memoryLimitStore } = await import('../limits')
    const s = session()
    const planId = storePlan(s, [item(0, 'create_task', 'ok', { title: 'Banner' })])
    await applyPlan(s as never, planId, [], memoryLimitStore())
    expect(table('McpIdempotency')).toHaveLength(1)
    expect(table('McpIdempotency')[0]).toMatchObject({ key: 'k0', model: 'Task' })
    const again = storePlan(s, [item(0, 'create_task', 'ok', { title: 'Banner' }, { already: { label: 'Banner', link: 'x' } })])
    const res = await applyPlan(s as never, again, [], memoryLimitStore())
    expect(res.applied).toBe(0)
    expect(executed).toEqual(['Task:Banner'])
  })

  it('stops at the daily write cap before changing anything', async () => {
    const { applyPlan } = await import('./run')
    const { MCP_LIMITS } = await import('../limits')
    const s = session()
    const planId = storePlan(s, [item(0, 'create_task', 'ok', { title: 'A' })])
    const full = { hit: async () => ({ ok: true, retryAfterSeconds: 0 }), take: async () => false }
    await expect(applyPlan(s as never, planId, [], full)).rejects.toThrow(String(MCP_LIMITS.dailyWritesPerWorkspace))
    expect(executed).toEqual([])
    // The plan can be applied later.
    expect(table('McpPlan')[0].appliedAt).toBeNull()
  })
})

describe('undo', () => {
  it('undoes a batch once, within 7 days, frees its idempotency keys and reports drafts it kept', async () => {
    const { applyPlan, undoMcpBatch } = await import('./run')
    const { memoryLimitStore } = await import('../limits')
    const s = session()
    const planId = storePlan(s, [item(0, 'create_task', 'ok', { title: 'Banner' }), item(1, 'draft_invoice', 'ok', { title: 'Inv' })])
    const res = await applyPlan(s as never, planId, [], memoryLimitStore())
    const result = await undoMcpBatch(s.ctx as never, res.batch_id!, 'Sanskaar')
    expect(result).toMatchObject({ removed: 1, kept: 1 })
    expect(table('McpIdempotency')).toHaveLength(0)
    await expect(undoMcpBatch(s.ctx as never, res.batch_id!, 'Sanskaar')).rejects.toThrow(/already undone/)
  })

  it('refuses batches older than 7 days and other people’s batches', async () => {
    const { applyPlan, undoMcpBatch } = await import('./run')
    const { memoryLimitStore } = await import('../limits')
    const s = session()
    const res = await applyPlan(s as never, storePlan(s, [item(0, 'create_task', 'ok', { title: 'Banner' })]), [], memoryLimitStore())
    await expect(undoMcpBatch(s.ctx as never, res.batch_id!, 'X', { onlyMemberUserId: new Types.ObjectId() })).rejects.toThrow(/Only the person/)
    table('ImportBatch')[0].undoUntil = new Date(Date.now() - 1000)
    await expect(undoMcpBatch(s.ctx as never, res.batch_id!, 'X')).rejects.toThrow(/7 days/)
  })
})
