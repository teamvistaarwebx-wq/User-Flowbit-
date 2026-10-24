import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { deliver, type DeliveryStore } from '@/modules/messaging/deliver'
import { whatsappAdapter } from '@/modules/messaging/channels/whatsapp'
import type { DeliverableMessage } from '@/modules/messaging/types'
import type { FetchLike } from '@/modules/payments/razorpay-links'
import { handleInbound, type InboxDeps } from './inbox-core'
import { INTERAKT_MESSAGE_URL, interaktProvider, interaktTemplatePayload, interaktTextPayload, senderFor } from './interakt'
import { formatPhone, toE164 } from './phone'
import { canMessageOnWhatsApp, waRecipients } from './recipients'
import { DEFAULT_WA_TEMPLATES, decodeWaParams, mergeWaRates, mergeWaTemplates, messageCostPaise, renderWaTemplate } from './templates'
import { canSendFreeText, parseInteraktEvent, verifyInteraktWebhook, windowMinutesLeft, type InteraktInboundEvent } from './webhook-event'

const HOUR = 3_600_000

describe('phone numbers', () => {
  it('normalises Indian mobiles to E.164 and refuses the rest', () => {
    expect(toE164('+91 98765-43210')).toBe('+919876543210')
    expect(toE164('09876543210')).toBe('+919876543210')
    expect(toE164('919876543210')).toBe('+919876543210')
    expect(toE164('12345')).toBeNull()
    expect(toE164('5876543210')).toBeNull()
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210')
  })
})

describe('Interakt payload building', () => {
  const bill = renderWaTemplate('bill_with_pdf', DEFAULT_WA_TEMPLATES, { name: 'Asha', number: 'FBB/2026-27/0007', amount: '₹1,758', dueDate: '15 Oct 2026' }, { headerUrl: 'https://app.useflowbit.com/api/public/bill/abc.def/pdf', fileName: 'Flowbit-FBB-2026-27-0007.pdf', buttonValue: 'abc.def' })

  it('puts body values in the registry order, the PDF header with its file name, and the URL button suffix', () => {
    const payload = interaktTemplatePayload({ to: '+919876543210', template: bill.template, params: bill.params, callbackData: 'msg1' })
    expect(payload).toEqual({
      countryCode: '+91',
      phoneNumber: '9876543210',
      callbackData: 'msg1',
      type: 'Template',
      template: {
        name: 'flowbit_bill_pdf',
        languageCode: 'en',
        bodyValues: ['Asha', 'FBB/2026-27/0007', '₹1,758', '15 Oct 2026'],
        headerValues: ['https://app.useflowbit.com/api/public/bill/abc.def/pdf'],
        fileName: 'Flowbit-FBB-2026-27-0007.pdf',
        buttonValues: { '0': ['abc.def'] },
      },
    })
  })

  it('follows a re-ordered variable list from the Console registry', () => {
    const registry = mergeWaTemplates({ due_reminder: { name: 'my_due', language: 'en_US', params: ['amount', 'name', 'number', 'dueDate'] } })
    const r = renderWaTemplate('due_reminder', registry, { name: 'Asha', number: 'B1', amount: '₹10', dueDate: 'today' }, { buttonValue: 'k.s' })
    expect(r.template).toBe('my_due')
    expect(decodeWaParams(r.params)).toMatchObject({ language: 'en_US', bodyValues: ['₹10', 'Asha', 'B1', 'today'], buttonValue: 'k.s', category: 'utility' })
  })

  it('omits header and buttons a template does not have, and refuses missing values', () => {
    const otp = renderWaTemplate('otp', DEFAULT_WA_TEMPLATES, { code: '123456' }, { buttonValue: '123456' })
    const payload = interaktTemplatePayload({ to: '+919876543210', template: otp.template, params: otp.params })
    expect(payload.template).toEqual({ name: 'flowbit_otp', languageCode: 'en', bodyValues: ['123456'], buttonValues: { '0': ['123456'] } })
    expect(otp.category).toBe('authentication')
    expect(() => renderWaTemplate('bill_with_pdf', DEFAULT_WA_TEMPLATES, { name: 'A', number: 'B', amount: 'C', dueDate: 'D' })).toThrow(/header document/)
    expect(() => renderWaTemplate('payment_link', DEFAULT_WA_TEMPLATES, { name: 'A', number: '', amount: 'C' }, { buttonValue: 'x' })).toThrow(/number/)
  })

  it('drops bad registry entries back to the defaults', () => {
    const merged = mergeWaTemplates({ otp: { name: 'Bad Name!', language: 'english', params: ['code', 'hack'] } })
    expect(merged.otp).toEqual(DEFAULT_WA_TEMPLATES.otp)
  })

  it('builds a free-text session reply', () => {
    expect(interaktTextPayload({ to: '+919876543210', text: 'Hello' })).toEqual({ countryCode: '+91', phoneNumber: '9876543210', type: 'Text', data: { message: 'Hello' } })
  })

  it('posts with Basic auth to Interakt and records the cost from the rate card', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => ({ ok: true, status: 201, json: async () => ({ result: true, id: 'ik_1' }) }))
    const rates = mergeWaRates({})
    const provider = interaktProvider({ name: 'interakt', apiKey: 'KEY', fetch: fetchFn, costOf: (c) => messageCostPaise(c, rates) })
    const outcome = await provider.sendTemplate({ id: 'm1', channel: 'whatsapp', to: ['+919876543210'], template: bill.template, params: bill.params })
    expect(outcome).toEqual({ ok: true, provider: 'interakt', providerId: 'ik_1', cost: 15 })
    expect(fetchFn).toHaveBeenCalledWith(INTERAKT_MESSAGE_URL, expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: 'Basic KEY' }) }))
    expect(messageCostPaise('authentication', rates)).toBe(12.8)
  })

  it('treats a 4xx as permanent and a 5xx as retryable', async () => {
    const reply = (status: number) => vi.fn<FetchLike>(async () => ({ ok: false, status, json: async () => ({ result: false, message: 'nope' }) }))
    const send = (status: number) => interaktProvider({ name: 'interakt', apiKey: 'K', fetch: reply(status), costOf: () => 0 }).sendTemplate({ id: 'm', channel: 'whatsapp', to: ['+919876543210'], template: 't', params: {} })
    expect(await send(400)).toEqual({ ok: false, error: 'nope', permanent: true })
    expect(await send(503)).toEqual({ ok: false, error: 'nope', permanent: false })
  })

  it('sends codes from the OTP account and everything else from the messages account', () => {
    const keys = { messages: 'MSG', otp: 'OTP' }
    expect(senderFor('otp', keys)).toEqual({ name: 'interakt-otp', apiKey: 'OTP' })
    expect(senderFor('subscription', keys)).toEqual({ name: 'interakt', apiKey: 'MSG' })
    expect(senderFor('otp', { messages: 'MSG', otp: '' })).toBeNull()
  })
})

describe('Interakt webhook', () => {
  const SECRET = 'wa-secret-123'

  it('accepts the shared token or an HMAC of the body, nothing else', () => {
    const raw = '{"type":"message_api_read"}'
    expect(verifyInteraktWebhook({ raw, token: SECRET }, SECRET)).toBe(true)
    expect(verifyInteraktWebhook({ raw, signature: createHmac('sha256', SECRET).update(raw).digest('hex') }, SECRET)).toBe(true)
    expect(verifyInteraktWebhook({ raw, token: 'wrong' }, SECRET)).toBe(false)
    expect(verifyInteraktWebhook({ raw, signature: 'abc' }, SECRET)).toBe(false)
    expect(verifyInteraktWebhook({ raw, token: SECRET }, '')).toBe(false)
  })

  it('maps sent, delivered, read and failed to message statuses with the callback id', () => {
    const body = (type: string, extra: Record<string, unknown> = {}) => ({ type, data: { message: { id: 'ik_1', callback_data: 'msg1', ...extra } } })
    expect(parseInteraktEvent(body('message_api_sent'))).toMatchObject({ kind: 'status', status: 'sent', callbackData: 'msg1', providerId: 'ik_1' })
    expect(parseInteraktEvent(body('message_api_delivered'))).toMatchObject({ status: 'delivered' })
    expect(parseInteraktEvent(body('message_api_read'))).toMatchObject({ status: 'read' })
    expect(parseInteraktEvent(body('message_api_failed', { channel_failure_reason: 'Number not on WhatsApp' }))).toMatchObject({ status: 'failed', error: 'Number not on WhatsApp' })
    expect(parseInteraktEvent({ type: 'something_else', data: {} })).toBeNull()
  })

  it('reads an inbound message with the sender number', () => {
    const event = parseInteraktEvent({ type: 'message_received', data: { customer: { country_code: '+91', phone_number: '9876543210', traits: { name: 'Asha' } }, message: { id: 'in1', message: 'STOP', received_at_utc: '2026-10-08T05:00:00Z' } } })
    expect(event).toEqual({ kind: 'inbound', phone: '+919876543210', name: 'Asha', text: 'STOP', providerId: 'in1', at: new Date('2026-10-08T05:00:00Z') })
  })
})

describe('the 24-hour window', () => {
  const now = new Date('2026-10-08T12:00:00Z')
  it('allows free text only within 24 hours of the last inbound message', () => {
    expect(canSendFreeText(new Date(now.getTime() - 23 * HOUR), now)).toBe(true)
    expect(canSendFreeText(new Date(now.getTime() - 24 * HOUR), now)).toBe(false)
    expect(canSendFreeText(null, now)).toBe(false)
    expect(windowMinutesLeft(new Date(now.getTime() - 23 * HOUR), now)).toBe(60)
  })
})

describe('inbound STOP and the auto-reply', () => {
  const event: InteraktInboundEvent = { kind: 'inbound', phone: '+919876543210', name: null, text: 'stop', providerId: 'in1', at: new Date() }
  const deps = (conversation = { id: 'c1', assignedTo: null as string | null, autoRepliedAt: null as Date | null }) => {
    const calls = { suppress: vi.fn(async () => {}), reply: vi.fn(async () => {}), markAutoReplied: vi.fn(async () => {}) }
    const d: InboxDeps = { record: async () => conversation, ...calls, supportEmail: 'support@useflowbit.com' }
    return { d, calls }
  }

  it('suppresses the number the same day on STOP and confirms, without the auto-reply', async () => {
    const { d, calls } = deps()
    expect(await handleInbound(d, event)).toEqual({ stopped: true, autoReplied: false, conversationId: 'c1' })
    expect(calls.suppress).toHaveBeenCalledWith('+919876543210')
    expect(calls.markAutoReplied).not.toHaveBeenCalled()
  })

  it('V2-REVIEW P2: a redelivered inbound (same provider id) is not stored or answered again', async () => {
    const { d, calls } = deps()
    const record = vi.fn(d.record)
    const outcome = await handleInbound({ ...d, record, claim: async (id) => id !== 'in1' }, event)
    expect(outcome.duplicate).toBe(true)
    expect(record).not.toHaveBeenCalled()
    expect(calls.reply).not.toHaveBeenCalled()
    expect(calls.suppress).not.toHaveBeenCalled()
  })

  it('V2-REVIEW P2: two deliveries at the same moment are handled once; a failed one is released for the retry', async () => {
    const { d, calls } = deps()
    const claimed = new Set<string>()
    const claim = async (id: string) => {
      await Promise.resolve()
      if (claimed.has(id)) return false
      claimed.add(id)
      return true
    }
    const results = await Promise.all([handleInbound({ ...d, claim }, event), handleInbound({ ...d, claim }, event)])
    expect(results.filter((r) => r.duplicate)).toHaveLength(1)
    expect(calls.suppress).toHaveBeenCalledTimes(1)
    const released: string[] = []
    const failing = { ...d, claim: async () => true, release: async (id: string) => void released.push(id), record: async () => Promise.reject(new Error('db down')) }
    await expect(handleInbound(failing, event)).rejects.toThrow('db down')
    expect(released).toEqual(['in1'])
  })

  it('auto-replies once a day to an unassigned conversation, never to an assigned one', async () => {
    const now = new Date('2026-10-08T12:00:00Z')
    const fresh = deps()
    expect((await handleInbound(fresh.d, { ...event, text: 'Hi, need help' }, now)).autoReplied).toBe(true)
    expect(fresh.calls.reply).toHaveBeenCalledWith(expect.anything(), '+919876543210', expect.stringContaining('support@useflowbit.com'))
    const recent = deps({ id: 'c1', assignedTo: null, autoRepliedAt: new Date(now.getTime() - 2 * HOUR) })
    expect((await handleInbound(recent.d, { ...event, text: 'Hello?' }, now)).autoReplied).toBe(false)
    const assigned = deps({ id: 'c1', assignedTo: 'staff1', autoRepliedAt: null })
    expect((await handleInbound(assigned.d, { ...event, text: 'Hello?' }, now)).autoReplied).toBe(false)
    expect(assigned.calls.reply).not.toHaveBeenCalled()
  })
})

describe('recipient opt-in', () => {
  const verified = new Date('2026-10-01')
  const users = [
    { id: 'u1', phone: '+919876543210', phoneVerifiedAt: verified, whatsapp: { optedInAt: verified } },
    { id: 'u2', phone: '+919811111111', phoneVerifiedAt: verified, whatsapp: { optedInAt: verified } },
    { id: 'u3', phone: '+919822222222', phoneVerifiedAt: null, whatsapp: { optedInAt: verified } },
    { id: 'u4', phone: '+919833333333', phoneVerifiedAt: verified, whatsapp: { optedInAt: verified, optedOutAt: new Date('2026-10-05') } },
    { id: 'u5', phone: '+919844444444', phoneVerifiedAt: verified, whatsapp: null },
  ]
  const member = (userId: string, role: string, status = 'active') => ({ userId, role, status })

  it('messages only owners and admins with a verified, opted-in number', () => {
    const members = [member('u1', 'owner'), member('u2', 'employee'), member('u3', 'admin'), member('u4', 'admin'), member('u5', 'admin')]
    expect(waRecipients(members, users)).toEqual(['+919876543210'])
  })

  it('never messages employees or inactive members, even when opted in', () => {
    expect(waRecipients([member('u2', 'manager'), member('u1', 'owner', 'disabled')], users)).toEqual([])
  })

  it('an opt-in after a STOP counts again', () => {
    expect(canMessageOnWhatsApp({ id: 'x', phone: '+919876543210', phoneVerifiedAt: verified, whatsapp: { optedOutAt: new Date('2026-10-02'), optedInAt: new Date('2026-10-03') } })).toBe(true)
  })
})

describe('email fallback', () => {
  const message: DeliverableMessage = { id: 'm1', channel: 'whatsapp', to: ['+919876543210'], template: 'flowbit_due_reminder', params: {}, attempts: 0, retry: true, fallback: { channel: 'email', to: ['owner@acme.in'] } }
  const store = () => {
    const save = vi.fn<DeliveryStore['save']>(async () => {})
    const fallback = vi.fn<DeliveryStore['fallback']>(async () => 'email1')
    return { save, fallback }
  }

  it('sends the email copy when WhatsApp is not configured', async () => {
    const s = store()
    const result = await deliver(message, { adapters: { whatsapp: whatsappAdapter(null) }, store: s })
    expect(result).toMatchObject({ status: 'skipped', skipReason: 'whatsapp_not_connected', fallbackId: 'email1' })
    expect(s.fallback).toHaveBeenCalledWith(message, 'email', ['owner@acme.in'])
  })

  it('sends the email copy when Interakt refuses for good', async () => {
    const s = store()
    const failing = interaktProvider({ name: 'interakt', apiKey: 'K', fetch: async () => ({ ok: false, status: 400, json: async () => ({ message: 'Template not approved' }) }), costOf: () => 0 })
    const result = await deliver(message, { adapters: { whatsapp: whatsappAdapter(failing) }, store: s })
    expect(result).toMatchObject({ status: 'failed', error: 'Template not approved', fallbackId: 'email1' })
  })
})
