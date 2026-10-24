import { describe, expect, it, vi } from 'vitest'
import { attemptDelivery, type Envelope } from './deliver'
import { webhookFromAutomation } from './events'
import { guardedLookup, postGuarded } from './http'
import { isRetryable, MAX_ATTEMPTS, nextAttemptAfter } from './retry'
import { signHeader, verifySignature } from './sign'
import { isBlockedAddress, resolvedProblem, webhookUrlProblem } from './ssrf'

const envelope: Envelope = { id: 'whd_1', event: 'task.created', created_at: '2026-10-09T00:00:00Z', workspace: 'acme', data: { id: 't1' } }

describe('HMAC signatures', () => {
  it('verifies a signature over t.body and refuses tampering and old timestamps', () => {
    const body = JSON.stringify(envelope)
    const now = 1_790_000_000
    const header = signHeader('whsec_secret_1234567890', body, now)
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    expect(verifySignature('whsec_secret_1234567890', body, header, now + 10)).toBe(true)
    expect(verifySignature('whsec_secret_1234567890', `${body} `, header, now)).toBe(false)
    expect(verifySignature('another-secret-123456', body, header, now)).toBe(false)
    expect(verifySignature('whsec_secret_1234567890', body, header, now + 301)).toBe(false)
    expect(verifySignature('whsec_secret_1234567890', body, 'garbage', now)).toBe(false)
  })
})

describe('retries', () => {
  it('backs off 1m, 5m, 30m, 2h, 6h, then gives up', () => {
    const now = new Date('2026-10-09T00:00:00Z')
    expect(nextAttemptAfter(1, now)?.getTime()).toBe(now.getTime() + 60_000)
    expect(nextAttemptAfter(5, now)?.getTime()).toBe(now.getTime() + 6 * 3_600_000)
    expect(nextAttemptAfter(MAX_ATTEMPTS, now)).toBeNull()
  })

  it('retries timeouts, 429 and 5xx but not other 4xx', () => {
    expect(isRetryable(null)).toBe(true)
    expect(isRetryable(503)).toBe(true)
    expect(isRetryable(429)).toBe(true)
    expect(isRetryable(404)).toBe(false)
    expect(isRetryable(200)).toBe(false)
  })

  it('signs each attempt and moves between delivered, queued and failed', async () => {
    const post = vi.fn(async () => ({ status: 200, error: null }))
    const ok = await attemptDelivery(envelope, 0, { url: 'https://hooks.example.com/x', secret: 's'.repeat(20) }, post)
    expect(ok).toMatchObject({ status: 'delivered', attempts: 1 })
    const [, body, headers] = post.mock.calls[0] as unknown as [string, string, Record<string, string>]
    expect(verifySignature('s'.repeat(20), body, headers['X-Flowbit-Signature'])).toBe(true)
    expect(headers['X-Flowbit-Event']).toBe('task.created')
    const retry = await attemptDelivery(envelope, 0, { url: 'https://x.example.com', secret: 'k'.repeat(20) }, async () => ({ status: 502, error: null }))
    expect(retry).toMatchObject({ status: 'queued', attempts: 1, error: 'HTTP 502' })
    const last = await attemptDelivery(envelope, MAX_ATTEMPTS - 1, { url: 'https://x.example.com', secret: 'k'.repeat(20) }, async () => ({ status: null, error: 'Timed out' }))
    expect(last).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS })
    const refused = await attemptDelivery(envelope, 0, { url: 'https://x.example.com', secret: 'k'.repeat(20) }, async () => ({ status: 410, error: null }))
    expect(refused.status).toBe('failed')
  })
})

describe('SSRF guard', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::a00:1', '2002:c0a8:0101::1', '::ffff:8.8.8.8', '::ffff:0:808:808', '64:ff9b::808:808', '64:ff9b:1::a00:1', '64:ff9b:1:ffff::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2'])('blocks %s (L12 adds the mapped, translated, NAT64 and Teredo ranges)', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '13.235.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888', '64:ff9b:2::1'])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false)
  })

  it('accepts only public http(s) URLs', () => {
    expect(webhookUrlProblem('https://hooks.zapier.com/hooks/catch/1/abc')).toBeNull()
    expect(webhookUrlProblem('ftp://example.com/x')).toMatch(/http/)
    expect(webhookUrlProblem('file:///etc/passwd')).toMatch(/http/)
    expect(webhookUrlProblem('http://user:pw@example.com')).toMatch(/credentials/)
    expect(webhookUrlProblem('http://localhost:3000/x')).toMatch(/not public/)
    expect(webhookUrlProblem('http://169.254.169.254/latest/meta-data')).toMatch(/private/)
    expect(webhookUrlProblem('http://[::1]:80/')).toMatch(/private/)
    expect(webhookUrlProblem('http://intranet/')).toMatch(/not public/)
  })

  it('refuses hosts that resolve to private addresses', async () => {
    expect(await resolvedProblem('https://evil.example.com/x', async () => ['93.184.216.34', '10.0.0.1'])).toMatch(/private/)
    expect(await resolvedProblem('https://ok.example.com/x', async () => ['93.184.216.34'])).toBeNull()
    expect(await resolvedProblem('https://nx.example.com/x', async () => { throw new Error('ENOTFOUND') })).toMatch(/resolve/)
  })

  it('blocks private addresses at connect time too', async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => guardedLookup('localhost', {}, (e) => resolve(e)))
    expect(err?.code).toBe('EBLOCKED')
    expect(await postGuarded('http://127.0.0.1:9/hook', '{}', {})).toMatchObject({ status: null, error: expect.stringMatching(/private/) })
  })
})

describe('automation events as webhooks', () => {
  it('maps lead, deal, invoice events and fires invoice.paid only when fully paid', () => {
    expect(webhookFromAutomation('deal.won', { entityId: 'd1', vars: { deal_title: 'Retainer' } })).toMatchObject({ event: 'deal.won', data: { id: 'd1', title: 'Retainer' } })
    expect(webhookFromAutomation('payment.received', { entityId: 'i1', vars: { balance_due_paise: 500 } })).toBeNull()
    expect(webhookFromAutomation('payment.received', { entityId: 'i1', vars: { balance_due_paise: 0, invoice_number: 'INV/1' } })).toMatchObject({ event: 'invoice.paid' })
    expect(webhookFromAutomation('quote.accepted', { entityId: 'q1' })).toBeNull()
  })
})
