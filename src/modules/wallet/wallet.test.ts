import { describe, expect, it, vi } from 'vitest'
import { subscriptionInvoiceTotals } from '@/lib/billing'
import { deliver, holdRetryAt, HOLD_MS, type DeliveryStore } from '@/modules/messaging/deliver'
import type { ChannelAdapter, DeliverableMessage } from '@/modules/messaging/types'
import { chargeForMessage, debitKeyOf, refundCharge, type ChargeDeps } from './charge'
import { memoryWalletStore } from './memory-store'
import { applyRecharge, rechargeLines, rechargeMoneyFromLink, WALLET_LINK_KIND, type RechargeDeps, type RechargeMoney } from './recharge-core'
import {
  alertFor,
  allowanceTier,
  applyDebit,
  applyRefund,
  bonusFor,
  DEFAULT_WALLET_SETTINGS,
  EMPTY_WALLET,
  expiringPaise,
  freeLeft,
  mergeWalletSettings,
  messagePricePaise,
  paidExpiryFrom,
  rechargeQuote,
  rechargeRefusal,
  takeFreeMessage,
  type CreditLot,
  type WalletState,
} from './rules'

const NOW = new Date('2026-10-08T06:30:00Z') // 12:00 IST
const wallet = (over: Partial<WalletState> = {}): WalletState => ({ ...EMPTY_WALLET, ...over })
const managed = { ...DEFAULT_WALLET_SETTINGS }

describe('wallet arithmetic', () => {
  it('spends promo credit first, then paid, in whole paise', () => {
    const r = applyDebit(wallet({ promoPaise: 10, paidPaise: 100 }), 25, NOW)
    expect(r).toMatchObject({ ok: true, fromPromo: 10, fromPaid: 15 })
    if (r.ok) expect(r.next).toMatchObject({ promoPaise: 0, paidPaise: 85, spent: { day: '2026-10-08', dayPaise: 25, month: '2026-10', monthPaise: 25 } })
  })

  it('never overdraws: a debit larger than the balance is refused and nothing changes', () => {
    const w = wallet({ promoPaise: 5, paidPaise: 15 })
    expect(applyDebit(w, 25, NOW)).toEqual({ ok: false, reason: 'insufficient' })
    expect(applyDebit(w, 20, NOW)).toMatchObject({ ok: true, fromPromo: 5, fromPaid: 15 })
    expect(() => applyDebit(w, 2.5, NOW)).toThrow(/whole number/)
    expect(() => applyDebit(w, 0, NOW)).toThrow()
  })

  it('refuses past the daily and monthly caps, and counts a new day from zero', () => {
    const w = wallet({ paidPaise: 10_000, caps: { dailyPaise: 50, monthlyPaise: 120 }, spent: { day: '2026-10-08', dayPaise: 40, month: '2026-10', monthPaise: 100 } })
    expect(applyDebit(w, 25, NOW)).toEqual({ ok: false, reason: 'daily_cap' })
    const tomorrow = new Date('2026-10-09T06:30:00Z')
    expect(applyDebit(w, 25, tomorrow)).toEqual({ ok: false, reason: 'monthly_cap' })
    expect(applyDebit(w, 20, tomorrow)).toMatchObject({ ok: true })
    const nextMonth = new Date('2026-11-01T06:30:00Z')
    expect(applyDebit(w, 50, nextMonth)).toMatchObject({ ok: true })
  })

  it('a refund puts money back into the bucket it came from and off the caps', () => {
    const start = wallet({ promoPaise: 10, paidPaise: 100 })
    const d = applyDebit(start, 25, NOW)
    if (!d.ok) throw new Error('debit refused')
    const back = applyRefund(d.next, { fromPromo: d.fromPromo, fromPaid: d.fromPaid, at: NOW }, NOW)
    expect(back).toMatchObject({ promoPaise: 10, paidPaise: 100, spent: { dayPaise: 0, monthPaise: 0 } })
  })

  it('prices: BYO charges only the platform fee (₹0 default), managed the rate card', () => {
    expect(messagePricePaise('byo', 'marketing', managed)).toBe(0)
    expect(messagePricePaise('byo', 'utility', { ...managed, byoFeePaise: 5 })).toBe(5)
    expect(messagePricePaise('managed', 'utility', managed)).toBe(25)
    expect(messagePricePaise('managed', 'marketing', managed)).toBe(125)
    expect(messagePricePaise('managed', 'authentication', managed)).toBe(20)
    expect(mergeWalletSettings({ rates: { utility: 30, marketing: -1 }, byoFeePaise: 2.5, allowance: { suite: 5000 } })).toMatchObject({ rates: { utility: 30, marketing: 125 }, byoFeePaise: 0, allowance: { free: 0, suite: 5000 } })
  })
})

describe('free allowance', () => {
  it('Free plan gets none; paid plans get their monthly allowance, which resets each month', () => {
    expect(allowanceTier({ accountType: 'free', plan: 'trial' })).toBe('free')
    expect(allowanceTier({ accountType: 'trial', plan: 'trial' })).toBe('trial')
    expect(allowanceTier({ accountType: 'paid', plan: 'suite' })).toBe('suite')
    expect(allowanceTier({ accountType: 'paid', plan: 'custom' })).toBe('custom')
    expect(DEFAULT_WALLET_SETTINGS.allowance.free).toBe(0)
    let w = wallet()
    for (let i = 0; i < 2; i += 1) w = takeFreeMessage(w, 2, NOW) ?? w
    expect(takeFreeMessage(w, 2, NOW)).toBeNull()
    expect(freeLeft(w, 2, NOW)).toBe(0)
    expect(takeFreeMessage(w, 2, new Date('2026-11-01T06:30:00Z'))).toMatchObject({ free: { month: '2026-11', used: 1 } })
    expect(takeFreeMessage(wallet(), 0, NOW)).toBeNull()
  })

  it('a charge uses the allowance before the wallet, and a failed send returns it', async () => {
    const store = memoryWalletStore()
    store.set('o1', { paidPaise: 1000 })
    const deps: ChargeDeps = { store }
    const input = { orgId: 'o1', messageId: 'm1', attempt: 1, category: 'utility' as const, mode: 'managed' as const, settings: managed, allowance: 1, now: NOW }
    const first = await chargeForMessage(deps, input)
    expect(first).toMatchObject({ ok: true, costPaise: 0, free: true })
    const second = await chargeForMessage(deps, { ...input, messageId: 'm2' })
    expect(second).toMatchObject({ ok: true, costPaise: 25, free: false, debitKey: debitKeyOf('m2', 1) })
    expect(store.get('o1').paidPaise).toBe(975)
    await refundCharge(deps, 'o1', first, NOW)
    expect(store.get('o1').free.used).toBe(0)
  })
})

describe('atomic charging', () => {
  it('50 concurrent sends against ₹5 never overdraw: exactly 20 are charged, the rest are refused', async () => {
    const store = memoryWalletStore()
    store.set('o1', { paidPaise: 500 })
    const deps: ChargeDeps = { store }
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => chargeForMessage(deps, { orgId: 'o1', messageId: `m${i}`, attempt: 1, category: 'utility', mode: 'managed', settings: managed, allowance: 0, now: NOW })))
    expect(results.filter((r) => r.ok)).toHaveLength(20)
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === 'insufficient')).toBe(true)
    expect(store.get('o1').paidPaise).toBe(0)
    expect(store.ledger.filter((r) => r.type === 'debit')).toHaveLength(20)
  })

  it('the same ledger key twice charges once (a retried webhook, a second worker)', async () => {
    const store = memoryWalletStore()
    store.set('o1', { paidPaise: 100 })
    const deps: ChargeDeps = { store }
    const input = { orgId: 'o1', messageId: 'm1', attempt: 1, category: 'utility' as const, mode: 'managed' as const, settings: managed, allowance: 0, now: NOW }
    await Promise.all([chargeForMessage(deps, input), chargeForMessage(deps, input)])
    expect(store.get('o1').paidPaise).toBe(75)
    const charge = await chargeForMessage(deps, input)
    await refundCharge(deps, 'o1', charge, NOW)
    await refundCharge(deps, 'o1', charge, NOW)
    expect(store.get('o1').paidPaise).toBe(100)
    expect(store.ledger.filter((r) => r.type === 'refund')).toHaveLength(1)
  })

  it('alerts once when the balance drops below the threshold and when it runs out', async () => {
    expect(alertFor(25_000, 19_975, 20_000, 20)).toBe('low')
    expect(alertFor(19_975, 19_950, 20_000, 20)).toBeNull()
    expect(alertFor(30, 5, 20_000, 20)).toBe('zero')
    const store = memoryWalletStore()
    store.set('o1', { paidPaise: 20_010 })
    const alert = vi.fn(async () => undefined)
    await chargeForMessage({ store, alert }, { orgId: 'o1', messageId: 'm1', attempt: 1, category: 'utility', mode: 'managed', settings: managed, allowance: 0, now: NOW })
    expect(alert).toHaveBeenCalledWith('o1', 'low')
  })
})

describe('expiry of paid credit', () => {
  const lot = (id: string, credit: number, at: string): CreditLot => ({ id, creditPaise: credit, at: new Date(at), expiresAt: paidExpiryFrom(new Date(at)) })

  it('expires 12 months after the recharge', () => {
    expect(paidExpiryFrom(new Date('2026-10-08T06:30:00Z')).toISOString()).toBe('2027-10-08T06:30:00.000Z')
  })

  it('spends the oldest recharge first, so only its unspent part expires', () => {
    const old = lot('a', 50_000, '2026-01-10T00:00:00Z')
    const newer = lot('b', 100_000, '2026-06-10T00:00:00Z')
    expect(expiringPaise(old, 120_000, [newer])).toBe(20_000)
    expect(expiringPaise(old, 90_000, [newer])).toBe(0)
    expect(expiringPaise(old, 400_000, [newer])).toBe(50_000)
    expect(expiringPaise(newer, 30_000, [])).toBe(30_000)
  })
})

describe('recharge', () => {
  it('packs carry their bonus; custom amounts get the bonus of the pack below; GST on the credit only', () => {
    expect(bonusFor(50_000)).toBe(0)
    expect(bonusFor(250_000)).toBe(12_500)
    expect(bonusFor(500_000)).toBe(50_000)
    expect(bonusFor(1_000_000)).toBe(120_000)
    expect(bonusFor(300_000)).toBe(15_000)
    expect(rechargeQuote(250_000, true)).toEqual({ creditPaise: 250_000, bonusPaise: 12_500, gstPaise: 45_000, payablePaise: 295_000 })
    expect(rechargeQuote(250_000, false)).toEqual({ creditPaise: 250_000, bonusPaise: 12_500, gstPaise: 0, payablePaise: 250_000 })
    expect(rechargeRefusal(40_000)).toMatch(/₹500/)
    expect(rechargeRefusal(50_050)).toMatch(/whole/)
    expect(rechargeRefusal(50_000)).toBeNull()
  })

  it('the quote agrees with the tax invoice totals (rounded to the rupee), and the bonus is a ₹0 line', () => {
    for (const credit of [50_000, 50_100, 123_400, 1_000_000]) {
      const quote = rechargeQuote(credit, true)
      const plain = rechargeQuote(credit, false)
      expect(subscriptionInvoiceTotals(rechargeLines(plain), 'no_gst').totalPaise).toBe(plain.payablePaise)
      const lines = rechargeLines(quote)
      expect(subscriptionInvoiceTotals(lines, 'intra_state').totalPaise).toBe(quote.payablePaise)
      expect(subscriptionInvoiceTotals(lines, 'inter_state').totalPaise).toBe(quote.payablePaise)
    }
    const lines = rechargeLines(rechargeQuote(500_000, true))
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatchObject({ amountPaise: 0, productKey: 'whatsapp_wallet_bonus' })
  })

  const money: RechargeMoney = { paymentId: 'pay_1', provider: 'razorpay', amountPaise: 295_000, paidAt: NOW, orgId: '0123456789abcdef01234567', creditPaise: 250_000 }

  function deps(applied: Set<string>) {
    const credited: string[] = []
    const flagged: string[] = []
    const d: RechargeDeps = {
      chargeGst: true,
      alreadyApplied: async (id) => applied.has(id),
      workspaceExists: async () => true,
      credit: async (m) => {
        applied.add(m.paymentId)
        credited.push(m.paymentId)
        return 'FB/2026-27/0009'
      },
      flag: async (_m, reason) => {
        flagged.push(reason)
      },
    }
    return { d, credited, flagged }
  }

  it('is idempotent per payment id: a webhook delivered twice credits once', async () => {
    const { d, credited } = deps(new Set())
    expect(await applyRecharge(d, money)).toMatchObject({ status: 'credited', invoiceNumber: 'FB/2026-27/0009', quote: { bonusPaise: 12_500 } })
    expect(await applyRecharge(d, money)).toEqual({ status: 'duplicate' })
    expect(credited).toEqual(['pay_1'])
  })

  it('money that does not match the quote is flagged, not credited', async () => {
    const { d, credited, flagged } = deps(new Set())
    expect(await applyRecharge(d, { ...money, amountPaise: 250_000 })).toMatchObject({ status: 'flagged' })
    expect(credited).toEqual([])
    expect(flagged[0]).toMatch(/295000/)
  })

  it('reads only Flowbit wallet links back from the webhook', () => {
    const event = { paymentId: 'pay_1', amountPaise: 295_000, paidAt: NOW, notes: { kind: WALLET_LINK_KIND, orgId: money.orgId, creditPaise: '250000' } }
    expect(rechargeMoneyFromLink(event)).toMatchObject({ creditPaise: 250_000, orgId: money.orgId })
    expect(rechargeMoneyFromLink({ ...event, notes: { kind: 'flowbit_bill', billId: 'x' } })).toBeNull()
    expect(rechargeMoneyFromLink({ ...event, notes: { ...event.notes, orgId: 'not-an-id' } })).toBeNull()
  })
})

describe('empty wallet or cap: fallback or a 24-hour hold', () => {
  const store = (): DeliveryStore & { saves: unknown[] } => {
    const saves: unknown[] = []
    return { saves, save: async (_id, patch) => void saves.push(patch), fallback: vi.fn(async () => 'fb1') }
  }
  const held: ChannelAdapter = { channel: 'whatsapp', send: async () => ({ ok: false, error: 'The WhatsApp wallet is empty.', hold: true, skip: 'wallet_empty' }) }
  const message = (over: Partial<DeliverableMessage> = {}): DeliverableMessage => ({ id: 'm1', channel: 'whatsapp', to: ['+919876543210'], attempts: 0, retry: true, createdAt: NOW, ...over })

  it('falls back to email when the message allows it', async () => {
    const s = store()
    const r = await deliver(message({ fallback: { channel: 'email', to: ['a@b.in'] } }), { adapters: { whatsapp: held }, store: s, now: () => NOW })
    expect(r).toMatchObject({ status: 'skipped', skipReason: 'wallet_empty', fallbackId: 'fb1' })
  })

  it('otherwise holds it, retrying every 30 minutes, and fails with the reason after 24 hours', async () => {
    const s = store()
    const r = await deliver(message(), { adapters: { whatsapp: held }, store: s, now: () => NOW })
    expect(r.status).toBe('queued')
    expect(r.nextAttemptAt?.getTime()).toBe(NOW.getTime() + 30 * 60_000)
    const later = new Date(NOW.getTime() + HOLD_MS + 1)
    const done = await deliver(message({ attempts: 40 }), { adapters: { whatsapp: held }, store: s, now: () => later })
    expect(done).toMatchObject({ status: 'failed' })
    expect(done.error).toMatch(/Held for 24 hours.*wallet is empty/)
    expect(holdRetryAt(NOW, new Date(NOW.getTime() + HOLD_MS - 60_000))?.getTime()).toBe(NOW.getTime() + HOLD_MS)
  })
})
