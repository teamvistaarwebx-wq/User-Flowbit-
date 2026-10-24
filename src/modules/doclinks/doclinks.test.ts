import { describe, expect, it } from 'vitest'
import { isPayable, isPubliclyVisible, normalizeUtr, orgServesLinks, quoteDecision, UTR_PATTERN } from './access'
import { buildDocTimeline } from './timeline'
import { linkState, newLinkKey, readLinkToken, shouldRecordOpen, signLinkToken } from './token'
import { canManageLink } from './link-perms'
import { planPortalLinks } from './portal-links'

const SECRET = 'x'.repeat(48)
const NOW = new Date('2026-10-08T06:00:00Z')

describe('document link tokens', () => {
  it('signs and reads back a random key', () => {
    const key = newLinkKey()
    expect(key).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(newLinkKey()).not.toBe(key)
    expect(readLinkToken(signLinkToken(key, SECRET), SECRET)).toBe(key)
  })

  it('refuses a forged, tampered, re-signed or malformed token', () => {
    const key = newLinkKey()
    const token = signLinkToken(key, SECRET)
    expect(readLinkToken(token, 'y'.repeat(48))).toBeNull()
    expect(readLinkToken(`${newLinkKey()}.${token.split('.')[1]}`, SECRET)).toBeNull()
    expect(readLinkToken(`${token}x`, SECRET)).toBeNull()
    expect(readLinkToken(`${token}.extra`, SECRET)).toBeNull()
    expect(readLinkToken('507f1f77bcf86cd799439011', SECRET)).toBeNull()
    expect(readLinkToken('', SECRET)).toBeNull()
    expect(readLinkToken(null, SECRET)).toBeNull()
  })

  it('is active until revoked or past its expiry', () => {
    expect(linkState({}, NOW)).toBe('active')
    expect(linkState({ expiresAt: new Date(NOW.getTime() + 1000) }, NOW)).toBe('active')
    expect(linkState({ expiresAt: NOW }, NOW)).toBe('expired')
    expect(linkState({ revokedAt: new Date('2026-10-01'), expiresAt: new Date('2027-01-01') }, NOW)).toBe('revoked')
  })

  it('counts one open per half hour', () => {
    expect(shouldRecordOpen(null, NOW)).toBe(true)
    expect(shouldRecordOpen(new Date(NOW.getTime() - 10 * 60_000), NOW)).toBe(false)
    expect(shouldRecordOpen(new Date(NOW.getTime() - 31 * 60_000), NOW)).toBe(true)
  })
})

describe('public page access rules', () => {
  it('never shows drafts or opening balances; shows a void invoice', () => {
    expect(isPubliclyVisible({ kind: 'invoice', status: 'draft' })).toBe(false)
    expect(isPubliclyVisible({ kind: 'invoice', status: 'issued', billingType: 'opening' })).toBe(false)
    expect(isPubliclyVisible({ kind: 'invoice', status: 'void' })).toBe(true)
    expect(isPubliclyVisible({ kind: 'credit_note', status: 'draft' })).toBe(false)
    expect(isPubliclyVisible({ kind: 'quote', status: 'draft' })).toBe(true)
    expect(isPubliclyVisible({ kind: 'receipt', status: 'recorded' })).toBe(true)
  })

  it('lets a client accept or decline only an open, unexpired quote', () => {
    expect(quoteDecision({ status: 'sent', validUntil: '2026-10-08' }, '2026-10-08')).toEqual({ open: true })
    expect(quoteDecision({ status: 'draft', validUntil: '2026-10-30' }, '2026-10-08')).toEqual({ open: true })
    expect(quoteDecision({ status: 'sent', validUntil: '2026-10-07' }, '2026-10-08').open).toBe(false)
    expect(quoteDecision({ status: 'accepted', validUntil: '2026-10-30' }, '2026-10-08').open).toBe(false)
    expect(quoteDecision({ status: 'converted', validUntil: '2026-10-30' }, '2026-10-08').open).toBe(false)
    expect(quoteDecision({ status: 'declined', validUntil: '2026-10-30' }, '2026-10-08').open).toBe(false)
  })

  it('offers payment only while money is owed on an issued invoice', () => {
    expect(isPayable({ status: 'issued', balancePaise: 100 })).toBe(true)
    expect(isPayable({ status: 'part_paid', balancePaise: 100 })).toBe(true)
    expect(isPayable({ status: 'paid', balancePaise: 0 })).toBe(false)
    expect(isPayable({ status: 'void', balancePaise: 100 })).toBe(false)
    expect(isPayable({ status: 'issued', balancePaise: 0 })).toBe(false)
  })

  it('accepts UTRs and UPI references, nothing else', () => {
    expect(normalizeUtr(' hdfc-r5 2026 1008 ')).toBe('HDFCR520261008')
    expect(UTR_PATTERN.test('412345678901')).toBe(true)
    expect(UTR_PATTERN.test('12345')).toBe(false)
    expect(UTR_PATTERN.test('<script>')).toBe(false)
  })
})

describe('document timeline', () => {
  it('merges sends, delivery ticks, opens, acceptance and payment in time order', () => {
    const at = (m: number) => new Date(NOW.getTime() + m * 60_000)
    const entries = buildDocTimeline(
      [
        { channel: 'email', status: 'delivered', to: ['a@b.in'], createdAt: at(0), sentAt: at(1), timeline: [{ at: at(0), status: 'queued' }, { at: at(1), status: 'sent' }, { at: at(2), status: 'delivered' }] },
        { channel: 'email', status: 'failed', createdAt: at(30), timeline: [{ at: at(31), status: 'failed', note: 'Bounced' }] },
      ],
      [
        { type: 'opened', at: at(10) },
        { type: 'accepted', at: at(20), name: 'Ravi Kumar', comment: 'Go ahead' },
        { type: 'paid', at: at(40), amountPaise: 118000 },
      ],
    )
    expect(entries.map((e) => e.label)).toEqual(['Sent by email', 'Delivered by email', 'Opened the link', 'Accepted by Ravi Kumar', 'Not delivered by email', 'Paid online'])
    expect(entries.at(-1)?.detail).toBe('₹1,180.00')
    expect(entries[4].detail).toBe('Bounced')
  })
})

describe('public link permissions per document type (6.11)', () => {
  const only = (...perms: string[]) => (perm: string) => perms.includes(perm)

  it('receipts.write alone manages receipt links, not quote or invoice links', () => {
    expect(canManageLink('receipt', only('receipts.write'))).toBe(true)
    expect(canManageLink('quote', only('receipts.write'))).toBe(false)
    expect(canManageLink('invoice', only('receipts.write'))).toBe(false)
  })

  it('each kind needs its own write permission', () => {
    expect(canManageLink('invoice', only('invoices.issue'))).toBe(true)
    expect(canManageLink('quote', only('quotes.write'))).toBe(true)
    expect(canManageLink('credit_note', only('credit_notes.write'))).toBe(true)
    expect(canManageLink('credit_note', only('invoices.write'))).toBe(false)
  })
})

describe('links of a disabled or deleted workspace (6.14)', () => {
  it('an active workspace serves its links', () => {
    expect(orgServesLinks({ disabled: false, deletedAt: null, status: 'active' })).toBe(true)
    expect(orgServesLinks({})).toBe(true)
  })

  it('a disabled, soft-deleted, purged or missing workspace serves none', () => {
    expect(orgServesLinks({ disabled: true })).toBe(false)
    expect(orgServesLinks({ deletedAt: new Date() })).toBe(false)
    expect(orgServesLinks({ status: 'deleted' })).toBe(false)
    expect(orgServesLinks(null)).toBe(false)
  })
})

describe('portal document links in one pass (8.5)', () => {
  const now = new Date('2026-10-11T00:00:00Z')
  const at = (iso: string) => new Date(iso)

  it('uses the live link, hides a turned-off document, and creates links only for the rest', () => {
    const plan = planPortalLinks(['a', 'b', 'c', 'd'], [
      { docId: 'a', key: 'ka-old', revokedAt: at('2026-10-01'), createdAt: at('2026-09-01') },
      { docId: 'a', key: 'ka', revokedAt: null, createdAt: at('2026-10-02') },
      { docId: 'b', key: 'kb', revokedAt: at('2026-10-05'), createdAt: at('2026-09-01') },
      { docId: 'c', key: 'kc', expiresAt: at('2026-10-01'), createdAt: at('2026-09-01') },
    ], now)
    expect([...plan.live]).toEqual([['a', 'ka']])
    expect([...plan.hidden]).toEqual(['b'])
    expect(plan.create).toEqual(['c', 'd'])
  })
})
