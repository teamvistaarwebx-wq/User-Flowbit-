import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasAddOn } from '@/lib/addons'
import { hashOtp } from '@/lib/otp'
import { decisionRefusal, PORTAL_CODE_REFUSAL, portalInvoiceFilter, portalRefusal, PORTAL_COOKIE, taskVisibleTo, visibleTaskFilter } from './access'

vi.mock('server-only', () => ({}))
const SECRET = 'p'.repeat(48)
vi.mock('@/lib/env', () => ({ serverEnv: () => ({ APP_SECRET: SECRET }), secureCookies: () => true, appUrl: (p = '') => `https://app.test${p}` }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/request', () => ({ requestIp: async () => '10.0.0.1' }))
const limits = { blocked: false }
vi.mock('@/lib/rate-limit', () => ({ RATE_LIMITS: { portalCodeSend: { limit: 5, windowMs: 1 }, portalCodeVerify: { limit: 10, windowMs: 1 } }, rateLimit: async () => ({ ok: !limits.blocked, retryAfterSeconds: 600 }), rateLimitMessage: () => 'Too many attempts. Try again in 10 minutes.' }))
const sent: { to: unknown; secrets?: string[] }[] = []
vi.mock('@/lib/mail', () => ({ emailLayout: () => ({ html: '', text: '' }), sendMail: async (m: { to: unknown; secrets?: string[] }) => { sent.push(m); return { ok: true } } }))
vi.mock('@/lib/email-brand', () => ({ emailBrandFor: async () => null }))
const notified: { ids: unknown[]; title: string }[] = []
vi.mock('@/lib/notify', () => ({ notifyMembers: async (_c: unknown, ids: unknown[], input: { title: string }) => { notified.push({ ids, title: input.title }); return ids.length } }))
const jar = new Map<string, { value: string; opts?: Record<string, unknown> }>()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => jar.get(n), set: (n: string, v: string, opts: Record<string, unknown>) => jar.set(n, { value: v, opts }), delete: (n: string | { name: string }) => jar.delete(typeof n === 'string' ? n : n.name) }),
  headers: async () => ({ get: () => 'vitest' }),
}))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`) } }))

// --- A tiny tenant-scoped store: every query carries the orgId, as lib/db/scoped does ---------------
type Doc = Record<string, unknown> & { _id: string; orgId: string }
const store: Record<string, Doc[]> = {}
const get = (doc: Record<string, unknown>, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), doc)
function match(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return (cond as Record<string, unknown>[]).some((f) => match(doc, f))
    if (key === '$and') return (cond as Record<string, unknown>[]).every((f) => match(doc, f))
    const value = get(doc, key)
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond) && Object.keys(cond).some((k) => k.startsWith('$'))) {
      const c = cond as Record<string, unknown>
      if ('$in' in c) return (c.$in as unknown[]).map(String).includes(String(value))
      if ('$gt' in c) return value instanceof Date && value.getTime() > (c.$gt as Date).getTime()
      if ('$lt' in c) return Number(value ?? 0) < Number(c.$lt)
      return false
    }
    if (cond === null) return value === null || value === undefined
    return String(value) === String(cond)
  })
}
let seq = 0
const newId = () => (++seq).toString(16).padStart(24, '0')
function scopedFake(model: { modelName: string }, orgId: unknown) {
  const rows = () => (store[model.modelName] ??= []).filter((d) => d.orgId === String(orgId))
  const one = (f: Record<string, unknown>) => rows().find((d) => match(d, f)) ?? null
  const chain = <T,>(value: () => T) => ({ lean: async () => value(), sort: () => chain(value), limit: () => chain(value) })
  return {
    findOne: (f: Record<string, unknown>) => chain(() => { const all = rows().filter((d) => match(d, f)); return all[all.length - 1] ?? null }),
    findById: (id: unknown) => chain(() => one({ _id: id })),
    find: (f: Record<string, unknown>) => chain(() => rows().filter((d) => match(d, f))),
    create: async (doc: Record<string, unknown>) => { const row = { _id: newId(), ...doc, orgId: String(orgId) } as Doc; (store[model.modelName] ??= []).push(row); return row },
    updateOne: async (f: Record<string, unknown>, u: { $set?: Record<string, unknown>; $inc?: Record<string, number> }) => {
      const row = one(f)
      if (!row) return { modifiedCount: 0 }
      for (const [k, v] of Object.entries(u.$set ?? {})) {
        const parts = k.split('.')
        let target: Record<string, unknown> = row
        for (const p of parts.slice(0, -1)) target = (target[p] ??= {}) as Record<string, unknown>
        target[parts[parts.length - 1]] = v
      }
      for (const [k, v] of Object.entries(u.$inc ?? {})) row[k] = Number(row[k] ?? 0) + v
      return { modifiedCount: 1 }
    },
    updateMany: async (f: Record<string, unknown>, u: { $set: Record<string, unknown> }) => { const all = rows().filter((d) => match(d, f)); all.forEach((r) => Object.assign(r, u.$set)); return { modifiedCount: all.length } },
    deleteOne: async (f: Record<string, unknown>) => { const r = one(f); if (r) store[model.modelName] = store[model.modelName].filter((d) => d !== r); return { deletedCount: r ? 1 : 0 } },
  }
}
vi.mock('@/lib/db/scoped', () => ({ scoped: (m: { modelName: string }, orgId: unknown) => scopedFake(m, orgId) }))
vi.mock('@/models/Org', () => ({ Org: { findOne: (f: { slug: string }) => ({ lean: async () => (store.Org ?? []).find((o) => o.slug === f.slug) ?? null }) } }))

const ACME_ORG = 'a'.repeat(24)
const OTHER_ORG = 'b'.repeat(24)
const future = new Date(Date.now() + 30 * 86_400_000)
const suite = { status: 'active', plan: 'suite', accountType: 'paid', currentPeriodStart: new Date(Date.now() - 86_400_000), currentPeriodEnd: future }

function seed() {
  for (const k of Object.keys(store)) delete store[k]
  store.Org = [
    { _id: ACME_ORG, orgId: ACME_ORG, slug: 'acme', name: 'Acme Studio', subscription: suite },
    { _id: OTHER_ORG, orgId: OTHER_ORG, slug: 'other', name: 'Other Co', subscription: suite },
  ]
  store.Client = [
    { _id: 'c1'.padEnd(24, '0'), orgId: ACME_ORG, name: 'Kalpa Foods', portal: { enabled: true } },
    { _id: 'c2'.padEnd(24, '0'), orgId: ACME_ORG, name: 'Mehta Exports', portal: { enabled: true } },
    { _id: 'c3'.padEnd(24, '0'), orgId: OTHER_ORG, name: 'Kalpa (other workspace)', portal: { enabled: true } },
  ]
  store.PortalContact = [
    { _id: 'p1'.padEnd(24, '0'), orgId: ACME_ORG, clientId: 'c1'.padEnd(24, '0'), email: 'ramesh@kalpa.in', name: 'Ramesh', status: 'active' },
    { _id: 'p2'.padEnd(24, '0'), orgId: ACME_ORG, clientId: 'c2'.padEnd(24, '0'), email: 'neha@mehta.in', name: 'Neha', status: 'revoked' },
    { _id: 'p3'.padEnd(24, '0'), orgId: OTHER_ORG, clientId: 'c3'.padEnd(24, '0'), email: 'ramesh@kalpa.in', name: 'Ramesh', status: 'active' },
  ]
  store.Project = [
    { _id: 'f1'.padEnd(24, '0'), orgId: ACME_ORG, clientId: 'c1'.padEnd(24, '0'), portalShared: true, archivedAt: null, name: 'Kalpa site', code: 'KAL', status: 'active', health: 'on_track', progress: 40, color: '#fff', files: [{ fileId: 'e1'.padEnd(24, '0'), name: 'brief.pdf', size: 10 }] },
    { _id: 'f2'.padEnd(24, '0'), orgId: ACME_ORG, clientId: 'c1'.padEnd(24, '0'), portalShared: false, archivedAt: null, name: 'Kalpa internal', code: 'KAI', files: [{ fileId: 'e2'.padEnd(24, '0'), name: 'margins.xlsx' }] },
    { _id: 'f3'.padEnd(24, '0'), orgId: ACME_ORG, clientId: 'c2'.padEnd(24, '0'), portalShared: true, archivedAt: null, name: 'Mehta catalogue', code: 'MEH', files: [{ fileId: 'e3'.padEnd(24, '0'), name: 'mehta.pdf' }] },
  ]
  store.Task = [
    { _id: 't1'.padEnd(24, '0'), orgId: ACME_ORG, key: 'KAL-1', title: 'Homepage design', projectId: 'f1'.padEnd(24, '0'), clientVisible: true, creatorId: 'm1'.padEnd(24, '0'), assigneeIds: ['m2'.padEnd(24, '0')], approval: { status: 'requested', requestedById: 'm1'.padEnd(24, '0') } },
    { _id: 't2'.padEnd(24, '0'), orgId: ACME_ORG, key: 'KAL-2', title: 'Internal costing', projectId: 'f1'.padEnd(24, '0'), clientVisible: false, creatorId: 'm1'.padEnd(24, '0') },
    { _id: 't3'.padEnd(24, '0'), orgId: ACME_ORG, key: 'KAI-1', title: 'Unshared project task', projectId: 'f2'.padEnd(24, '0'), clientVisible: true, creatorId: 'm1'.padEnd(24, '0') },
    { _id: 't4'.padEnd(24, '0'), orgId: ACME_ORG, key: 'MEH-1', title: 'Mehta approval', projectId: 'f3'.padEnd(24, '0'), clientVisible: true, creatorId: 'm1'.padEnd(24, '0'), approval: { status: 'requested' } },
  ]
  sent.length = 0
  notified.length = 0
  jar.clear()
  limits.blocked = false
}

describe('portal rules', () => {
  it('refuses a workspace without the portal, a client with it off, and a removed contact', () => {
    expect(portalRefusal({ portalOn: false, deleted: false }, { enabled: true }, { status: 'active' })).toBeTruthy()
    expect(portalRefusal({ portalOn: true, deleted: false }, { enabled: false }, { status: 'active' })).toBeTruthy()
    expect(portalRefusal({ portalOn: true, deleted: false }, { enabled: true }, { status: 'revoked' })).toBeTruthy()
    expect(portalRefusal({ portalOn: true, deleted: false }, { enabled: true }, { status: 'active' })).toBeNull()
  })

  it('shows only client-visible tasks of this client or its shared projects', () => {
    const shared = new Set(['p1'])
    expect(taskVisibleTo({ clientVisible: true, projectId: 'p1' }, 'c1', shared)).toBe(true)
    expect(taskVisibleTo({ clientVisible: false, projectId: 'p1' }, 'c1', shared)).toBe(false)
    expect(taskVisibleTo({ clientVisible: true, projectId: 'p2' }, 'c1', shared)).toBe(false)
    expect(taskVisibleTo({ clientVisible: true, clientId: 'c2' }, 'c1', shared)).toBe(false)
    expect(taskVisibleTo({ clientVisible: false, clientId: 'c1', approval: { status: 'requested' } }, 'c1', shared)).toBe(true)
    expect(visibleTaskFilter('c1', [])).toEqual({ $and: [{ $or: [{ clientVisible: true }, { 'approval.status': 'requested' }] }, { $or: [{ clientId: 'c1' }] }] })
  })

  it('a change request needs a comment; a decided item cannot be decided again', () => {
    expect(decisionRefusal('requested', 'changes_requested', ' ')).toMatch(/what to change/)
    expect(decisionRefusal('requested', 'approved', '')).toBeNull()
    expect(decisionRefusal('approved', 'approved', '')).toMatch(/no longer waiting/)
  })

  it('is part of Suite, an add-on on Custom, on in a trial, off when read-only', () => {
    const custom = { status: 'active', plan: 'custom', accountType: 'paid', currentPeriodStart: new Date(Date.now() - 86_400_000), currentPeriodEnd: future }
    expect(hasAddOn({ subscription: suite }, 'portal')).toBe(true)
    expect(hasAddOn({ subscription: suite }, 'meetings_ai')).toBe(false)
    expect(hasAddOn({ subscription: custom }, 'portal')).toBe(false)
    expect(hasAddOn({ subscription: { ...custom, addOns: ['portal'] } }, 'portal')).toBe(true)
    expect(hasAddOn({ subscription: { status: 'trialing', plan: 'trial', accountType: 'trial', trialEndsAt: future } }, 'meetings_ai')).toBe(true)
    expect(hasAddOn({ subscription: { ...suite, currentPeriodEnd: new Date(Date.now() - 40 * 86_400_000) } }, 'portal')).toBe(false)
    expect(hasAddOn({ subscription: suite, disabled: true }, 'portal')).toBe(false)
  })
})

describe('portal sign-in', () => {
  beforeEach(seed)

  it('answers the same for unknown, removed and real emails, and only emails the real one', async () => {
    const { requestPortalCode } = await import('./session')
    const a = await requestPortalCode('acme', 'nobody@x.in')
    const b = await requestPortalCode('acme', 'neha@mehta.in')
    const c = await requestPortalCode('acme', 'Ramesh@Kalpa.in')
    expect(a).toEqual(b)
    expect(b).toEqual(c)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('ramesh@kalpa.in')
    expect(sent[0].secrets?.[0]).toMatch(/^\d{6}$/)
    const codes = (store.PortalCode ?? []).filter((c) => c.orgId === ACME_ORG)
    expect(codes).toHaveLength(1)
    expect(codes[0].codeHash).not.toBe(sent[0].secrets?.[0])
  })

  it('refuses when rate limited', async () => {
    limits.blocked = true
    const { requestPortalCode, verifyPortalCode } = await import('./session')
    await expect(requestPortalCode('acme', 'ramesh@kalpa.in')).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Too many/) })
    await expect(verifyPortalCode('acme', 'ramesh@kalpa.in', '123456')).resolves.toMatchObject({ ok: false })
  })

  it('a right code starts a host-only /portal session once; a wrong one counts an attempt', async () => {
    const { requestPortalCode, verifyPortalCode } = await import('./session')
    await requestPortalCode('acme', 'ramesh@kalpa.in')
    const code = sent[0].secrets![0]
    const wrong = code === '000000' ? '111111' : '000000'
    await expect(verifyPortalCode('acme', 'ramesh@kalpa.in', wrong)).resolves.toMatchObject({ ok: false })
    expect(store.PortalCode[0].attempts).toBe(1)
    await expect(verifyPortalCode('acme', 'ramesh@kalpa.in', code)).resolves.toEqual({ ok: true })
    const cookie = jar.get(PORTAL_COOKIE)!
    expect(cookie.opts).toMatchObject({ httpOnly: true, path: '/portal', secure: true, sameSite: 'lax' })
    expect(cookie.opts).not.toHaveProperty('domain')
    expect(store.PortalSession).toHaveLength(1)
    expect(store.PortalSession[0].tokenHash).not.toBe(cookie.value)
    await expect(verifyPortalCode('acme', 'ramesh@kalpa.in', code)).resolves.toMatchObject({ ok: false })
  })

  it('a code from another workspace does not open this one', async () => {
    const { requestPortalCode, verifyPortalCode } = await import('./session')
    await requestPortalCode('other', 'ramesh@kalpa.in')
    const code = sent[0].secrets![0]
    expect(store.PortalCode[0].orgId).toBe(OTHER_ORG)
    await expect(verifyPortalCode('acme', 'ramesh@kalpa.in', code)).resolves.toMatchObject({ ok: false })
    expect(store.PortalCode[0].codeHash).toBe(hashOtp(code, SECRET))
  })
})

describe('portal isolation and approvals', () => {
  beforeEach(seed)

  async function signIn(slug = 'acme') {
    const { requestPortalCode, verifyPortalCode, getPortalViewer } = await import('./session')
    await requestPortalCode(slug, 'ramesh@kalpa.in')
    await verifyPortalCode(slug, 'ramesh@kalpa.in', sent[sent.length - 1].secrets![0])
    return getPortalViewer(slug)
  }

  it('a session never opens another workspace’s portal, and ends when the client or contact loses access', async () => {
    const viewer = await signIn('acme')
    expect(viewer?.client.name).toBe('Kalpa Foods')
    const { getPortalViewer } = await import('./session')
    expect(await getPortalViewer('other')).toBeNull()
    store.Client[0].portal = { enabled: false }
    expect(await getPortalViewer('acme')).toBeNull()
    store.Client[0].portal = { enabled: true }
    expect(await getPortalViewer('acme')).not.toBeNull()
    store.PortalContact[0].status = 'revoked'
    expect(await getPortalViewer('acme')).toBeNull()
  })

  it('sees only its own shared projects, visible tasks and files', async () => {
    const viewer = (await signIn())!
    const { sharedProjects, visibleTasks, portalCanReadFile } = await import('./queries')
    const projects = await sharedProjects(viewer)
    expect(projects.map((p) => p.name)).toEqual(['Kalpa site'])
    const tasks = await visibleTasks(viewer, projects.map((p) => p._id as never))
    expect(tasks.map((t) => t.key)).toEqual(['KAL-1'])
    expect(await portalCanReadFile(viewer, 'e1'.padEnd(24, '0'))).toBe(true)
    expect(await portalCanReadFile(viewer, 'e2'.padEnd(24, '0'))).toBe(false)
    expect(await portalCanReadFile(viewer, 'e3'.padEnd(24, '0'))).toBe(false)
  })

  it('approves its own item once, logs it on the task as the contact and tells the team', async () => {
    const viewer = (await signIn())!
    const { decideApproval } = await import('./approvals')
    await decideApproval(viewer, { taskId: 't1'.padEnd(24, '0'), decision: 'approved', comment: 'Looks great' })
    expect(store.Task[0].approval).toMatchObject({ status: 'approved', decidedByName: 'Ramesh', comment: 'Looks great' })
    expect(store.TaskActivity[0]).toMatchObject({ type: 'client_approved', meta: { portalContact: 'Ramesh', client: 'Kalpa Foods' } })
    expect(notified[0].title).toMatch(/Ramesh \(Kalpa Foods\) approved KAL-1/)
    expect(notified[0].ids.map(String)).toEqual(['m1'.padEnd(24, '0'), 'm2'.padEnd(24, '0')])
    await expect(decideApproval(viewer, { taskId: 't1'.padEnd(24, '0'), decision: 'approved', comment: '' })).rejects.toThrow(/no longer waiting/)
  })

  it('cannot decide another client’s item, a hidden task or one in an unshared project', async () => {
    const viewer = (await signIn())!
    const { decideApproval } = await import('./approvals')
    await expect(decideApproval(viewer, { taskId: 't4'.padEnd(24, '0'), decision: 'approved', comment: '' })).rejects.toThrow(/That item/)
    await expect(decideApproval(viewer, { taskId: 't2'.padEnd(24, '0'), decision: 'approved', comment: '' })).rejects.toThrow(/That item/)
    await expect(decideApproval(viewer, { taskId: 't3'.padEnd(24, '0'), decision: 'approved', comment: '' })).rejects.toThrow(/That item/)
    expect(store.Task[3].approval).toEqual({ status: 'requested' })
  })

  it('asking for changes needs a comment', async () => {
    const viewer = (await signIn())!
    const { decideApproval } = await import('./approvals')
    await expect(decideApproval(viewer, { taskId: 't1'.padEnd(24, '0'), decision: 'changes_requested', comment: '' })).rejects.toThrow(/what to change/)
    await decideApproval(viewer, { taskId: 't1'.padEnd(24, '0'), decision: 'changes_requested', comment: 'Use the green logo' })
    expect(store.TaskActivity[0]).toMatchObject({ type: 'client_changes_requested' })
  })
})

describe('portal sign-in does not reveal who is a contact (night check)', () => {
  it('answers a stranger exactly like a contact with a wrong code', async () => {
    const { requestPortalCode, verifyPortalCode } = await import('./session')
    await requestPortalCode('acme', 'stranger@example.com')
    await requestPortalCode('acme', 'ramesh@kalpa.in')
    const stranger = await verifyPortalCode('acme', 'stranger@example.com', '000000')
    const contact = await verifyPortalCode('acme', 'ramesh@kalpa.in', '000000')
    expect(stranger).toEqual(contact)
    expect(await verifyPortalCode('no-such-slug', 'ramesh@kalpa.in', '000000')).toEqual(contact)
  })
})

describe('portal invoice list (8.1)', () => {
  it('leaves out opening-balance rows, which have no document page', () => {
    const filter = portalInvoiceFilter('client1')
    expect(filter).toMatchObject({ clientId: 'client1', billingType: { $ne: 'opening' } })
    expect(filter.status.$in).toEqual(['issued', 'part_paid', 'paid'])
  })
})

describe('portal code refusals (8.3)', () => {
  beforeEach(seed)

  it('a contact out of tries, or with a used code, hears the same as a stranger', async () => {
    const { requestPortalCode, verifyPortalCode } = await import('./session')
    await requestPortalCode('acme', 'ramesh@kalpa.in')
    const code = sent[0].secrets![0]
    const wrong = code === '000000' ? '111111' : '000000'
    const stranger = await verifyPortalCode('acme', 'stranger@example.com', wrong)
    expect(stranger).toEqual({ ok: false, error: PORTAL_CODE_REFUSAL })
    for (let i = 0; i < 5; i++) expect(await verifyPortalCode('acme', 'ramesh@kalpa.in', wrong)).toEqual(stranger)
    // Out of tries: even the right code is refused, with the same words, and no sixth guess is counted.
    expect(await verifyPortalCode('acme', 'ramesh@kalpa.in', code)).toEqual(stranger)
    expect(store.PortalCode[0].attempts).toBe(5)
  })

  it('a used code is refused with the same words', async () => {
    const { requestPortalCode, verifyPortalCode } = await import('./session')
    await requestPortalCode('acme', 'ramesh@kalpa.in')
    const code = sent[0].secrets![0]
    expect(await verifyPortalCode('acme', 'ramesh@kalpa.in', code)).toEqual({ ok: true })
    expect(await verifyPortalCode('acme', 'ramesh@kalpa.in', code)).toEqual({ ok: false, error: PORTAL_CODE_REFUSAL })
  })
})

describe('inactive clients (8.4)', () => {
  beforeEach(seed)

  it('refuses a client that is no longer active', () => {
    const org = { portalOn: true, deleted: false }
    const contact = { status: 'active' }
    expect(portalRefusal(org, { enabled: true, status: 'inactive' }, contact)).toBe('This portal is not available.')
    expect(portalRefusal(org, { enabled: true, status: 'active' }, contact)).toBeNull()
    expect(portalRefusal(org, { enabled: true }, contact)).toBeNull()
  })

  it('a signed-in contact loses the portal when their client is made inactive', async () => {
    const { requestPortalCode, verifyPortalCode, getPortalViewer } = await import('./session')
    await requestPortalCode('acme', 'ramesh@kalpa.in')
    await verifyPortalCode('acme', 'ramesh@kalpa.in', sent[0].secrets![0])
    expect(await getPortalViewer('acme')).not.toBeNull()
    store.Client[0].status = 'inactive'
    expect(await getPortalViewer('acme')).toBeNull()
  })
})
