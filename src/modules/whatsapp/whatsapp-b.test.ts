import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { deliver, type DeliveryStore } from '@/modules/messaging/deliver'
import type { ChannelAdapter, DeliverableMessage, OutgoingMessage } from '@/modules/messaging/types'
import type { FetchLike } from '@/modules/payments/razorpay-links'
import { automationTemplate } from '@/modules/automations/whatsapp-map'
import { memoryWalletStore } from '@/modules/wallet/memory-store'
import { DEFAULT_WALLET_SETTINGS } from '@/modules/wallet/rules'
import { alertTemplateFor, hrefSuffix } from './alert-templates'
import { buttonSuffix, CUSTOMER_TEMPLATE_SHAPES, DEFAULT_CUSTOMER_TEMPLATES, mergeCustomerTemplates, previewCustomerTemplate, reminderTemplateFor, renderCustomerTemplate } from './customer-templates'
import { INTERAKT_MESSAGE_URL } from './interakt'
import { normalizePhone, phonePattern, splitE164 } from './phone'
import { byoProvider, MANAGED_NOT_AVAILABLE, workspaceProvider } from './provider'
import { verifyInteraktWebhook, type InteraktInboundEvent, type InteraktStatusEvent } from './webhook-event'
import { handleWorkspaceEvent, matchInbound, type InboundMatch, type MatchCandidate, type ThreadRef, type WorkspaceInboundDeps } from './workspace-inbound'
import { NOT_CONNECTED, sendFromWorkspace, type WorkspaceSendDeps } from './workspace-core'

const APP = 'https://app.useflowbit.com'
const NOW = new Date('2026-10-08T06:30:00Z')

describe('E.164 normalisation', () => {
  it('reads Indian numbers in any format with +91 as the default', () => {
    for (const raw of ['98765 43210', '+91 98765-43210', '09876543210', '919876543210', '(+91) 98765 43210']) expect(normalizePhone(raw)).toBe('+919876543210')
  })

  it('keeps other countries only with a + (or 00) and a known country code', () => {
    expect(normalizePhone('+971 50 123 4567')).toBe('+971501234567')
    expect(normalizePhone('0044 7700 900123')).toBe('+447700900123')
    expect(normalizePhone('+1 415 555 0101')).toBe('+14155550101')
    expect(normalizePhone('5012345')).toBeNull()
    expect(normalizePhone('+999 1234567')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('+91 12345 67890')).toBeNull()
  })

  it('every pack template lists its variables in the order they appear in the text ({{1}}, {{2}}…)', () => {
    for (const [key, shape] of Object.entries(CUSTOMER_TEMPLATE_SHAPES)) {
      const order = [...shape.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
      expect(order, key).toEqual([...shape.variables])
    }
  })

  it('splits for Interakt and finds a stored number however it was typed', () => {
    expect(splitE164('+919876543210')).toEqual({ countryCode: '+91', phoneNumber: '9876543210' })
    expect(splitE164('+971501234567')).toEqual({ countryCode: '+971', phoneNumber: '501234567' })
    const pattern = phonePattern('+919876543210')
    expect(pattern.test('+91 98765-43210')).toBe(true)
    expect(pattern.test('098765 43210')).toBe(true)
    expect(pattern.test('98765 43211')).toBe(false)
  })
})

describe('customer template pack', () => {
  it('renders an invoice share with the PDF header and the doc-link button, in the mapped order', () => {
    const registry = mergeCustomerTemplates({ invoice_share: { name: 'acme_invoice', language: 'hi', category: 'utility', params: ['name', 'number', 'amount', 'dueDate', 'business'] } })
    const r = renderCustomerTemplate('invoice_share', registry, { name: 'Ravi', business: 'Acme', number: 'INV/1', amount: '₹1,180.00', dueDate: '15 Oct 2026' }, { headerUrl: `${APP}/d/k.s/pdf`, fileName: 'Invoice-INV-1.pdf', buttonValue: 'd/k.s' })
    expect(r.template).toBe('acme_invoice')
    expect(r.params).toMatchObject({ _lang: 'hi', _category: 'utility', body_1: 'Ravi', body_2: 'INV/1', body_5: 'Acme', header_url: `${APP}/d/k.s/pdf`, button_0: 'd/k.s' })
  })

  it('falls back to the pack default for a bad mapping row, and refuses missing values', () => {
    const registry = mergeCustomerTemplates({ quote_share: { name: 'Bad Name', language: 'en', params: ['name'] }, receipt_thanks: { name: 'ok_name', language: 'en', params: ['salary'] } })
    expect(registry.quote_share).toEqual(DEFAULT_CUSTOMER_TEMPLATES.quote_share)
    expect(registry.receipt_thanks).toEqual(DEFAULT_CUSTOMER_TEMPLATES.receipt_thanks)
    expect(() => renderCustomerTemplate('invoice_share', registry, { name: 'R' })).toThrow(/missing/)
  })

  it('previews the pack text, picks the reminder by due date and builds button suffixes', () => {
    expect(previewCustomerTemplate('reminder_overdue', { name: 'Ravi', business: 'Acme', number: 'INV/1', amount: '₹10', days: '5' })).toBe('Hi Ravi, a reminder from Acme: invoice INV/1 for ₹10 is 5 days overdue. Please pay, or reply if something is holding it up.')
    expect([reminderTemplateFor(-3), reminderTemplateFor(0), reminderTemplateFor(4)]).toEqual(['reminder_before', 'reminder_due', 'reminder_overdue'])
    expect(buttonSuffix(`${APP}/d/abc.def`, `${APP}/`)).toBe('d/abc.def')
    expect(buttonSuffix('https://evil.example/d/abc', APP)).toBeNull()
  })
})

const okFetch = (id = 'ik_1') => vi.fn<FetchLike>(async () => ({ ok: true, status: 201, json: async () => ({ result: true, id }) }))

const outgoing = (over: Partial<OutgoingMessage> = {}): OutgoingMessage => {
  const r = renderCustomerTemplate('reminder_due', DEFAULT_CUSTOMER_TEMPLATES, { name: 'Ravi', business: 'Acme', number: 'INV/1', amount: '₹10' }, { buttonValue: 'd/k.s' })
  return { id: 'm1', channel: 'whatsapp', orgId: 'o1', to: ['+919876543210'], template: r.template, params: r.params, sender: 'workspace', attempts: 0, ...over }
}

describe('BYO Interakt adapter', () => {
  it("posts the template with the workspace's own key, our message id as callback data", async () => {
    const fetch = okFetch()
    const out = await byoProvider({ apiKey: 'WORKSPACE_KEY', fetch }).sendTemplate(outgoing())
    expect(out).toEqual({ ok: true, provider: 'interakt-byo', providerId: 'ik_1', cost: 0 })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(INTERAKT_MESSAGE_URL)
    expect(init.headers.authorization).toBe('Basic WORKSPACE_KEY')
    expect(JSON.parse(init.body!)).toEqual({ countryCode: '+91', phoneNumber: '9876543210', callbackData: 'm1', type: 'Template', template: { name: 'fb_reminder_due', languageCode: 'en', bodyValues: ['Ravi', 'Acme', 'INV/1', '₹10'], buttonValues: { '0': ['d/k.s'] } } })
  })
})

describe('mode switching', () => {
  it('BYO needs a key; managed is the "not available yet" stub', async () => {
    expect(workspaceProvider({ mode: 'byo', apiKey: null }, okFetch())).toBeNull()
    expect(workspaceProvider({ mode: 'byo', apiKey: 'k' }, okFetch())?.name).toBe('interakt-byo')
    const managed = workspaceProvider({ mode: 'managed', apiKey: null }, okFetch())
    expect(await managed?.sendTemplate(outgoing())).toEqual(MANAGED_NOT_AVAILABLE)
  })

  const deps = (mode: 'byo' | 'managed' | null, fetch = okFetch(), fee = 0, store = memoryWalletStore()): WorkspaceSendDeps & { store: typeof store } => ({
    store,
    connection: async () => (mode ? { mode, provider: workspaceProvider({ mode, apiKey: 'k' }, fetch) } : null),
    charge: { store },
    pricing: async () => ({ settings: { ...DEFAULT_WALLET_SETTINGS, byoFeePaise: fee }, allowance: 0 }),
    now: () => NOW,
  })

  it('not connected → skipped (email fallback); managed → nothing charged', async () => {
    expect(await sendFromWorkspace(deps(null), outgoing())).toEqual(NOT_CONNECTED)
    const d = deps('managed')
    d.store.set('o1', { paidPaise: 1000 })
    expect(await sendFromWorkspace(d, outgoing())).toEqual(MANAGED_NOT_AVAILABLE)
    expect(d.store.get('o1').paidPaise).toBe(1000)
  })

  it('BYO with a platform fee charges the wallet, refunds a refused send, and holds when empty', async () => {
    const d = deps('byo', okFetch(), 5)
    d.store.set('o1', { paidPaise: 7 })
    expect(await sendFromWorkspace(d, outgoing())).toMatchObject({ ok: true, cost: 5 })
    expect(d.store.get('o1').paidPaise).toBe(2)
    expect(await sendFromWorkspace(d, outgoing({ id: 'm2' }))).toMatchObject({ ok: false, hold: true, skip: 'wallet_empty' })
    const refusing = vi.fn<FetchLike>(async () => ({ ok: false, status: 400, json: async () => ({ result: false, message: 'Template not approved' }) }))
    const r = deps('byo', refusing, 5)
    r.store.set('o1', { paidPaise: 10 })
    expect(await sendFromWorkspace(r, outgoing())).toMatchObject({ ok: false, error: 'Template not approved', permanent: true })
    expect(r.store.get('o1').paidPaise).toBe(10)
  })
})

describe('automation WhatsApp: send vs fallback', () => {
  const vars = { client_name: 'Ravi', business_name: 'Acme', amount: '₹500.00', invoice_number: 'INV/7', receipt_number: 'RCT/3', receipt_link: `${APP}/d/rk.sig` }

  it('the payment thank-you uses the receipt template with its PDF and link', () => {
    expect(automationTemplate('payment_thank_you', vars, APP, '8 Oct 2026')).toEqual({
      key: 'receipt_thanks',
      values: { name: 'Ravi', business: 'Acme', amount: '₹500.00', number: 'INV/7' },
      extras: { headerUrl: `${APP}/d/rk.sig/pdf`, fileName: 'Receipt-RCT-3.pdf', buttonValue: 'd/rk.sig' },
    })
    expect(automationTemplate('overdue_30_alert', vars, APP, '8 Oct 2026')).toBeNull()
  })

  it('not connected: the WhatsApp message is skipped and the email copy goes instead', async () => {
    const adapter: ChannelAdapter = { channel: 'whatsapp', send: (m) => sendFromWorkspace({ connection: async () => null, charge: { store: memoryWalletStore() }, pricing: async () => ({ settings: DEFAULT_WALLET_SETTINGS, allowance: 0 }) }, m) }
    const fallback = vi.fn(async () => 'email1')
    const store: DeliveryStore = { save: async () => undefined, fallback }
    const message: DeliverableMessage = { ...outgoing(), attempts: 0, retry: true, fallback: { channel: 'email', to: ['ravi@acme.in'] } }
    expect(await deliver(message, { adapters: { whatsapp: adapter }, store, now: () => NOW })).toMatchObject({ status: 'skipped', skipReason: 'whatsapp_not_connected', fallbackId: 'email1' })
    expect(fallback).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 'email', ['ravi@acme.in'])
  })
})

describe('team alerts: the payslip rule', () => {
  it('a payslip alert says only that it is ready: no title, no body, no amount, no PDF', () => {
    const t = alertTemplateFor({ event: 'payroll.payslip_published', title: 'Your payslip for Sep: net pay ₹52,340', href: '/app/me/payslips/x' }, { name: 'Asha Rao', business: 'Acme' })
    expect(t).toEqual({ key: 'payslip_ready', values: { name: 'Asha', business: 'Acme' }, buttonValue: 'app/me/payslips' })
    expect(JSON.stringify(t)).not.toMatch(/₹|52/)
  })

  it('other payroll events carry no figures; security and Flowbit account notices never go', () => {
    expect(alertTemplateFor({ event: 'payroll.approved', title: 'Payroll ₹4,50,000 approved' }, { name: 'A', business: 'B' })?.values.update).not.toMatch(/₹/)
    expect(alertTemplateFor({ event: 'security.password_reset', title: 'x' }, { name: 'A', business: 'B' })).toBeNull()
    expect(alertTemplateFor({ event: 'subscription.trial_ending', title: 'x' }, { name: 'A', business: 'B' })).toBeNull()
    expect(alertTemplateFor({ event: 'letter.issued', title: 'x' }, { name: 'A', business: 'B' })).toBeNull()
  })

  it('maps approvals, leave decisions, meetings and tasks to their templates', () => {
    const who = { name: 'Asha', business: 'Acme' }
    expect(alertTemplateFor({ event: 'leave.requested', title: 'Ravi asked for 2 days off', href: '/app/hr/approvals' }, who)).toMatchObject({ key: 'approval_pending', buttonValue: 'app/hr/approvals' })
    expect(alertTemplateFor({ event: 'leave.approved', title: 'Your leave was approved' }, who)?.key).toBe('leave_decision')
    expect(alertTemplateFor({ event: 'meeting.invited', title: 'Standup at 10' }, who)?.key).toBe('meeting_reminder')
    expect(alertTemplateFor({ event: 'task.assigned', title: 'Fix\nlogin' }, who)).toMatchObject({ key: 'task_alert', values: { update: 'Fix login' } })
    expect(hrefSuffix('//evil.com')).toBe('app')
  })
})

describe('inbound matching', () => {
  const candidates: MatchCandidate[] = [
    { kind: 'member', id: 'u1', label: 'Asha (team)', phones: ['+91 98765 43210'] },
    { kind: 'lead', id: 'l1', label: 'Lead Co', phones: ['9876543210'] },
    { kind: 'client', id: 'c1', label: 'Acme', phones: [null, '098765-43210'] },
  ]

  it('prefers a client, then a lead, then a member, whatever the stored format', () => {
    expect(matchInbound('+919876543210', candidates)).toEqual({ kind: 'client', id: 'c1', label: 'Acme' })
    expect(matchInbound('+919876543210', candidates.slice(0, 2))?.kind).toBe('lead')
    expect(matchInbound('+919999999999', candidates)).toBeNull()
  })
})

/** Two workspaces' inbound state in memory, to prove routing and isolation. */
function inboundWorld() {
  const messages = [
    { orgId: 'A', id: 'mA', status: 'sent', providerId: 'pA' },
    { orgId: 'B', id: 'mB', status: 'sent', providerId: 'pB' },
  ]
  const suppressed = new Set<string>()
  const threads: { orgId: string; phone: string; match: InboundMatch | null; stopped: boolean }[] = []
  const leads: { orgId: string; phone: string }[] = []
  const refunds: string[] = []
  const replies: string[] = []
  const deps: WorkspaceInboundDeps = {
    async applyStatus(orgId, event) {
      const m = messages.find((x) => x.orgId === orgId && (x.id === event.callbackData || x.providerId === event.providerId))
      if (!m) return 'unknown'
      m.status = event.status
      if (event.status === 'failed') refunds.push(`${orgId}:${m.id}`)
      return 'applied'
    },
    candidates: async (orgId) => (orgId === 'A' ? [{ kind: 'client', id: 'c1', label: 'Acme', phones: ['+919876543210'] }] : []),
    async createLead(orgId, event) {
      leads.push({ orgId, phone: event.phone })
      return { kind: 'lead', id: `lead${leads.length}`, label: event.name ?? event.phone }
    },
    async record(orgId, event, match, flags) {
      threads.push({ orgId, phone: event.phone, match, stopped: flags.stop })
      return { id: `t${threads.length}`, assignedTo: null } satisfies ThreadRef
    },
    suppress: async (orgId, phone) => void suppressed.add(`${orgId}:${phone}`),
    unsuppress: async (orgId, phone) => void suppressed.delete(`${orgId}:${phone}`),
    reply: async (orgId, _t, phone, text) => void replies.push(`${orgId}:${phone}:${text}`),
    alert: async () => undefined,
    businessName: async (orgId) => (orgId === 'A' ? 'Acme' : 'Beta'),
  }
  return { deps, messages, suppressed, threads, leads, refunds, replies }
}

const inbound = (text: string, phone = '+919876543210'): InteraktInboundEvent => ({ kind: 'inbound', phone, name: 'Ravi', text, providerId: 'in1', at: NOW })
const status = (over: Partial<InteraktStatusEvent>): InteraktStatusEvent => ({ kind: 'status', status: 'delivered', providerId: null, callbackData: null, error: null, at: NOW, ...over })

describe('per-workspace webhook', () => {
  it("authenticates with the workspace's own secret only", () => {
    const raw = '{"type":"message_received"}'
    const sig = createHmac('sha256', 'secret-A-0123456789').update(raw).digest('hex')
    expect(verifyInteraktWebhook({ raw, signature: sig }, 'secret-A-0123456789')).toBe(true)
    expect(verifyInteraktWebhook({ raw, signature: sig }, 'secret-B-0123456789')).toBe(false)
    expect(verifyInteraktWebhook({ raw, token: 'secret-A-0123456789' }, 'secret-B-0123456789')).toBe(false)
  })

  it("moves only its own workspace's messages; a failed tick refunds that workspace", async () => {
    const w = inboundWorld()
    expect(await handleWorkspaceEvent(w.deps, 'A', status({ callbackData: 'mB', providerId: 'pB' }))).toBe('unknown')
    expect(w.messages.find((m) => m.id === 'mB')?.status).toBe('sent')
    expect(await handleWorkspaceEvent(w.deps, 'B', status({ providerId: 'pB', status: 'failed' }))).toBe('applied')
    expect(w.refunds).toEqual(['B:mB'])
  })

  it('V2-REVIEW P2: a redelivered inbound is ignored (no second thread message, no second paid STOP reply)', async () => {
    const w = inboundWorld()
    const claimed = new Set<string>()
    const deps = {
      ...w.deps,
      claim: async (orgId: string, providerId: string) => {
        const key = `${orgId}:${providerId}`
        if (claimed.has(key)) return false
        claimed.add(key)
        return true
      },
    }
    expect(await handleWorkspaceEvent(deps, 'A', inbound('STOP'))).toBe('stopped')
    w.replies.length = 0
    w.threads.length = 0
    expect(await handleWorkspaceEvent(deps, 'A', inbound('STOP'))).toBe('duplicate')
    expect(w.replies).toEqual([])
    expect(w.threads).toEqual([])
    expect(await handleWorkspaceEvent(deps, 'B', inbound('STOP'))).toBe('stopped')
  })

  it('STOP suppresses the number for that workspace only, confirms it, and START lifts it', async () => {
    const w = inboundWorld()
    expect(await handleWorkspaceEvent(w.deps, 'A', inbound('STOP'))).toBe('stopped')
    expect([...w.suppressed]).toEqual(['A:+919876543210'])
    expect(w.replies[0]).toMatch(/^A:\+919876543210:You will not get WhatsApp messages from Acme/)
    expect(await handleWorkspaceEvent(w.deps, 'A', inbound('start'))).toBe('started')
    expect(w.suppressed.size).toBe(0)
  })

  it('matches a known number in its workspace; an unknown one becomes a lead there', async () => {
    const w = inboundWorld()
    await handleWorkspaceEvent(w.deps, 'A', inbound('Hi, is the invoice ready?'))
    await handleWorkspaceEvent(w.deps, 'B', inbound('Hi, is the invoice ready?'))
    expect(w.threads[0]).toMatchObject({ orgId: 'A', match: { kind: 'client', id: 'c1' } })
    expect(w.threads[1]).toMatchObject({ orgId: 'B', match: { kind: 'lead' } })
    expect(w.leads).toEqual([{ orgId: 'B', phone: '+919876543210' }])
  })
})
