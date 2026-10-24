import { describe, expect, it } from 'vitest'
import type { ActionResult } from '@/lib/action-types'
import { CUSTOMER_TEMPLATE_SHAPES, DEFAULT_CUSTOMER_TEMPLATES, renderCustomerTemplate } from '@/modules/whatsapp/customer-templates'
import { interaktTemplatePayload } from '@/modules/whatsapp/interakt'
import { parseInteraktEvent } from '@/modules/whatsapp/webhook-event'
import { alertTemplateFor } from '@/modules/whatsapp/alert-templates'
import { KIND_RULES, mayStillDecide, noteProblem } from './kinds'
import { actionPayload, ACTION_LINK_TTL_MS, hashActionKey, invoicePaidPayload, linkProblem, newActionKey, parseQuickReply, quoteAcceptPayload, readActionToken, signActionToken } from './token'
import { spendActionLink, type ActionRow, type UseDeps } from './use'

const ok = (message: string): ActionResult => ({ ok: true, message })
const fail = (error: string): ActionResult => ({ ok: false, error })

const SECRET = 'test-secret-that-is-long-enough-for-hmac-signing-0123456789'
const NOW = new Date('2026-10-08T06:30:00Z')
const ORG = '665f0c0ffee0000000000001'
const USER = '665f0c0ffee0000000000002'
const MEMBER = '665f0c0ffee0000000000003'

/** In-memory links with the store's semantics: an atomic claim, spent on success, released on a refusal. */
function memoryLinks(rows: ActionRow[], execute: UseDeps['execute']) {
  const byHash = new Map<string, ActionRow>()
  const state = new Map<string, { usedAt: Date | null; claimedAt: Date | null }>()
  const deps: UseDeps = {
    secret: SECRET,
    async find(hash) {
      const row = byHash.get(hash)
      if (!row) return null
      const s = state.get(row.id)!
      return { ...row, usedAt: s.usedAt, claimedAt: s.claimedAt }
    },
    async claim(id, now) {
      const s = state.get(id)!
      if (s.usedAt || s.claimedAt) return false
      s.claimedAt = now
      return true
    },
    async finish(id, outcome) {
      const s = state.get(id)!
      if (outcome.ok) state.set(id, { usedAt: new Date(), claimedAt: null })
      else s.claimedAt = null
    },
    execute,
  }
  const issue = (row: Omit<ActionRow, 'id'>): string => {
    const key = newActionKey()
    const full = { ...row, id: String(byHash.size + 1) }
    byHash.set(hashActionKey(key), full)
    state.set(full.id, { usedAt: null, claimedAt: null })
    void rows
    return signActionToken(key, SECRET)
  }
  return { deps, issue, state }
}

const leaveRow = (over: Partial<ActionRow> = {}): Omit<ActionRow, 'id'> => ({
  orgId: ORG,
  kind: 'leave',
  subjectId: '665f0c0ffee00000000000aa',
  memberId: MEMBER,
  userId: USER,
  phone: null,
  choices: ['approve', 'reject'],
  expiresAt: new Date(NOW.getTime() + ACTION_LINK_TTL_MS),
  usedAt: null,
  claimedAt: null,
  ...over,
})

describe('action link tokens', () => {
  it('signs and verifies, and refuses a changed signature, another secret or junk', () => {
    const key = newActionKey()
    const token = signActionToken(key, SECRET)
    expect(readActionToken(token, SECRET)).toBe(key)
    expect(readActionToken(`${key}.${'A'.repeat(22)}`, SECRET)).toBeNull()
    expect(readActionToken(token, `${SECRET}-other`)).toBeNull()
    expect(readActionToken(`${token}.x`, SECRET)).toBeNull()
    expect(readActionToken('', SECRET)).toBeNull()
    expect(hashActionKey(key)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashActionKey(key)).not.toContain(key)
  })

  it('judges expiry, use, a running claim, the person, the number and the choice', () => {
    const base = { ...leaveRow(), id: '1' }
    expect(linkProblem(base, { userId: USER }, 'approve', NOW)).toBeNull()
    expect(linkProblem({ ...base, expiresAt: new Date(NOW.getTime() - 1) }, {}, 'approve', NOW)).toBe('expired')
    expect(linkProblem({ ...base, usedAt: NOW }, {}, 'approve', NOW)).toBe('used')
    expect(linkProblem({ ...base, claimedAt: new Date(NOW.getTime() - 10_000) }, {}, 'approve', NOW)).toBe('busy')
    expect(linkProblem({ ...base, claimedAt: new Date(NOW.getTime() - 10 * 60_000) }, {}, 'approve', NOW)).toBeNull()
    expect(linkProblem(base, { userId: '665f0c0ffee0000000000099' }, 'approve', NOW)).toBe('wrong_user')
    expect(linkProblem({ ...base, phone: '+919876543210' }, { phone: '+919000000000' }, 'approve', NOW)).toBe('wrong_user')
    expect(linkProblem(base, { orgId: '665f0c0ffee0000000000777' }, 'approve', NOW)).toBe('wrong_user')
    expect(linkProblem(base, {}, 'done', NOW)).toBe('wrong_choice')
  })

  it('needs the bound person signed in for bank-change and claim links (R1 4.1)', () => {
    const bank = { ...leaveRow({ kind: 'bank_change', choices: ['approve'] }), id: '1' }
    const claim = { ...leaveRow({ kind: 'claim' }), id: '2' }
    const leave = { ...leaveRow(), id: '3' }
    expect(linkProblem(bank, {}, 'approve', NOW)).toBe('sign_in')
    expect(linkProblem(bank, { phone: '+919876543210' }, 'approve', NOW)).toBe('sign_in')
    expect(linkProblem(claim, { userId: null }, 'approve', NOW)).toBe('sign_in')
    expect(linkProblem(bank, { userId: USER }, 'approve', NOW)).toBeNull()
    expect(linkProblem(bank, { userId: '665f0c0ffee0000000000099' }, 'approve', NOW)).toBe('wrong_user')
    expect(linkProblem(leave, {}, 'approve', NOW)).toBeNull()
  })

  it('offers buttons only while the person still holds the permission (R1 4.8)', () => {
    const can = (perm: string) => perm === 'leave.approve'
    expect(mayStillDecide({ perm: 'leave.approve' }, can)).toBe(true)
    expect(mayStillDecide({ perm: 'claims.review' }, can)).toBe(false)
    expect(mayStillDecide({ anyPerm: ['claims.review', 'leave.approve'] }, can)).toBe(true)
    expect(mayStillDecide({}, can)).toBe(true)
  })

  it('asks for a note on rejections the way the app does', () => {
    expect(noteProblem('leave', 'reject', '')).toMatch(/note/)
    expect(noteProblem('leave', 'approve', '')).toBeNull()
    expect(noteProblem('timesheet', 'reject', 'bad')).toMatch(/5 characters/)
    expect(noteProblem('timesheet', 'reject', 'wrong project')).toBeNull()
    expect(KIND_RULES.bank_change.choices).toEqual(['approve'])
  })
})

describe('using an action link', () => {
  it('runs once: the second press says it was already used', async () => {
    let runs = 0
    const { deps, issue } = memoryLinks([], async () => {
      runs += 1
      return ok('Leave approved for Asha, 2 days.')
    })
    const token = issue(leaveRow())
    const first = await spendActionLink(deps, { token, choice: 'approve', viewer: {}, now: NOW })
    expect(first).toMatchObject({ ok: true, message: 'Leave approved for Asha, 2 days.' })
    const second = await spendActionLink(deps, { token, choice: 'approve', viewer: {}, now: NOW })
    expect(second).toMatchObject({ ok: false, reason: 'used' })
    expect(runs).toBe(1)
  })

  it('refuses an expired link, another signed-in person and a bad token without running anything', async () => {
    let runs = 0
    const { deps, issue } = memoryLinks([], async () => {
      runs += 1
      return ok('done')
    })
    const expired = issue(leaveRow({ expiresAt: new Date(NOW.getTime() - 1000) }))
    expect(await spendActionLink(deps, { token: expired, choice: 'approve', viewer: {}, now: NOW })).toMatchObject({ ok: false, reason: 'expired' })
    const mine = issue(leaveRow())
    expect(await spendActionLink(deps, { token: mine, choice: 'approve', viewer: { userId: '665f0c0ffee0000000000099' }, now: NOW })).toMatchObject({ ok: false, reason: 'wrong_user' })
    expect(await spendActionLink(deps, { token: 'nope.nope', choice: 'approve', viewer: {}, now: NOW })).toMatchObject({ ok: false, reason: 'invalid' })
    expect(runs).toBe(0)
  })

  it('a locked month refuses the decision, releases the link and says why', async () => {
    let locked = true
    const { deps, issue, state } = memoryLinks([], async () => (locked ? fail('Attendance for October 2026 is locked, so this leave cannot be saved.') : ok('Leave approved.')))
    const token = issue(leaveRow())
    const refused = await spendActionLink(deps, { token, choice: 'approve', viewer: {}, now: NOW })
    expect(refused).toMatchObject({ ok: false, reason: 'refused' })
    expect(refused.message).toMatch(/locked/)
    expect(state.get('1')).toEqual({ usedAt: null, claimedAt: null })
    locked = false
    expect(await spendActionLink(deps, { token, choice: 'approve', viewer: {}, now: NOW })).toMatchObject({ ok: true })
  })

  it('two presses at once run the decision only once', async () => {
    let runs = 0
    const { deps, issue } = memoryLinks([], async () => {
      runs += 1
      await new Promise((r) => setTimeout(r, 5))
      return ok('done')
    })
    const token = issue(leaveRow())
    const results = await Promise.all([spendActionLink(deps, { token, choice: 'approve', viewer: {}, now: NOW }), spendActionLink(deps, { token, choice: 'approve', viewer: {}, now: NOW })])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(runs).toBe(1)
  })

  it('a rejection without a note asks for one first', async () => {
    const { deps, issue } = memoryLinks([], async () => ok('rejected'))
    const token = issue(leaveRow())
    expect(await spendActionLink(deps, { token, choice: 'reject', note: ' ', viewer: {}, now: NOW })).toMatchObject({ ok: false, reason: 'note' })
    expect(await spendActionLink(deps, { token, choice: 'reject', note: 'Team is short that week', viewer: {}, now: NOW })).toMatchObject({ ok: true })
  })

  it('a WhatsApp press from another number is refused', async () => {
    const { deps, issue } = memoryLinks([], async () => ok('done'))
    const token = issue(leaveRow({ phone: '+919876543210' }))
    expect(await spendActionLink(deps, { token, choice: 'approve', viewer: { phone: '+919111111111', orgId: ORG }, now: NOW })).toMatchObject({ ok: false, reason: 'wrong_user' })
    expect(await spendActionLink(deps, { token, choice: 'approve', viewer: { phone: '+919876543210', orgId: ORG }, now: NOW })).toMatchObject({ ok: true })
  })
})

describe('WhatsApp quick-reply payloads', () => {
  const token = signActionToken(newActionKey(), SECRET)

  it('round-trips action, quote and paid payloads and ignores anything else', () => {
    expect(parseQuickReply(actionPayload('approve', token))).toEqual({ type: 'action', choice: 'approve', token })
    expect(parseQuickReply(actionPayload('snooze', token))).toEqual({ type: 'action', choice: 'snooze', token })
    expect(parseQuickReply(quoteAcceptPayload(token))).toEqual({ type: 'quote_accept', docToken: token })
    expect(parseQuickReply(invoicePaidPayload(token))).toEqual({ type: 'invoice_paid', docToken: token })
    expect(parseQuickReply(`fb1:delete:${token}`)).toBeNull()
    expect(parseQuickReply('Approve')).toBeNull()
    expect(parseQuickReply(`fb1:approve:${token}:extra`)).toBeNull()
    expect(parseQuickReply(null)).toBeNull()
  })

  it('puts payloads after the URL button and sends them as Interakt buttonPayload', () => {
    const rendered = renderCustomerTemplate('approval_pending', DEFAULT_CUSTOMER_TEMPLATES, { name: 'Ravi', item: 'Asha asked for CL' }, { buttonValue: 'app/hr/leave', payloads: [actionPayload('approve', token), actionPayload('reject', token)] })
    expect(rendered.params.qr_1).toBe(actionPayload('approve', token))
    expect(rendered.params.qr_2).toBe(actionPayload('reject', token))
    const body = interaktTemplatePayload({ to: '+919876543210', template: rendered.template, params: rendered.params })
    expect(body.template.buttonValues).toEqual({ '0': ['app/hr/leave'] })
    expect(body.template.buttonPayload).toEqual({ '1': [actionPayload('approve', token)], '2': [actionPayload('reject', token)] })
    expect(CUSTOMER_TEMPLATE_SHAPES.quote_share.quickReplies).toEqual(['Accept'])
    expect(CUSTOMER_TEMPLATE_SHAPES.reminder_overdue.quickReplies).toEqual(["I've paid"])
  })

  it('reads a button press, a shared location and an ad referral from the webhook', () => {
    const press = parseInteraktEvent({ type: 'message_received', data: { customer: { country_code: '+91', phone_number: '9876543210' }, message: { id: 'm1', message_content_type: 'Button', message: 'Approve', button_payload: actionPayload('approve', token) } } })
    expect(press).toMatchObject({ kind: 'inbound', phone: '+919876543210', payload: actionPayload('approve', token), text: 'Approve' })
    const location = parseInteraktEvent({ type: 'message_received', data: { customer: { country_code: '+91', phone_number: '9876543210' }, message: { id: 'm2', message_content_type: 'Location', message: { latitude: 23.2599, longitude: 77.4126 } } } })
    expect(location).toMatchObject({ kind: 'inbound', location: { lat: 23.2599, lng: 77.4126 } })
    const ad = parseInteraktEvent({ type: 'message_received', data: { customer: { country_code: '+91', phone_number: '9876543210' }, message: { id: 'm3', message: 'Price?', referral: { source_type: 'ad', source_id: '1203', headline: 'Diwali offer' } } } })
    expect(ad).toMatchObject({ referral: { sourceType: 'ad', sourceId: '1203', headline: 'Diwali offer' } })
    expect(parseInteraktEvent({ type: 'message_received', data: { customer: { country_code: '+91', phone_number: '9876543210' }, message: { id: 'm4', message: '' } } })).toBeNull()
  })

  it('task alerts that can be acted on use the task template with Mark done / Snooze', () => {
    expect(alertTemplateFor({ event: 'task.due_today', title: "'Copy' is due today", href: '/app/work/tasks/1', action: { kind: 'task' } }, { name: 'Asha', business: 'Acme' })?.key).toBe('task_due')
    expect(alertTemplateFor({ event: 'leave.requested', title: 'Asha asked for CL', href: '/app/hr/leave', action: { kind: 'leave' } }, { name: 'Ravi', business: 'Acme' })?.key).toBe('approval_pending')
    expect(CUSTOMER_TEMPLATE_SHAPES.task_due.quickReplies).toEqual(['Mark done', 'Snooze 1 day'])
  })
})
