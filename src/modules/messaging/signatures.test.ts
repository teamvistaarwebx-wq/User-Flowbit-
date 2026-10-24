import { describe, expect, it } from 'vitest'
import { readUnsubscribeToken, svixSignature, unsubscribeToken, verifyResendWebhook } from './signatures'

const SECRET = `whsec_${Buffer.from('a-very-secret-webhook-key-for-tests').toString('base64')}`
const BODY = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_1' } })
const NOW = new Date('2026-10-08T05:00:00Z')
const TS = String(Math.floor(NOW.getTime() / 1000))

const headers = (signature: string, timestamp = TS) => ({ id: 'msg_1', timestamp, signature })

describe('verifyResendWebhook', () => {
  it('accepts a delivery signed with the secret', () => {
    const sig = svixSignature(SECRET, 'msg_1', TS, BODY)
    expect(verifyResendWebhook(BODY, headers(`v1,${sig}`), SECRET, NOW)).toBe(true)
  })

  it('accepts when any of several signatures matches (secret rotation)', () => {
    const sig = svixSignature(SECRET, 'msg_1', TS, BODY)
    expect(verifyResendWebhook(BODY, headers(`v1,bm9wZQ== v1,${sig}`), SECRET, NOW)).toBe(true)
  })

  it('rejects a changed body, a wrong secret or a missing header', () => {
    const sig = svixSignature(SECRET, 'msg_1', TS, BODY)
    expect(verifyResendWebhook(BODY.replace('delivered', 'bounced'), headers(`v1,${sig}`), SECRET, NOW)).toBe(false)
    expect(verifyResendWebhook(BODY, headers(`v1,${sig}`), `whsec_${Buffer.from('other').toString('base64')}`, NOW)).toBe(false)
    expect(verifyResendWebhook(BODY, { id: null, timestamp: TS, signature: `v1,${sig}` }, SECRET, NOW)).toBe(false)
    expect(verifyResendWebhook(BODY, headers(`v1,${sig}`), '', NOW)).toBe(false)
  })

  it('rejects an old (replayed) or future delivery', () => {
    const old = String(Number(TS) - 6 * 60)
    expect(verifyResendWebhook(BODY, headers(`v1,${svixSignature(SECRET, 'msg_1', old, BODY)}`, old), SECRET, NOW)).toBe(false)
    const future = String(Number(TS) + 6 * 60)
    expect(verifyResendWebhook(BODY, headers(`v1,${svixSignature(SECRET, 'msg_1', future, BODY)}`, future), SECRET, NOW)).toBe(false)
  })

  it('ignores signatures of another version', () => {
    const sig = svixSignature(SECRET, 'msg_1', TS, BODY)
    expect(verifyResendWebhook(BODY, headers(`v2,${sig}`), SECRET, NOW)).toBe(false)
  })
})

describe('unsubscribe tokens', () => {
  const secret = 'x'.repeat(48)
  const claim = { orgId: '64b7f0c2a1b2c3d4e5f60718', email: 'Asha@Example.in' }

  it('round-trips the workspace and the lower-cased address', () => {
    const token = unsubscribeToken(claim, secret)
    expect(readUnsubscribeToken(token, secret)).toEqual({ orgId: claim.orgId, email: 'asha@example.in' })
  })

  it('rejects a tampered token or one signed with another secret', () => {
    const token = unsubscribeToken(claim, secret)
    const [, sig] = token.split('.')
    const forged = `${Buffer.from(`${claim.orgId}|boss@example.in`).toString('base64url')}.${sig}`
    expect(readUnsubscribeToken(forged, secret)).toBeNull()
    expect(readUnsubscribeToken(token, 'y'.repeat(48))).toBeNull()
    expect(readUnsubscribeToken('garbage', secret)).toBeNull()
  })
})
