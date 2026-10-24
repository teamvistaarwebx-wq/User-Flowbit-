import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signHeader } from '@/modules/webhooks/sign'
import { replayKeyOf, senderTimestamp, staleRefusal } from './inbound-replay'

vi.mock('server-only', () => ({}))
const replays = new Map<string, { key: string; recordId: string | null }>()
const created: Record<string, unknown>[] = []
const fakeDb = (model: { name?: string; modelName?: string }) => {
  const name = model.modelName ?? model.name
  if (name === 'InboundReplay')
    return {
      create: async (doc: { key: string }) => {
        if (replays.has(doc.key)) throw Object.assign(new Error('dup'), { code: 11000 })
        replays.set(doc.key, { key: doc.key, recordId: null })
      },
      findOne: (f: { key: string }) => ({ lean: async () => replays.get(f.key) ?? null }),
      updateOne: async (f: { key: string }, u: { $set: { recordId: string } }) => void Object.assign(replays.get(f.key) ?? {}, u.$set),
      deleteOne: async (f: { key: string }) => void replays.delete(f.key),
    }
  return { findOne: () => ({ lean: async () => null }) }
}
vi.mock('@/models/integrations/InboundReplay', () => ({ InboundReplay: { modelName: 'InboundReplay' } }))
vi.mock('@/models/mcp/McpIdempotency', () => ({ McpIdempotency: { modelName: 'McpIdempotency' } }))
vi.mock('@/models/Member', () => ({ Member: { modelName: 'Member' } }))
vi.mock('@/models/User', () => ({ User: { findOne: () => ({ lean: async () => null }) } }))
vi.mock('./ctx', () => ({ connectorCtx: async () => ({ has: () => true, entitlements: { readOnly: false }, db: fakeDb }) }))
vi.mock('@/modules/work/tasks/viewer', () => ({ getViewer: async () => ({}) }))
const createTask = vi.fn(async (_c: unknown, _v: unknown, input: Record<string, unknown>) => {
  created.push(input)
  return { _id: `t${created.length}`, title: input.title }
})
vi.mock('@/modules/work/tasks/create', () => ({ createTaskRecord: (...a: [unknown, unknown, Record<string, unknown>]) => createTask(...a) }))

const headers = (h: Record<string, string> = {}) => ({ get: (n: string) => h[n.toLowerCase()] ?? null })
const ORG = 'aaaaaaaaaaaaaaaaaaaaaaaa' as never

describe('inbound task webhook replay protection (L11)', () => {
  beforeEach(() => {
    replays.clear()
    created.length = 0
    createTask.mockClear()
  })

  it('reads the timestamp from its header or a t=…,v1=… signature, and refuses stale ones', () => {
    const now = 1_760_000_000
    expect(senderTimestamp(headers())).toBeNull()
    expect(senderTimestamp(headers({ 'x-flowbit-timestamp': String(now) }))).toBe(now)
    expect(senderTimestamp(headers({ 'x-flowbit-signature': signHeader('k', '{}', now) }))).toBe(now)
    expect(staleRefusal(headers({ 'x-flowbit-timestamp': String(now - 301) }), now)).toMatch(/older than 5 minutes/)
    expect(staleRefusal(headers({ 'x-flowbit-timestamp': String(now - 60) }), now)).toBeNull()
    expect(staleRefusal(headers({ 'x-flowbit-timestamp': 'yesterday' }), now)).toMatch(/not a number/)
    expect(staleRefusal(headers(), now)).toBeNull()
  })

  it('keys a request by id, then nonce, then the body hash', () => {
    expect(replayKeyOf('{"a":1}', headers({ 'idempotency-key': 'n1' }), 'r1').key).toBe('id:r1')
    expect(replayKeyOf('{"a":1}', headers({ 'idempotency-key': 'n1' }), undefined).key).toBe('nonce:n1')
    expect(replayKeyOf('{"a":1}', headers(), undefined).key).toMatch(/^body:[0-9a-f]{64}$/)
    expect(replayKeyOf('{"a":1}', headers(), undefined).key).not.toBe(replayKeyOf('{"a":2}', headers(), undefined).key)
  })

  it('a replayed body without an id makes one task, even when both copies arrive at once', async () => {
    const { createInboundTask } = await import('./inbound-task')
    const raw = JSON.stringify({ type: 'task', title: 'Call Asha' })
    const body = JSON.parse(raw)
    const [a, b] = await Promise.all([createInboundTask(ORG, body, { raw, headers: headers() }), createInboundTask(ORG, body, { raw, headers: headers() })])
    expect([a.status, b.status].sort()).toEqual(['created', 'duplicate'])
    expect(createTask).toHaveBeenCalledTimes(1)
    expect(await createInboundTask(ORG, body, { raw, headers: headers() })).toEqual({ status: 'duplicate', taskId: 't1' })
  })

  it('refuses a stale timestamp before doing anything, and frees the key when the task fails', async () => {
    const { createInboundTask } = await import('./inbound-task')
    const raw = JSON.stringify({ type: 'task', title: 'Old', id: 'r9' })
    expect(await createInboundTask(ORG, JSON.parse(raw), { raw, headers: headers({ 'x-flowbit-timestamp': '1000' }) })).toMatchObject({ status: 'stale' })
    createTask.mockRejectedValueOnce(new Error('db down'))
    await expect(createInboundTask(ORG, JSON.parse(raw), { raw, headers: headers() })).rejects.toThrow(/db down/)
    expect(await createInboundTask(ORG, JSON.parse(raw), { raw, headers: headers() })).toMatchObject({ status: 'created' })
  })
})
