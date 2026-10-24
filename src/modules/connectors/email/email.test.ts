import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signHeader } from '@/modules/webhooks/sign'
import { authFailure, authFromBody, fromGeneric, fromResend, htmlToText, InboundUpstreamError, parseAuthResults, verifyInbound, type Fetch } from './adapter'
import { bareEmail, memberMailToken, parseTaskAddress, taskAddress } from './address'

vi.mock('server-only', () => ({}))
const SECRET = 'x'.repeat(48)
vi.mock('@/lib/env', async (orig) => ({ ...(await orig<typeof import('@/lib/env')>()), serverEnv: () => ({ APP_SECRET: SECRET, INBOUND_EMAIL_DOMAIN: 'in.flowbit.test', INBOUND_EMAIL_SECRET: 's' }), isInboundEmailConfigured: () => true }))
const ORG: { _id: string; security?: { mailToTaskTeammates?: boolean } } = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa' }
const MEMBERS = [{ _id: 'bbbbbbbbbbbbbbbbbbbbbbb1', userId: 'u1' }, { _id: 'bbbbbbbbbbbbbbbbbbbbbbb2', userId: 'u2' }]
const USERS = [{ _id: 'u1', email: 'vikram@vistaar.in' }, { _id: 'u2', email: 'priya@vistaar.in' }]
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/models/Org', () => ({ Org: { findOne: (f: { slug: string }) => ({ lean: async () => (f.slug === 'acme' ? ORG : null) }) } }))
vi.mock('@/models/Member', () => ({ Member: { find: () => ({ lean: async () => MEMBERS }) } }))
vi.mock('@/models/User', () => ({ User: { findOne: (f: { email: RegExp }) => ({ lean: async () => USERS.find((u) => f.email.test(u.email)) ?? null }) } }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ ok: true, retryAfterSeconds: 0 }) }))
const created: Record<string, unknown>[] = []
vi.mock('@/modules/work/tasks/create', () => ({ createTaskRecord: vi.fn(async (_ctx: unknown, _v: unknown, input: Record<string, unknown>) => {
  created.push(input)
  return { _id: 'tttttttttttttttttttttttt', key: 'AC-1', title: input.title }
}) }))
vi.mock('@/modules/work/tasks/viewer', () => ({ getViewer: async () => ({}) }))
vi.mock('@/lib/audit', () => ({ audit: async () => undefined }))
const notifyMembers = vi.fn(async () => 1)
vi.mock('@/lib/notify', () => ({ notifyMembers: (...args: unknown[]) => notifyMembers(...(args as [])) }))
vi.mock('@/lib/files', () => ({ saveFile: vi.fn(async (_c: unknown, i: { name: string; data: Buffer; mime: string }) => ({ _id: 'f1', name: i.name, size: i.data.length, mime: i.mime })) }))
const fakeDb = { findOne: () => ({ lean: async () => null }), create: async () => ({}), updateOne: async () => ({}) }
vi.mock('../ctx', () => ({ connectorCtx: async () => ({ memberId: 'bbbbbbbbbbbbbbbbbbbbbbb2', has: () => true, can: () => true, entitlements: { readOnly: false }, db: () => fakeDb }) }))

const tokenFor = (memberId: string) => memberMailToken(SECRET, ORG._id, memberId)

describe('task addresses', () => {
  it('makes a stable 10-character token per member and parses the address back', () => {
    const token = tokenFor(MEMBERS[0]._id)
    expect(token).toMatch(/^[a-z0-9]{10}$/)
    expect(tokenFor(MEMBERS[0]._id)).toBe(token)
    expect(tokenFor(MEMBERS[1]._id)).not.toBe(token)
    const address = taskAddress('acme-studio', token, 'in.flowbit.test')
    expect(address).toBe(`tasks+acme-studio-${token}@in.flowbit.test`)
    expect(parseTaskAddress(['someone@else.com', `Flowbit <${address.toUpperCase()}>`], 'in.flowbit.test')).toEqual({ slug: 'acme-studio', token })
    expect(parseTaskAddress([address], 'other.test')).toBeNull()
    expect(parseTaskAddress(['tasks+acme@in.flowbit.test'], 'in.flowbit.test')).toBeNull()
    expect(bareEmail('Ramesh <Ramesh@Kalpa.in>')).toBe('ramesh@kalpa.in')
  })
})

describe('inbound adapters', () => {
  it('verifies the generic X-Flowbit-Signature and Resend Svix signatures', () => {
    const raw = JSON.stringify({ from: 'a@b.c', to: ['x@y.z'], subject: 'Hi' })
    const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null })
    expect(verifyInbound(raw, headers({ 'x-flowbit-signature': signHeader('sec', raw) }), 'sec')).toMatchObject({ provider: 'generic' })
    expect(verifyInbound(raw, headers({ 'x-flowbit-signature': signHeader('wrong', raw) }), 'sec')).toBeNull()
    expect(verifyInbound(raw, headers({}), 'sec')).toBeNull()
    const svixSecret = `whsec_${Buffer.from('k'.repeat(24)).toString('base64')}`
    const id = 'msg_1'
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = createHmac('sha256', Buffer.from('k'.repeat(24))).update(`${id}.${ts}.${raw}`).digest('base64')
    expect(verifyInbound(raw, headers({ 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` }), svixSecret)).toMatchObject({ provider: 'resend' })
    expect(verifyInbound(raw, headers({ 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': 'v1,bad' }), svixSecret)).toBeNull()
  })

  it('parses the generic JSON shape with base64 attachments and html fallback', () => {
    const mail = fromGeneric({ from: 'Vikram <vikram@vistaar.in>', to: 'tasks+acme-x@in.test', subject: 'Banner', html: '<p>Two options</p><p>by Friday</p>', attachments: [{ filename: 'a.pdf', content_type: 'application/pdf', content: Buffer.from('%PDF').toString('base64') }] })
    expect(mail).toMatchObject({ subject: 'Banner', to: ['tasks+acme-x@in.test'], text: 'Two options\nby Friday' })
    expect(mail?.attachments[0]).toMatchObject({ filename: 'a.pdf', size: 4 })
    expect(fromGeneric({ subject: 'no from' })).toBeNull()
    expect(htmlToText('a&amp;b<br>c<script>x</script>')).toBe('a&b\nc')
  })

  it('reads a Resend email.received event through the receiving API (mocked)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/attachments')) return new Response(JSON.stringify({ data: [{ filename: 'brief.pdf', content_type: 'application/pdf', size: 10, download_url: 'https://cdn.resend.dev/x' }] }))
      return new Response(JSON.stringify({ from: 'vikram@vistaar.in', to: ['tasks+acme-abc@in.test'], subject: 'Fwd: Banner', text: 'Body', message_id: '<m1@x>' }))
    }) as unknown as Fetch
    const mail = await fromResend({ type: 'email.received', data: { email_id: 'em_1' } }, 're_key', fetchImpl)
    expect(mail).toMatchObject({ subject: 'Fwd: Banner', text: 'Body', messageId: '<m1@x>', attachments: [{ filename: 'brief.pdf', url: 'https://cdn.resend.dev/x' }] })
    expect(await fromResend({ type: 'email.sent', data: {} }, 're_key', fetchImpl)).toBeNull()
  })

  it('throws a retryable error when the Resend API is rate-limited or down, so the route answers 5xx (R3 M5)', async () => {
    // Arrange
    const event = { type: 'email.received', data: { email_id: 'em_1' } }
    const limited = vi.fn(async () => new Response('slow down', { status: 429 })) as unknown as Fetch
    const down = vi.fn(async () => { throw new TypeError('fetch failed') }) as unknown as Fetch

    // Act + Assert
    await expect(fromResend(event, 're_key', limited)).rejects.toBeInstanceOf(InboundUpstreamError)
    await expect(fromResend(event, 're_key', down)).rejects.toBeInstanceOf(InboundUpstreamError)
  })

  it('ignores a mail Resend no longer has, and calls the API with a timeout signal', async () => {
    const gone = vi.fn(async () => new Response('', { status: 404 }))
    expect(await fromResend({ type: 'email.received', data: { email_id: 'em_1' } }, 're_key', gone as unknown as Fetch)).toBeNull()
    expect((gone.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal)
  })
})

describe('email to task: auth and parse', () => {
  beforeEach(() => {
    created.length = 0
    ORG.security = undefined
  })
  const mail = (from: string, token: string, extra: Record<string, unknown> = {}) => ({ from, to: [taskAddress('acme', token, 'in.flowbit.test')], subject: 'Fwd: Homepage banner', text: 'Please do two options.\n\nOn Mon, Ramesh wrote:\n> old stuff', attachments: [], messageId: null, ...extra })

  it('creates a task from the address owner: subject → title (Fwd removed), body → description without the quoted reply, assigned to the owner', async () => {
    const { handleInboundEmail } = await import('./service')
    const res = await handleInboundEmail(mail('Vikram <vikram@vistaar.in>', tokenFor(MEMBERS[0]._id)))
    expect(res).toMatchObject({ status: 'created' })
    expect(created[0]).toMatchObject({ title: 'Homepage banner', description: 'Please do two options.', assigneeIds: [MEMBERS[0]._id], origin: { kind: 'email' } })
  })

  it('rejects senders who are not members, unknown tokens and unknown workspaces', async () => {
    const { handleInboundEmail } = await import('./service')
    expect(await handleInboundEmail(mail('spam@evil.com', tokenFor(MEMBERS[0]._id)))).toMatchObject({ status: 'rejected', reason: expect.stringMatching(/not a member/) })
    expect(await handleInboundEmail(mail('vikram@vistaar.in', 'zzzzzzzzzz'))).toMatchObject({ status: 'rejected', reason: 'unknown address' })
    expect(await handleInboundEmail({ ...mail('vikram@vistaar.in', tokenFor(MEMBERS[0]._id)), to: ['tasks+nope-abcdefghij@in.flowbit.test'] })).toMatchObject({ status: 'rejected', reason: 'unknown workspace' })
    expect(await handleInboundEmail({ ...mail('vikram@vistaar.in', 'x'), to: ['hello@in.flowbit.test'] })).toMatchObject({ status: 'rejected' })
    expect(created).toEqual([])
  })

  it('adds allowed attachments and skips the rest', async () => {
    const { handleInboundEmail } = await import('./service')
    const { saveFile } = await import('@/lib/files')
    const atts = [
      { filename: 'brief.pdf', contentType: 'application/pdf', size: 4, content: Buffer.from('%PDF'), url: null },
      { filename: 'virus.exe', contentType: 'application/x-msdownload', size: 4, content: Buffer.from('MZ'), url: null },
    ]
    await handleInboundEmail(mail('vikram@vistaar.in', tokenFor(MEMBERS[0]._id), { attachments: atts }))
    expect(vi.mocked(saveFile)).toHaveBeenCalledTimes(1)
  })
})

describe('email to task: who may send (M6)', () => {
  beforeEach(() => {
    created.length = 0
    ORG.security = undefined
  })
  const mail = (from: string, extra: Record<string, unknown> = {}) => ({ from, to: [taskAddress('acme', tokenFor(MEMBERS[0]._id), 'in.flowbit.test')], subject: 'Banner', text: 'Body', attachments: [], messageId: null, ...extra })

  it('refuses a teammate writing to someone else’s address by default (a spoofed From: of a member no longer works)', async () => {
    const { handleInboundEmail } = await import('./service')
    expect(await handleInboundEmail(mail('Priya <priya@vistaar.in>'))).toEqual({ status: 'rejected', reason: 'only the address owner can send to this address' })
    expect(created).toEqual([])
  })

  it('tells the address owner in the app when a mail to their address is refused (QA 10.4)', async () => {
    notifyMembers.mockClear()
    const { handleInboundEmail } = await import('./service')
    await handleInboundEmail(mail('Priya <priya@vistaar.in>'))
    expect(notifyMembers).toHaveBeenCalledTimes(1)
    const [, ids, input] = notifyMembers.mock.calls[0] as unknown as [unknown, string[], { body: string; dedupeKey: string; kind: string }]
    expect(ids).toEqual([MEMBERS[0]._id])
    expect(input.body).toMatch(/Allow teammates to email my address/)
    expect(input.dedupeKey).toMatch(new RegExp(`^mail-task-rejected:${MEMBERS[0]._id}:only-the-address-owner`))
  })

  it('does not notify anyone for an unknown address or a created task', async () => {
    notifyMembers.mockClear()
    const { handleInboundEmail } = await import('./service')
    await handleInboundEmail(mail('vikram@vistaar.in', { to: ['tasks+acme-zzzzzzzzzz@in.flowbit.test'] }))
    await handleInboundEmail(mail('vikram@vistaar.in'))
    expect(notifyMembers).not.toHaveBeenCalled()
  })

  it('accepts a teammate once an admin allows it, with the owner as assignee', async () => {
    ORG.security = { mailToTaskTeammates: true }
    const { handleInboundEmail } = await import('./service')
    expect(await handleInboundEmail(mail('priya@vistaar.in'))).toMatchObject({ status: 'created' })
    expect(created[0]).toMatchObject({ assigneeIds: [MEMBERS[0]._id] })
  })

  it('refuses mail whose provider-reported SPF, DKIM or DMARC did not pass, even from the owner', async () => {
    const { handleInboundEmail } = await import('./service')
    expect(await handleInboundEmail(mail('vikram@vistaar.in', { auth: { spf: 'pass', dkim: 'fail' } }))).toMatchObject({ status: 'rejected', reason: expect.stringMatching(/DKIM fail/) })
    expect(await handleInboundEmail(mail('vikram@vistaar.in', { auth: { dmarc: 'none' } }))).toMatchObject({ status: 'rejected' })
    expect(await handleInboundEmail(mail('vikram@vistaar.in', { auth: { spf: 'pass', dkim: 'pass', dmarc: 'pass' } }))).toMatchObject({ status: 'created' })
  })

  it('reads verdicts from an auth object, flat fields or an Authentication-Results header', () => {
    expect(parseAuthResults('mx.google.com; dkim=pass header.i=@x.in; spf=softfail smtp.mailfrom=x; dmarc=FAIL')).toEqual({ dkim: 'pass', spf: 'softfail', dmarc: 'fail' })
    expect(parseAuthResults('mx; arc=none')).toBeNull()
    expect(authFromBody({ auth: { spf: 'Pass', dkim: { result: 'pass' } } })).toEqual({ spf: 'pass', dkim: 'pass' })
    expect(authFromBody({ spf: 'fail' })).toEqual({ spf: 'fail' })
    expect(authFromBody({ headers: { 'Authentication-Results': 'mx; spf=pass' } })).toEqual({ spf: 'pass' })
    expect(authFromBody({})).toBeNull()
    expect(authFailure(null)).toBeNull()
    expect(authFailure({ spf: 'pass' })).toBeNull()
    expect(fromGeneric({ from: 'a@b.c', to: 'x@y.z', auth: { spf: 'fail' } })?.auth).toEqual({ spf: 'fail' })
  })
})

describe('Integrations card for email to task (browser check 9 Oct)', () => {
  it('shows an email address, never a URL, and names the missing variable otherwise', async () => {
    const { emailToTaskCard } = await import('./card')
    expect(emailToTaskCard({ INBOUND_EMAIL_DOMAIN: 'In.Flowbit.test', INBOUND_EMAIL_SECRET: 's' }, 'tasks+acme-abcdefghij@in.flowbit.test', 'acme')).toEqual({ ready: true, address: 'tasks+acme-abcdefghij@in.flowbit.test' })
    const generic = emailToTaskCard({ INBOUND_EMAIL_DOMAIN: 'In.Flowbit.test', INBOUND_EMAIL_SECRET: 's' }, null, 'acme')
    expect(generic).toEqual({ ready: true, address: 'tasks+acme-<token>@in.flowbit.test' })
    expect(JSON.stringify(generic)).not.toMatch(/https?:/)
    expect(emailToTaskCard({ INBOUND_EMAIL_DOMAIN: '', INBOUND_EMAIL_SECRET: 's' }, null, 'acme')).toEqual({ ready: false, hint: 'Set INBOUND_EMAIL_DOMAIN to enable.' })
    expect(emailToTaskCard({ INBOUND_EMAIL_DOMAIN: 'in.x.test' }, null, 'acme')).toEqual({ ready: false, hint: 'Set INBOUND_EMAIL_SECRET to enable.' })
  })
})

describe('MIME parsing for generic inbound providers', () => {
  const mime = [
    'Authentication-Results: mx.example.net; spf=pass smtp.mailfrom=vistaar.in; dkim=pass header.d=vistaar.in; dmarc=pass',
    'From: Vikram Rao <vikram@vistaar.in>',
    'To: Flowbit <tasks+acme-abcdefghij@in.flowbit.test>',
    'Subject: =?UTF-8?B?RndkOiBCYW5uZXIg4oCU?= options',
    'Message-ID: <m-42@vistaar.in>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="b1"',
    '',
    '--b1',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Two options by Friday.',
    '--b1',
    'Content-Type: application/pdf; name="brief.pdf"',
    'Content-Disposition: attachment; filename="brief.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('%PDF-1.4 test').toString('base64'),
    '--b1--',
    '',
  ].join('\r\n')

  it('reads sender, recipients, subject, body, message id, auth verdicts and attachments', async () => {
    const { fromMime } = await import('./adapter')
    const mail = await fromMime(mime)
    expect(mail).toMatchObject({ from: 'Vikram Rao <vikram@vistaar.in>', to: ['Flowbit <tasks+acme-abcdefghij@in.flowbit.test>'], subject: 'Fwd: Banner — options', text: 'Two options by Friday.', messageId: '<m-42@vistaar.in>', auth: { spf: 'pass', dkim: 'pass', dmarc: 'pass' } })
    expect(mail?.attachments).toHaveLength(1)
    expect(mail?.attachments[0]).toMatchObject({ filename: 'brief.pdf', contentType: 'application/pdf', size: 13 })
    expect(mail?.attachments[0].content?.toString()).toBe('%PDF-1.4 test')
  })

  it('takes a base64 raw message from the generic JSON, with envelope recipients and provider verdicts winning', async () => {
    const { fromGenericBody } = await import('./adapter')
    const mail = await fromGenericBody({ raw: Buffer.from(mime).toString('base64'), to: ['tasks+acme-zzzzzzzzzz@in.flowbit.test'], auth: { spf: 'fail' } })
    expect(mail?.to).toEqual(['tasks+acme-zzzzzzzzzz@in.flowbit.test'])
    expect(mail?.auth).toEqual({ spf: 'fail' })
    expect(await fromGenericBody({ mime })).toMatchObject({ subject: 'Fwd: Banner — options' })
    expect(await fromGenericBody({ from: 'a@b.c', to: 'x@y.z', subject: 'split' })).toMatchObject({ subject: 'split' })
    expect(await fromGenericBody({ mime: 'not a message' })).toBeNull()
  })
})
