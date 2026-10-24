import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const models = vi.hoisted(() => ({ Sequence: { name: 'Sequence' }, Lead: { name: 'Lead' }, SequenceEnrollment: { name: 'SequenceEnrollment' }, Activity: { name: 'Activity' }, Suppression: { name: 'Suppression' }, Org: { name: 'Org' } }))
vi.mock('@/models/orbit/Sequence', () => ({ Sequence: models.Sequence }))
vi.mock('@/models/orbit/Lead', () => ({ Lead: models.Lead }))
vi.mock('@/models/orbit/SequenceEnrollment', () => ({ SequenceEnrollment: models.SequenceEnrollment }))
vi.mock('@/models/orbit/Activity', () => ({ Activity: models.Activity }))
vi.mock('@/models/messaging/Suppression', () => ({ Suppression: models.Suppression }))
vi.mock('@/models/Org', () => ({ Org: models.Org }))
vi.mock('@/lib/notify', () => ({ notifyMembers: vi.fn() }))
vi.mock('../next-step', () => ({ refreshNextFollowUp: vi.fn() }))
vi.mock('@/modules/work/teams/people', () => ({ listPeople: async () => [{ id: 'm1', name: 'Vikram', email: 'vikram@agency.in' }] }))
const send = vi.fn()
vi.mock('./delivery', () => ({ sendSequenceEmail: (...a: unknown[]) => send(...a) }))
const cap = { allowed: true }
const returned = vi.fn()
vi.mock('./store', () => ({ takeDailySend: async () => cap.allowed, returnDailySend: (...a: unknown[]) => returned(...a) }))

type Doc = Record<string, unknown>
const email = { kind: 'email', subject: 'Hi {{first_name|there}}', body: 'From {{owner}} to {{company}}' }

function world(opts: { lead?: Doc | null; steps?: Doc[]; suppression?: Doc | null; archived?: boolean }) {
  const updates: Doc[] = []
  const created: Record<string, Doc[]> = { Activity: [] }
  const seq = { name: 'Cold', steps: opts.steps ?? [email], window: { startHour: 10, endHour: 18 }, dailyCap: 150, archivedAt: opts.archived ? new Date() : null }
  const lead = opts.lead === undefined ? { _id: 'l1', companyName: 'Kiran Foods', contactName: 'Asha Rao', email: 'asha@kiran.in', stage: 'contacted' } : opts.lead
  const db = (model: { name: string }) => ({
    findOne: () => ({ lean: async () => (model.name === 'Sequence' ? seq : model.name === 'Lead' ? lead : model.name === 'Suppression' ? (opts.suppression ?? null) : null) }),
    updateOne: async (_f: unknown, u: Doc) => void (model.name === 'SequenceEnrollment' ? updates.push(u) : undefined),
    create: async (doc: Doc) => void (created[model.name] ??= []).push(doc),
  })
  const scope = { orgId: 'o1', db } as never
  const enrollment = { _id: 'e1', orgId: 'o1', sequenceId: 's1', leadId: 'l1', senderId: 'm1', stepIndex: 0, failures: 0 } as never
  return { scope, enrollment, updates, created }
}

const monday11 = new Date('2026-10-12T11:00:00+05:30')

describe('sequence runner', () => {
  beforeEach(() => {
    send.mockReset()
    returned.mockReset()
    cap.allowed = true
  })

  it('sends an email inside the window, logs it on the lead and finishes', async () => {
    send.mockResolvedValue({ ok: true, via: 'resend' })
    const { runStep } = await import('./runner')
    const w = world({})
    await expect(runStep(w.scope, w.enrollment, monday11)).resolves.toBe('sent')
    expect(send.mock.calls[0][1]).toMatchObject({ to: 'asha@kiran.in', subject: 'Hi Asha', body: 'From Vikram to Kiran Foods', senderEmail: 'vikram@agency.in' })
    expect(w.created.Activity[0]).toMatchObject({ type: 'email', status: 'done', title: 'Hi Asha' })
    expect(w.updates[0]).toEqual({ $set: { sendingStep: 0 } })
    expect(w.updates[1]).toMatchObject({ $set: { stepIndex: 1, status: 'completed', sendingStep: null }, $push: { history: { outcome: 'sent', via: 'resend' } } })
  })

  it('waits for the window on Sunday', async () => {
    const { runStep } = await import('./runner')
    const w = world({})
    await expect(runStep(w.scope, w.enrollment, new Date('2026-10-11T12:00:00+05:30'))).resolves.toBe('deferred')
    expect(w.updates[0]).toEqual({ $set: { claimedUntil: null, nextRunAt: new Date('2026-10-12T10:00:00+05:30') } })
    expect(send).not.toHaveBeenCalled()
  })

  it('stops on a bounce or an unsubscribe from the suppression list', async () => {
    const { runStep } = await import('./runner')
    const bounced = world({ suppression: { source: 'bounce' } })
    await runStep(bounced.scope, bounced.enrollment, monday11)
    expect(bounced.updates[0]).toMatchObject({ $set: { status: 'exited', exitReason: 'bounced' } })
    const unsub = world({ suppression: { source: 'unsubscribe_link' } })
    await runStep(unsub.scope, unsub.enrollment, monday11)
    expect(unsub.updates[0]).toMatchObject({ $set: { status: 'exited', exitReason: 'unsubscribed' } })
    expect(send).not.toHaveBeenCalled()
  })

  it('stops when the lead is won or lost, or the sequence is archived', async () => {
    const { runStep } = await import('./runner')
    const won = world({ lead: { _id: 'l1', companyName: 'K', stage: 'converted' } })
    await runStep(won.scope, won.enrollment, monday11)
    expect(won.updates[0]).toMatchObject({ $set: { exitReason: 'won' } })
    const lost = world({ lead: { _id: 'l1', companyName: 'K', stage: 'lost' } })
    await runStep(lost.scope, lost.enrollment, monday11)
    expect(lost.updates[0]).toMatchObject({ $set: { exitReason: 'lost' } })
    const archived = world({ archived: true })
    await runStep(archived.scope, archived.enrollment, monday11)
    expect(archived.updates[0]).toMatchObject({ $set: { exitReason: 'archived' } })
  })

  it("holds the email until tomorrow's window when the sender's daily cap is used", async () => {
    cap.allowed = false
    const { runStep } = await import('./runner')
    const w = world({})
    await expect(runStep(w.scope, w.enrollment, monday11)).resolves.toBe('deferred')
    expect(w.updates[0]).toMatchObject({ $set: { nextRunAt: new Date('2026-10-13T10:00:00+05:30') } })
  })

  it('gives the cap back and retries in an hour when sending fails', async () => {
    send.mockResolvedValue({ ok: false, via: 'gmail', error: 'Gmail send failed (500)' })
    const { runStep } = await import('./runner')
    const w = world({})
    await expect(runStep(w.scope, w.enrollment, monday11)).resolves.toBe('failed')
    expect(returned).toHaveBeenCalled()
    expect(w.updates[1]).toMatchObject({ $set: { failures: 1, sendingStep: null, nextRunAt: new Date(monday11.getTime() + 3_600_000) } })
  })

  it('turns a call step into a task for the sender and a wait into a later run', async () => {
    const { runStep } = await import('./runner')
    const w = world({ steps: [{ kind: 'call', note: 'Discuss the proposal' }, { kind: 'wait', waitDays: 2 }, email] })
    await expect(runStep(w.scope, w.enrollment, monday11)).resolves.toBe('task')
    expect(w.created.Activity[0]).toMatchObject({ type: 'call', status: 'planned', title: 'Discuss the proposal', assigneeId: 'm1', dueDate: '2026-10-12' })
    const wait = world({ steps: [{ kind: 'call' }, { kind: 'wait', waitDays: 2 }, email] })
    await expect(runStep(wait.scope, { ...(wait.enrollment as object), stepIndex: 1 } as never, monday11)).resolves.toBe('waited')
    expect(wait.updates[0]).toMatchObject({ $set: { stepIndex: 2, nextRunAt: new Date(monday11.getTime() + 2 * 86_400_000) } })
  })

  it("gives call tasks to the lead's current owner, not the person who enrolled it", async () => {
    const { runStep } = await import('./runner')
    const w = world({ lead: { _id: 'l1', companyName: 'Kiran Foods', stage: 'contacted', email: 'asha@kiran.in', ownerId: 'm2' }, steps: [{ kind: 'call' }] })
    await expect(runStep(w.scope, w.enrollment, monday11)).resolves.toBe('task')
    expect(w.created.Activity[0]).toMatchObject({ type: 'call', assigneeId: 'm2', createdBy: 'm1' })
  })

  it('waits for the send window before making a task', async () => {
    const { runStep } = await import('./runner')
    const w = world({ steps: [{ kind: 'reminder', note: 'Check in' }] })
    await expect(runStep(w.scope, w.enrollment, new Date('2026-10-12T03:00:00+05:30'))).resolves.toBe('deferred')
    expect(w.created.Activity).toHaveLength(0)
    expect(w.updates[0]).toMatchObject({ $set: { nextRunAt: new Date('2026-10-12T10:00:00+05:30') } })
  })

  it('stops when the lead has no email', async () => {
    const { runStep } = await import('./runner')
    const w = world({ lead: { _id: 'l1', companyName: 'K', stage: 'new', email: '' } })
    await runStep(w.scope, w.enrollment, monday11)
    expect(w.updates[0]).toMatchObject({ $set: { exitReason: 'no_email' } })
  })

  it('never sends a step twice when an earlier run died after handing it over (L-27c)', async () => {
    // Arrange: the enrolment still carries the "sending step 0" mark.
    const { runStep } = await import('./runner')
    const w = world({})
    const enrollment = { ...(w.enrollment as object), sendingStep: 0 } as never

    // Act
    const outcome = await runStep(w.scope, enrollment, monday11)

    // Assert
    expect(outcome).toBe('sent')
    expect(send).not.toHaveBeenCalled()
    expect(w.updates[0]).toMatchObject({ $set: { stepIndex: 1, sendingStep: null } })
  })

  it('gives the cap slot back and clears the mark when sending throws (L-27c)', async () => {
    send.mockRejectedValue(new Error('token lookup failed'))
    const { runStep } = await import('./runner')
    const w = world({})
    await expect(runStep(w.scope, w.enrollment, monday11)).rejects.toThrow('token lookup failed')
    expect(returned).toHaveBeenCalled()
    expect(w.updates.at(-1)).toEqual({ $set: { sendingStep: null } })
  })

  it('advances even when logging the sent email fails (L-27c)', async () => {
    send.mockResolvedValue({ ok: true, via: 'gmail' })
    const { runStep } = await import('./runner')
    const w = world({})
    const failingScope = { orgId: 'o1', db: (model: { name: string }) => (model.name === 'Activity' ? { create: async () => { throw new Error('db down') } } : (w.scope as { db: (m: { name: string }) => unknown }).db(model)) } as never
    await expect(runStep(failingScope, w.enrollment, monday11)).resolves.toBe('sent')
    expect(w.updates[1]).toMatchObject({ $set: { stepIndex: 1 } })
  })

  it('stops claiming enrolments once the time budget is spent (L-28a)', async () => {
    // Arrange
    const { runSequences, SEQUENCES_TIME_BUDGET_MS } = await import('./runner')
    const claim = vi.fn()
    const db = { raw: () => ({ find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [{ _id: 'e1' }, { _id: 'e2' }] }) }) }), findOneAndUpdate: claim }), forOrg: () => ({}) }
    let calls = 0
    const clock = () => (calls++ === 0 ? 0 : SEQUENCES_TIME_BUDGET_MS + 1)

    // Act
    await runSequences(db as never, monday11, clock)

    // Assert
    expect(claim).not.toHaveBeenCalled()
  })
})
