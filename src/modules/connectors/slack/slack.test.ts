import { beforeEach, describe, expect, it, vi } from 'vitest'
import { slackApi, type Fetch } from './api'
import { parseSlashCommand, slackLabel } from './command'
import { slackSignature, verifySlackRequest } from './signature'
import { modalValues, taskModal } from './views'

vi.mock('server-only', () => ({}))
const key = Buffer.alloc(32, 7)
vi.mock('@/lib/env', async (orig) => ({ ...(await orig<typeof import('@/lib/env')>()), encryptionKey: () => key, appUrl: (p = '') => `https://app.test${p}` }))
const users = [{ _id: 'u1', email: 'vikram@vistaar.in' }]
const members = [{ _id: 'm1', userId: 'u1', orgId: 'o1' }]
vi.mock('@/models/User', () => ({ User: { findOne: (f: { email: RegExp }) => ({ lean: async () => users.find((u) => f.email.test(u.email)) ?? null }) } }))
vi.mock('@/models/Member', () => ({ Member: { findOne: (f: { userId: string }) => ({ lean: async () => members.find((m) => m.userId === f.userId) ?? null }) } }))
const connectorCtx = vi.fn(async () => ({ memberId: 'm1', has: () => true, can: () => true, entitlements: { readOnly: false } }))
vi.mock('../ctx', () => ({ connectorCtx: (...a: unknown[]) => connectorCtx(...(a as [])) }))

const SECRET = '8f742231b10e8888abcd99yyyzzz1234'

describe('Slack request signing', () => {
  it('accepts a correct signature and refuses tampered, foreign and old requests', () => {
    const ts = '1790000000'
    const body = 'token=x&team_id=T1&text=task+logo+kal'
    const sig = slackSignature(SECRET, ts, body)
    expect(verifySlackRequest(SECRET, body, ts, sig, 1790000010)).toBe(true)
    expect(verifySlackRequest(SECRET, `${body}&x=1`, ts, sig, 1790000010)).toBe(false)
    expect(verifySlackRequest('other-secret', body, ts, sig, 1790000010)).toBe(false)
    expect(verifySlackRequest(SECRET, body, ts, sig, 1790000400)).toBe(false)
    expect(verifySlackRequest(SECRET, body, null, sig)).toBe(false)
    expect(verifySlackRequest('', body, ts, slackSignature('', ts, body), 1790000000)).toBe(false)
  })
})

describe('/flowbit command parsing', () => {
  it.each([
    ['task logo bhejo kal 5 baje @vikram', { kind: 'task', text: 'logo bhejo kal 5 baje @vikram' }],
    ['  add   call Ramesh parso ', { kind: 'task', text: 'call Ramesh parso' }],
    ['my day', { kind: 'my_day' }],
    ['myday', { kind: 'my_day' }],
    ['aaj', { kind: 'my_day' }],
    ['', { kind: 'help' }],
    ['help', { kind: 'help' }],
    ['dance', { kind: 'unknown', text: 'dance' }],
  ])('%s', (text, expected) => {
    expect(parseSlashCommand(text)).toEqual(expected)
  })

  it('labels the source', () => {
    expect(slackLabel('design')).toBe('Slack #design')
    expect(slackLabel(null)).toBe('Slack')
  })
})

describe('message shortcut modal', () => {
  it('prefills the title from the first line and reads submitted values', () => {
    const view = taskModal('Banner revisions please\nclient wants 2 options', { channelId: 'C1', channelName: 'design', ts: '1.2', permalink: null })
    expect(view.blocks[0].element).toMatchObject({ initial_value: 'Banner revisions please' })
    expect(JSON.parse(view.private_metadata)).toMatchObject({ channelName: 'design' })
    expect(modalValues({ values: { title: { v: { value: ' Banner ' } }, due: { v: { value: 'kal' } }, assignee: { v: { selected_user: 'U2' } } } })).toEqual({ title: 'Banner', description: '', due: 'kal', assigneeSlackId: 'U2' })
  })
})

describe('Slack API (mocked)', () => {
  it('sends JSON with the bot token and reports Slack errors without throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }))) as unknown as Fetch
    const res = await slackApi('chat.postMessage', 'xoxb-1', { channel: 'C1', text: 'hi' }, fetchImpl)
    expect(res).toEqual({ ok: false, error: 'channel_not_found' })
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://slack.com/api/chat.postMessage')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer xoxb-1')
    const broken = (async () => { throw new Error('offline') }) as unknown as Fetch
    expect(await slackApi('auth.test', 'x', {}, broken)).toMatchObject({ ok: false, error: 'offline' })
  })
})

describe('acting as the Slack user', () => {
  beforeEach(() => connectorCtx.mockClear())

  async function install() {
    const { sealSecret } = await import('@/lib/secret-box')
    return { orgId: 'o1', teamId: 'T1', botTokenSealed: sealSecret('xoxb-secret', key) } as never
  }
  const slackUser = (email: string | null): Fetch => (async () => new Response(JSON.stringify(email ? { ok: true, user: { profile: { email } } } : { ok: false, error: 'missing_scope' }))) as unknown as Fetch

  it('matches the Slack user to a member by email', async () => {
    const { actingMember } = await import('./service')
    const res = await actingMember(await install(), 'U1', slackUser('Vikram@Vistaar.in'))
    expect(res.ok).toBe(true)
    expect(connectorCtx).toHaveBeenCalledWith('o1', { memberId: 'm1' }, 'Slack')
  })

  it('refuses people who are not members, and missing emails', async () => {
    const { actingMember } = await import('./service')
    expect(await actingMember(await install(), 'U9', slackUser('stranger@x.com'))).toMatchObject({ ok: false, message: expect.stringMatching(/not a member/) })
    expect(await actingMember(await install(), 'U9', slackUser(null))).toMatchObject({ ok: false, message: expect.stringMatching(/email/) })
  })

  it('answers help and unknown commands without touching Flowbit', async () => {
    const { runSlash } = await import('./service')
    expect(await runSlash(await install(), { teamId: 'T1', userId: 'U1', text: 'help', channelName: 'design' })).toMatch(/\/flowbit task/)
    expect(await runSlash(await install(), { teamId: 'T1', userId: 'U1', text: 'dance', channelName: null })).toMatch(/did not understand/)
    expect(connectorCtx).not.toHaveBeenCalled()
  })

  it('refuses an empty modal title before doing anything', async () => {
    const { submitTaskModal } = await import('./service')
    expect(await submitTaskModal(await install(), 'U1', { state: { values: { title: { v: { value: '' } } } } })).toEqual({ errors: { title: 'Add a title' } })
    expect(await submitTaskModal(await install(), 'U1', { state: { values: { title: { v: { value: 'X' } }, due: { v: { value: 'someday' } } } } })).toMatchObject({ errors: { due: expect.any(String) } })
  })
})
