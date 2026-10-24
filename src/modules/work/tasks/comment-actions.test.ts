import { Types } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => ({
  scheduled: [] as (() => Promise<void>)[],
  revalidated: [] as [string, string | undefined][],
  notify: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
  watchers: vi.fn(async () => ({})),
  created: [] as Record<string, unknown>[],
  ctx: null as unknown,
}))

vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => h.scheduled.push(fn) }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string, type?: string) => h.revalidated.push([path, type]) }))
vi.mock('@/lib/ctx', () => ({ getCtx: async () => h.ctx, isBlocked: () => false }))
vi.mock('./viewer', () => ({ getViewer: async () => ({}) }))
vi.mock('./notify', () => ({ notifyComment: h.notify }))
vi.mock('./activity-log', () => ({ logActivity: h.logActivity }))

const { Task } = await import('@/models/work/Task')
const { TaskComment } = await import('@/models/work/TaskComment')
const { Member } = await import('@/models/Member')

const taskId = new Types.ObjectId()
const memberId = new Types.ObjectId()
const mentioned = new Types.ObjectId()
const task = { _id: taskId, title: 'Homepage copy', projectId: null }

vi.mock('./load', () => ({ requireTask: async () => task }))

function fakeCtx() {
  const models = new Map<unknown, unknown>([
    [Task, { updateOne: h.watchers }],
    [TaskComment, { create: async (doc: Record<string, unknown>) => { h.created.push(doc); return { _id: new Types.ObjectId(), ...doc } }, findOne: () => ({ lean: async () => null }) }],
    [Member, { find: () => ({ lean: async () => [{ _id: mentioned }] }) }],
  ])
  return { memberId, user: { name: 'Asha' }, db: (model: unknown) => models.get(model), assertProduct: () => {}, assert: () => {}, can: () => true, hasFeature: () => true, assertWritable: () => {} }
}

const { addComment } = await import('./comment-actions')

beforeEach(() => {
  h.scheduled.length = 0
  h.revalidated.length = 0
  h.created.length = 0
  h.notify.mockReset().mockResolvedValue(undefined)
  h.logActivity.mockReset().mockResolvedValue(undefined)
  h.watchers.mockReset().mockResolvedValue({})
  h.ctx = fakeCtx()
})

describe('addComment', () => {
  it('saves the comment and answers before any side effect runs', async () => {
    const result = await addComment({ taskId: String(taskId), body: 'Looks good @Ravi', mentionIds: [String(mentioned)] })
    expect(result.ok).toBe(true)
    expect(result.ok && result.data?.id).toMatch(/^[0-9a-f]{24}$/)
    expect(h.created).toHaveLength(1)
    expect(h.created[0]).toMatchObject({ body: 'Looks good @Ravi', mentionIds: [mentioned] })
    expect(h.notify).not.toHaveBeenCalled()
    expect(h.logActivity).not.toHaveBeenCalled()
    expect(h.watchers).not.toHaveBeenCalled()
    expect(h.scheduled).toHaveLength(1)
  })

  it('refreshes only the task page, not the whole /app layout', async () => {
    await addComment({ taskId: String(taskId), body: 'Hi' })
    expect(h.revalidated).toEqual([[`/app/work/tasks/${taskId}`, undefined]])
  })

  it('still notifies, logs activity and adds watchers after the response', async () => {
    await addComment({ taskId: String(taskId), body: 'Ping @Ravi', mentionIds: [String(mentioned)] })
    await h.scheduled[0]()
    expect(h.watchers).toHaveBeenCalledWith({ _id: taskId }, { $addToSet: { watcherIds: { $each: [memberId, mentioned] } } })
    expect(h.logActivity).toHaveBeenCalledWith(h.ctx, [expect.objectContaining({ type: 'comment_added', taskId })])
    expect(h.notify).toHaveBeenCalledWith(h.ctx, task, expect.objectContaining({ body: 'Ping @Ravi', mentionIds: [mentioned] }))
  })

  it('a failing notification neither fails the comment nor stops the other effects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.notify.mockRejectedValue(new Error('mail down'))
    const result = await addComment({ taskId: String(taskId), body: 'Hi' })
    expect(result.ok).toBe(true)
    await expect(h.scheduled[0]()).resolves.toBeUndefined()
    expect(h.logActivity).toHaveBeenCalledOnce()
    expect(h.watchers).toHaveBeenCalledOnce()
  })

  it('refuses an empty comment without saving or scheduling anything', async () => {
    const result = await addComment({ taskId: String(taskId), body: '   ' })
    expect(result.ok).toBe(false)
    expect(h.created).toHaveLength(0)
    expect(h.scheduled).toHaveLength(0)
  })
})
