import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const env = { GMAIL_REPLY_DETECTION: 'true', INBOUND_EMAIL_DOMAIN: 'in.useflowbit.com', APP_SECRET: 's'.repeat(40) }
vi.mock('@/lib/env', () => ({ serverEnv: () => env, isInboundEmailConfigured: () => true }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/modules/google/connections', () => ({ accessTokenFor: async () => 'gtok' }))
vi.mock('@/modules/work/teams/people', () => ({ listPeople: async () => [{ id: 'm1', name: 'Vikram', email: 'vikram@agency.in' }] }))
const orgRow = { _id: 'o1', slug: 'vistaar' }
vi.mock('@/models/Org', () => ({ Org: { name: 'Org', findOne: () => ({ lean: async () => orgRow }), findById: () => ({ lean: async () => orgRow }) } }))
vi.mock('@/models/orbit/Activity', () => ({ Activity: { name: 'Activity' } }))
vi.mock('@/models/orbit/Lead', () => ({ Lead: { name: 'Lead' } }))
vi.mock('@/models/orbit/SequenceEnrollment', () => ({ SequenceEnrollment: { name: 'SequenceEnrollment' } }))

type Doc = Record<string, unknown>
const state = { exited: [] as Doc[], activities: [] as Doc[], enrollments: [] as Doc[] }

function scopedDb() {
  return {
    db: (model: { name: string }) => ({
      find: () => ({ lean: async () => (model.name === 'Lead' ? [{ _id: 'l1', clientId: null }] : state.enrollments) }),
      findOne: () => ({ lean: async () => ({ _id: 'l1', clientId: null }) }),
      updateOne: async () => ({ modifiedCount: 1 }),
      updateMany: async (filter: Doc) => {
        state.exited.push(filter)
        return { modifiedCount: 1 }
      },
      create: async (doc: Doc) => void state.activities.push(doc),
    }),
  }
}

const system = {
  raw: () => ({ find: () => ({ sort: () => ({ limit: () => ({ lean: async () => state.enrollments }) }) }) }),
  forOrg: () => scopedDb(),
}

beforeEach(() => {
  state.exited = []
  state.activities = []
  state.enrollments = [{ _id: 'e1', orgId: 'o1', leadId: 'l1', senderId: 'm1', history: [{ threadId: 't1' }, { threadId: 't1' }] }]
  env.GMAIL_REPLY_DETECTION = 'true'
})

describe('Gmail reply detection job (mocked Gmail)', () => {
  it('stops the sequence and logs a reply when the lead wrote in the thread', async () => {
    const { checkGmailReplies } = await import('./replies')
    const read = vi.fn().mockResolvedValue([{ from: 'vikram@agency.in' }, { from: 'Asha <asha@kiran.in>' }])
    expect(await checkGmailReplies(system as never, new Date('2026-10-09T06:00:00Z'), read)).toEqual({ checked: 1, replied: 1 })
    expect(read).toHaveBeenCalledTimes(1)
    expect(state.exited).toHaveLength(1)
    expect(state.activities[0]).toMatchObject({ type: 'reply', title: 'Replied to the sequence' })
  })

  it('leaves the sequence running when only the sender wrote', async () => {
    const { checkGmailReplies } = await import('./replies')
    const read = vi.fn().mockResolvedValue([{ from: 'vikram@agency.in' }])
    expect(await checkGmailReplies(system as never, new Date(), read)).toEqual({ checked: 1, replied: 0 })
    expect(state.exited).toHaveLength(0)
  })

  it('does nothing while the server switch is off', async () => {
    env.GMAIL_REPLY_DETECTION = ''
    const { checkGmailReplies } = await import('./replies')
    const read = vi.fn()
    expect(await checkGmailReplies(system as never, new Date(), read)).toEqual({ checked: 0, replied: 0 })
    expect(read).not.toHaveBeenCalled()
  })
})

describe('per-enrolment reply address (no CASA path, M7)', () => {
  const E1 = '665f1c2a9d3e4b0012345678'
  const replySystem = (row: Doc | null) => {
    const updates: Doc[] = []
    return {
      updates,
      db: {
        raw: () => ({ findOne: () => ({ lean: async () => row }) }),
        forOrg: () => {
          const base = scopedDb()
          return { db: (model: { name: string }) => ({ ...base.db(model), updateOne: async (filter: Doc) => {
            if (model.name === 'SequenceEnrollment') updates.push(filter)
            return { modifiedCount: 1 }
          } }) }
        },
      },
    }
  }
  const mail = (to: string, extra: Doc = {}) => ({ from: 'Asha <asha@kiran.in>', to: [to], subject: 'Re: Quick question', text: 'Yes, call me', attachments: [], messageId: 'x', ...extra })

  it('stops only the enrolment the address belongs to and logs the reply', async () => {
    const { handleSequenceReply } = await import('./replies')
    const { enrollmentReplyAddress } = await import('./reply-rules')
    const sys = replySystem({ _id: E1, orgId: 'o1', leadId: 'l1', senderId: 'm1', status: 'active' })
    const outcome = await handleSequenceReply(mail(enrollmentReplyAddress(env.APP_SECRET, E1, env.INBOUND_EMAIL_DOMAIN)) as never, sys.db as never)
    expect(outcome).toEqual({ status: 'replied', leads: 1 })
    expect(sys.updates).toEqual([{ _id: E1, status: 'active' }])
    expect(state.exited).toHaveLength(0)
    expect(state.activities[0]).toMatchObject({ type: 'reply', notes: expect.stringContaining('asha@kiran.in') })
  })

  it('refuses a forged signature, the old workspace inbox, out-of-office mail and finished sequences', async () => {
    const { handleSequenceReply } = await import('./replies')
    const { enrollmentReplyAddress } = await import('./reply-rules')
    const sys = replySystem({ _id: E1, orgId: 'o1', leadId: 'l1', senderId: 'm1', status: 'active' })
    expect(await handleSequenceReply(mail(`reply+${E1}-aaaaaaaaaaaaaaaa@in.useflowbit.com`) as never, sys.db as never)).toEqual({ status: 'rejected', reason: 'unknown reply address' })
    expect(await handleSequenceReply(mail('replies+vistaar-aaaaaaaaaaaa@in.useflowbit.com') as never, sys.db as never)).toEqual({ status: 'rejected', reason: 'unknown reply address' })
    const to = enrollmentReplyAddress(env.APP_SECRET, E1, env.INBOUND_EMAIL_DOMAIN)
    expect(await handleSequenceReply(mail(to, { subject: 'Out of office' }) as never, sys.db as never)).toMatchObject({ status: 'rejected', reason: 'automatic reply' })
    const done = replySystem({ _id: E1, orgId: 'o1', leadId: 'l1', senderId: 'm1', status: 'exited' })
    expect(await handleSequenceReply(mail(to) as never, done.db as never)).toMatchObject({ status: 'rejected', reason: 'the sequence has already ended' })
    expect(await handleSequenceReply(mail(to) as never, replySystem(null).db as never)).toMatchObject({ status: 'rejected', reason: 'unknown reply address' })
    expect(sys.updates).toEqual([])
    expect(state.activities).toHaveLength(0)
  })
})
