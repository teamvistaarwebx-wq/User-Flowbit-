import { describe, expect, it, vi } from 'vitest'
import { parsePaymentLinkPaid } from '@/modules/payments/webhook-event'
import type { FetchLike } from '@/modules/payments/razorpay-links'
import { autopayCovers, nextAutopay, renewsAutomatically } from './autopay-state'
import { billPeriodStart, draftBill, dueDateFrom } from './bill-draft'
import { applyBillPayment, billMoneyFromLink, type BillMoney, type BillPaymentDeps, type PayableBill } from './bill-payment'
import { expiredProvisional, recordOffline, rejectOffline, verifyOffline, type OfflineInput, type OfflineRow, type RecordDeps, type VerifyDeps } from './offline-core'
import { flowbitRazorpay } from './razorpay-client'
import {
  AFA_LIMIT_PAISE,
  creditNoteRefusal,
  overpaidBy,
  taxInvoiceInstant,
  dunningOffset,
  isDunningExcluded,
  needsPerDebitApproval,
  normalizeUtr,
  preDebitNoticeDue,
  refundRefusal,
  reminderDates,
  renewalNotice,
  settlementOf,
  verifyRefusal,
} from './rules'
import { billSeries, cleanPrefix, creditNoteSeries, formatSeriesNumber, legacyInvoiceKey, seriesSeedKey, taxInvoiceSeries } from './series'

const HOUR = 3_600_000
const DAY = 24 * HOUR

describe('invoice series per GSTIN', () => {
  it('keeps the old counter while no GSTIN is set, so old numbers stay valid', () => {
    const s = taxInvoiceSeries({ gstin: null, fy: '2026-27' })
    expect(s).toEqual({ key: 'fb-invoice:2026-27', prefix: 'FB/2026-27/' })
    expect(formatSeriesNumber(s, 7)).toBe('FB/2026-27/0007')
    expect(seriesSeedKey(s, '2026-27')).toBeNull()
  })

  it('keys the counter to the supplier GSTIN and continues the old numbers under the same prefix', () => {
    const s = taxInvoiceSeries({ gstin: '23abcde1234f1z5', fy: '2026-27' })
    expect(s.key).toBe('fb-invoice:23ABCDE1234F1Z5:2026-27')
    expect(seriesSeedKey(s, '2026-27')).toBe(legacyInvoiceKey('2026-27'))
  })

  it('gives a second GSTIN with its own prefix a fresh series', () => {
    const s = taxInvoiceSeries({ gstin: '27ZZZZZ9999Z1Z9', fy: '2027-28', prefix: 'fp' })
    expect(s).toEqual({ key: 'fb-invoice:27ZZZZZ9999Z1Z9:2027-28', prefix: 'FP/2027-28/' })
    expect(seriesSeedKey(s, '2027-28')).toBeNull()
    expect(cleanPrefix('TOOLONG')).toBe('FB')
  })

  it('keeps every number within GST’s 16 characters', () => {
    for (const s of [taxInvoiceSeries({ gstin: 'X', fy: '2026-27', prefix: 'ABC' }), billSeries('2026-27'), creditNoteSeries({ gstin: 'X', fy: '2026-27' })]) {
      expect(formatSeriesNumber(s, 9999).length).toBeLessThanOrEqual(16)
    }
    expect(creditNoteSeries({ gstin: null, fy: '2026-27' }).key).toBe('fb-credit:none:2026-27')
  })
})

describe('due bill draft', () => {
  const suite = { plan: 'suite' as const, seats: 10 }
  it('prices from the table, splits GST by place of supply and takes TDS off what is paid online', () => {
    const start = new Date('2026-10-08T06:00:00Z')
    const intra = draftBill({ selection: suite, cycle: 'monthly', start, supplierState: 'MP', supplierGstin: '23ABCDE1234F1Z5', customerState: 'MP', tdsDeclared: false })
    expect(intra.supplyType).toBe('intra_state')
    expect(intra.totals.cgstPaise).toBe(intra.totals.sgstPaise)
    expect(intra.payableNowPaise).toBe(intra.totals.totalPaise)
    expect(intra.periodStart).toBe('2026-10-08')
    expect(intra.periodEnd).toBe('2026-11-08')
    const withTds = draftBill({ selection: suite, cycle: 'monthly', start, supplierState: 'MP', supplierGstin: '23ABCDE1234F1Z5', customerState: 'KA', tdsDeclared: true })
    expect(withTds.supplyType).toBe('inter_state')
    expect(withTds.tdsPaise).toBe(Math.round(withTds.totals.taxableValuePaise * 0.02))
    expect(withTds.payableNowPaise).toBe(withTds.totals.totalPaise - withTds.tdsPaise)
  })

  it('drafts a bill with no GST and TDS on the plain value while Flowbit has no GSTIN (D8)', () => {
    // Arrange
    const start = new Date('2026-10-08T06:00:00Z')
    // Act
    const bill = draftBill({ selection: suite, cycle: 'monthly', start, supplierState: 'MP', supplierGstin: null, customerState: 'MP', tdsDeclared: true })
    // Assert: ₹1,490, no GST; TDS 2% of ₹1,490 = ₹29.80
    expect(bill.supplyType).toBe('no_gst')
    expect(bill.totals).toMatchObject({ taxableValuePaise: 149_000, taxPaise: 0, totalPaise: 149_000 })
    expect(bill.tdsPaise).toBe(2_980)
    expect(bill.payableNowPaise).toBe(149_000 - 2_980)
  })

  it('starts a renewal bill at the end of the running period, else today', () => {
    const now = new Date('2026-10-08T00:00:00Z')
    const end = new Date('2026-10-20T00:00:00Z')
    expect(billPeriodStart({ now, currentPeriodEnd: end, active: true })).toBe(end)
    expect(billPeriodStart({ now, currentPeriodEnd: end, active: false })).toBe(now)
    expect(dueDateFrom('2026-10-08', 7)).toBe('2026-10-15')
    expect(dueDateFrom('2026-10-08', 500)).toBe('2026-12-07')
  })
})

describe('TDS: settled at 98% with TDS declared', () => {
  it('settles in full, with TDS, or not at all', () => {
    expect(settlementOf({ totalPaise: 100_000, receivedPaise: 100_000, tdsDeclared: false })).toEqual({ status: 'paid', tdsPaise: 0, shortPaise: 0 })
    expect(settlementOf({ totalPaise: 100_000, receivedPaise: 98_000, tdsDeclared: true })).toEqual({ status: 'paid_with_tds', tdsPaise: 2_000, shortPaise: 0 })
    expect(settlementOf({ totalPaise: 100_000, receivedPaise: 98_000, tdsDeclared: false })).toEqual({ status: 'short', tdsPaise: 0, shortPaise: 2_000 })
    expect(settlementOf({ totalPaise: 100_000, receivedPaise: 97_999, tdsDeclared: true }).status).toBe('short')
  })
})

describe('due → paid, and payment-link webhook idempotency', () => {
  const bill: PayableBill = { id: 'b1', status: 'due', totalPaise: 177_000, receivedPaise: 0, tdsDeclared: false }
  const money: BillMoney = { paymentId: 'pay_1', provider: 'razorpay', amountPaise: 177_000, paidAt: new Date('2026-10-09T05:00:00Z'), billId: 'b1' }

  /** An in-memory bill store that behaves like the database. */
  function memory(start: PayableBill) {
    let current = { ...start }
    const applied = new Set<string>()
    const settle = vi.fn<BillPaymentDeps['settle']>(async (_b, m) => {
      applied.add(m.paymentId)
      current = { ...current, status: 'paid', receivedPaise: current.receivedPaise + m.amountPaise }
      return 'FB/2026-27/0001'
    })
    const recordPart = vi.fn<BillPaymentDeps['recordPart']>(async (_b, m) => {
      applied.add(m.paymentId)
      current = { ...current, receivedPaise: current.receivedPaise + m.amountPaise }
    })
    const flag = vi.fn<BillPaymentDeps['flag']>(async () => {})
    const deps: BillPaymentDeps = { alreadyApplied: async (id) => applied.has(id), loadBill: async (id) => (id === current.id ? current : null), settle, recordPart, flag }
    return { deps, settle, recordPart, flag, state: () => current }
  }

  it('turns the due bill into a paid invoice once, however often the webhook repeats', async () => {
    const m = memory(bill)
    expect(await applyBillPayment(m.deps, money)).toBe('paid')
    expect(await applyBillPayment(m.deps, money)).toBe('duplicate')
    expect(m.settle).toHaveBeenCalledTimes(1)
    expect(m.state().status).toBe('paid')
  })

  it('keeps a short payment as part payment until the rest arrives', async () => {
    const m = memory(bill)
    expect(await applyBillPayment(m.deps, { ...money, amountPaise: 100_000 })).toBe('part')
    expect(m.state().status).toBe('due')
    expect(await applyBillPayment(m.deps, { ...money, paymentId: 'pay_2', amountPaise: 77_000 })).toBe('paid')
  })

  it('settles a TDS bill paid online at the net amount', async () => {
    const m = memory({ ...bill, tdsDeclared: true, totalPaise: 100_000 })
    expect(await applyBillPayment(m.deps, { ...money, amountPaise: 98_300 })).toBe('paid')
    expect(m.settle.mock.calls[0][2]).toEqual({ status: 'paid_with_tds', tdsPaise: 1_700, shortPaise: 0 })
  })

  it('flags a second payment for a paid or cancelled bill for Accounts', async () => {
    const paid = memory({ ...bill, status: 'paid' })
    expect(await applyBillPayment(paid.deps, { ...money, paymentId: 'pay_9' })).toBe('flagged')
    expect(paid.flag).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay_9' }), expect.stringContaining('second payment'))
    const unknown = memory(bill)
    expect(await applyBillPayment(unknown.deps, { ...money, billId: 'nope' })).toBe('flagged')
  })

  it('reads only Flowbit bill links from the payment-link webhook', () => {
    const body = (notes: Record<string, string>) => ({
      event: 'payment_link.paid',
      payload: { payment_link: { entity: { id: 'plink_1', notes } }, payment: { entity: { id: 'pay_1', amount: 177_000, status: 'captured', method: 'upi', created_at: 1791436800 } } },
    })
    const ours = parsePaymentLinkPaid(body({ kind: 'flowbit_bill', billId: 'b1' }))!
    expect(billMoneyFromLink(ours)).toMatchObject({ paymentId: 'pay_1', billId: 'b1', amountPaise: 177_000, provider: 'razorpay' })
    expect(billMoneyFromLink(parsePaymentLinkPaid(body({ orgId: 'o', invoiceId: 'i' }))!)).toBeNull()
  })
})

describe('autopay webhook state machine', () => {
  it('walks mandate → active → retry → renewal', () => {
    expect(nextAutopay('created', 'subscription.authenticated')).toEqual({ status: 'authenticated', effect: 'none' })
    expect(nextAutopay('authenticated', 'subscription.charged')).toEqual({ status: 'active', effect: 'renew' })
    expect(nextAutopay('active', 'subscription.pending')).toEqual({ status: 'pending', effect: 'grace' })
    expect(nextAutopay('pending', 'subscription.charged')).toEqual({ status: 'active', effect: 'renew' })
  })

  it('locks after halted, stops on cancel, and ignores events that do not fit', () => {
    expect(nextAutopay('pending', 'subscription.halted')).toEqual({ status: 'halted', effect: 'lock' })
    expect(nextAutopay('active', 'subscription.cancelled')).toEqual({ status: 'cancelled', effect: 'stop' })
    expect(nextAutopay('cancelled', 'subscription.charged')).toBeNull()
    expect(nextAutopay('active', 'subscription.authenticated')).toBeNull()
    expect(nextAutopay(null, 'payment.captured')).toBeNull()
    expect(nextAutopay(undefined, 'subscription.authenticated')?.status).toBe('authenticated')
    expect(autopayCovers('active')).toBe(true)
    expect(autopayCovers('pending')).toBe(false)
  })
})

describe('pre-debit notice and the ₹15,000 AFA note', () => {
  const charge = new Date('2026-11-08T06:00:00Z')
  it('is due between 48 and 24 hours before the charge, never later', () => {
    expect(preDebitNoticeDue(charge, new Date(charge.getTime() - 30 * HOUR))).toBe(true)
    expect(preDebitNoticeDue(charge, new Date(charge.getTime() - 48 * HOUR))).toBe(true)
    expect(preDebitNoticeDue(charge, new Date(charge.getTime() - 49 * HOUR))).toBe(false)
    expect(preDebitNoticeDue(charge, new Date(charge.getTime() - 24 * HOUR))).toBe(false)
    expect(preDebitNoticeDue(charge, new Date(charge.getTime() - 2 * HOUR))).toBe(false)
  })

  it('adds the approval note to yearly debits above ₹15,000 only', () => {
    expect(needsPerDebitApproval({ amountPaise: AFA_LIMIT_PAISE + 100, cycle: 'yearly' })).toBe(true)
    expect(needsPerDebitApproval({ amountPaise: AFA_LIMIT_PAISE, cycle: 'yearly' })).toBe(false)
    expect(needsPerDebitApproval({ amountPaise: AFA_LIMIT_PAISE * 2, cycle: 'monthly' })).toBe(false)
  })
})

describe('offline payments', () => {
  const now = new Date('2026-10-08T06:00:00Z')
  const input: OfflineInput = { billId: 'b1', utr: 'axis 1234-5678 90', amountPaise: 177_000, paidOn: '2026-10-08', mode: 'neft', tdsDeclared: false, recordedByStaffId: 'acc1', recordedByName: 'Asha' }
  const recordDeps = (taken: string[] = [], submittedBefore = false) => {
    const create = vi.fn<RecordDeps['create']>(async () => 'op1')
    const grantProvisional = vi.fn<RecordDeps['grantProvisional']>(async () => {})
    const declareTds = vi.fn<RecordDeps['declareTds']>(async () => {})
    return { deps: { utrTaken: async (u: string) => taken.includes(u), billIsDue: async () => true, create, grantProvisional, declareTds, customerSubmittedBefore: async () => submittedBefore }, create, grantProvisional, declareTds }
  }

  it('keeps a TDS declaration even when no provisional access is given (second customer submission)', async () => {
    const again = recordDeps([], true)
    expect(await recordOffline(again.deps, { ...input, recordedByStaffId: null, tdsDeclared: true }, now)).toMatchObject({ ok: true, provisional: false })
    expect(again.declareTds).toHaveBeenCalledWith('b1')
    const plain = recordDeps()
    await recordOffline(plain.deps, input, now)
    expect(plain.declareTds).not.toHaveBeenCalled()
  })

  it('records it with a normalised UTR and 7 days of provisional access', async () => {
    const r = recordDeps()
    const result = await recordOffline(r.deps, input, now)
    expect(result).toEqual({ ok: true, id: 'op1', provisionalUntil: new Date(now.getTime() + 7 * DAY), provisional: true })
    expect(r.create).toHaveBeenCalledWith(expect.objectContaining({ utr: 'AXIS1234567890' }))
    expect(r.grantProvisional).toHaveBeenCalledWith('op1', new Date(now.getTime() + 7 * DAY))
  })

  it('V2-REVIEW M-H1: a customer gets provisional access once per bill; Accounts always grants it', async () => {
    const customer = { ...input, recordedByStaffId: null }
    const first = recordDeps([], false)
    expect(await recordOffline(first.deps, customer, now)).toMatchObject({ ok: true, provisional: true })
    expect(first.grantProvisional).toHaveBeenCalled()
    const again = recordDeps([], true)
    expect(await recordOffline(again.deps, customer, now)).toMatchObject({ ok: true, provisional: false })
    expect(again.create).toHaveBeenCalled()
    expect(again.grantProvisional).not.toHaveBeenCalled()
    const staff = recordDeps([], true)
    expect(await recordOffline(staff.deps, input, now)).toMatchObject({ ok: true, provisional: true })
    expect(staff.grantProvisional).toHaveBeenCalled()
  })

  it('rejects a duplicate UTR however it is typed, and a malformed one', async () => {
    const r = recordDeps([normalizeUtr('AXIS1234567890')])
    expect(await recordOffline(r.deps, input, now)).toMatchObject({ ok: false, field: 'utr' })
    expect(await recordOffline(recordDeps().deps, { ...input, utr: '12' }, now)).toMatchObject({ ok: false, field: 'utr' })
    expect(r.create).not.toHaveBeenCalled()
  })

  const row: OfflineRow = { id: 'op1', billId: 'b1', status: 'pending', recordedByStaffId: 'acc1', provisionalUntil: new Date(now.getTime() + 7 * DAY), amountPaise: 177_000, utr: 'AXIS1234567890', paidOn: '2026-10-08', mode: 'neft' }
  const verifyDeps = (r: OfflineRow = row) => {
    const apply = vi.fn<VerifyDeps['apply']>(async () => 'paid')
    const reject = vi.fn<VerifyDeps['reject']>(async () => {})
    const endProvisional = vi.fn<VerifyDeps['endProvisional']>(async () => {})
    return { deps: { load: async () => r, apply, reject, endProvisional }, apply, reject, endProvisional }
  }

  it('maker-checker: the recorder cannot verify or reject; someone else can', async () => {
    const v = verifyDeps()
    expect(await verifyOffline(v.deps, 'op1', 'acc1')).toMatchObject({ ok: false, error: expect.stringContaining('someone else') })
    expect(await rejectOffline(v.deps, 'op1', 'acc1', 'no match')).toMatchObject({ ok: false })
    expect(v.apply).not.toHaveBeenCalled()
    expect(await verifyOffline(v.deps, 'op1', 'acc2')).toEqual({ ok: true, outcome: 'paid' })
    expect(verifyRefusal({ status: 'pending', recordedByStaffId: null, verifierStaffId: 'acc1' })).toBeNull()
    expect(verifyRefusal({ status: 'verified', recordedByStaffId: null, verifierStaffId: 'acc1' })).toMatch(/already/)
  })

  it('a rejection ends provisional access', async () => {
    const v = verifyDeps({ ...row, recordedByStaffId: null })
    expect(await rejectOffline(v.deps, 'op1', 'acc2', 'Not on the statement')).toEqual({ ok: true })
    expect(v.endProvisional).toHaveBeenCalled()
  })

  it('V2-REVIEW M-L2: a reject that lost the race to a verify changes nothing', async () => {
    const v = verifyDeps({ ...row, recordedByStaffId: null })
    const deps = { ...v.deps, reject: vi.fn(async () => false) }
    expect(await rejectOffline(deps, 'op1', 'acc2', 'Not on the statement')).toMatchObject({ ok: false })
    expect(v.endProvisional).not.toHaveBeenCalled()
  })

  it('expires pending payments after 7 days unverified', () => {
    const rows = [row, { ...row, id: 'op2', provisionalUntil: new Date(now.getTime() - 1) }, { ...row, id: 'op3', status: 'verified' as const, provisionalUntil: new Date(now.getTime() - 1) }]
    expect(expiredProvisional(rows, now).map((r) => r.id)).toEqual(['op2'])
  })
})

describe('credit notes and refunds', () => {
  const base = { provider: 'razorpay', paymentId: 'pay_1', cycle: 'monthly', reason: 'billing_error' as const, amountPaise: 10_000, paidPaise: 100_000, refundedPaise: 0 }

  it('credits only paid invoices, up to what is left', () => {
    expect(creditNoteRefusal({ invoiceStatus: 'paid', totalPaise: 100_000, creditedPaise: 0, amountPaise: 50_000 })).toBeNull()
    expect(creditNoteRefusal({ invoiceStatus: 'due', totalPaise: 100_000, creditedPaise: 0, amountPaise: 50_000 })).toMatch(/paid tax invoice/)
    // V2-REVIEW M-H2: no credit note or refund on a wallet recharge (no cash-out).
    expect(creditNoteRefusal({ kind: 'wallet_recharge', invoiceStatus: 'paid', totalPaise: 100_000, creditedPaise: 0, amountPaise: 50_000 })).toMatch(/wallet recharge/)
    expect(creditNoteRefusal({ kind: 'subscription', invoiceStatus: 'paid', totalPaise: 100_000, creditedPaise: 0, amountPaise: 50_000 })).toBeNull()
    expect(creditNoteRefusal({ invoiceStatus: 'paid', totalPaise: 100_000, creditedPaise: 60_000, amountPaise: 50_000 })).toMatch(/more than/)
  })

  it('refunds only to the original Razorpay payment, never more than was paid', () => {
    expect(refundRefusal(base)).toBeNull()
    expect(refundRefusal({ ...base, provider: 'offline', paymentId: 'utr:X' })).toMatch(/original Razorpay payment/)
    expect(refundRefusal({ ...base, amountPaise: 95_000, refundedPaise: 10_000 })).toMatch(/more than/)
  })

  it('applies monthly downgrades from the next cycle and refuses yearly refunds', () => {
    expect(refundRefusal({ ...base, reason: 'downgrade' })).toMatch(/next cycle/)
    expect(refundRefusal({ ...base, cycle: 'yearly', reason: 'cancellation' })).toMatch(/Yearly plans/)
    expect(refundRefusal({ ...base, cycle: 'yearly', reason: 'duplicate_payment' })).toBeNull()
  })
})

describe('dunning schedule and exclusions', () => {
  it('fires 15, 7, 3, 1 days before, on the day, and 1, 3, 7 days after', () => {
    expect(reminderDates('2026-11-01')).toEqual(['2026-10-17', '2026-10-25', '2026-10-29', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-04', '2026-11-08'])
    expect(dunningOffset('2026-11-01', '2026-10-17')).toBe(-15)
    expect(dunningOffset('2026-11-01', '2026-11-01')).toBe(0)
    expect(dunningOffset('2026-11-01', '2026-11-08')).toBe(7)
    expect(dunningOffset('2026-11-01', '2026-10-20')).toBeNull()
    expect(dunningOffset('2026-11-01', '2026-11-09')).toBeNull()
  })

  it('says "renews" with autopay, "expires" without, and stays quiet once paid through', () => {
    expect(renewalNotice({ offset: -7, autopayActive: true, paidThrough: false })).toBe('renews')
    expect(renewalNotice({ offset: -7, autopayActive: false, paidThrough: false })).toBe('expires')
    expect(renewalNotice({ offset: 0, autopayActive: false, paidThrough: false })).toBe('expired')
    expect(renewalNotice({ offset: 3, autopayActive: false, paidThrough: false })).toBe('overdue')
    expect(renewalNotice({ offset: 3, autopayActive: true, paidThrough: true })).toBeNull()
  })

  it('never reminds Internal, Test or Comped accounts', () => {
    expect(isDunningExcluded('internal')).toBe(true)
    expect(isDunningExcluded('test')).toBe(true)
    expect(isDunningExcluded('comped')).toBe(true)
    expect(isDunningExcluded('paid')).toBe(false)
    expect(isDunningExcluded('trial')).toBe(false)
  })
})

describe('the Razorpay client (mocked fetch)', () => {
  const creds = { keyId: 'rzp_test_x', keySecret: 's' }
  it('creates an autopay subscription and returns the mandate link; refunds the original payment', async () => {
    const calls: { url: string; body: unknown }[] = []
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, body: init.body ? JSON.parse(init.body) : null })
      if (url.endsWith('/subscriptions')) return { ok: true, status: 200, json: async () => ({ id: 'sub_1', short_url: 'https://rzp.io/i/abc', status: 'created' }) }
      if (url.endsWith('/refund')) return { ok: true, status: 200, json: async () => ({ id: 'rfnd_1', status: 'processed', amount: 5000 }) }
      return { ok: true, status: 200, json: async () => ({ id: 'plan_1' }) }
    }
    const client = flowbitRazorpay(fetchFn, creds)
    expect(await client.createPlan({ period: 'monthly', amountPaise: 177_000, name: 'Flowbit Suite', notes: { orgId: 'o' } })).toBe('plan_1')
    expect(await client.createSubscription({ planId: 'plan_1', totalCount: 120, startAt: new Date('2026-11-08T00:00:00Z'), notes: { orgId: 'o' } })).toEqual({ id: 'sub_1', shortUrl: 'https://rzp.io/i/abc', status: 'created' })
    expect(calls[1].body).toMatchObject({ plan_id: 'plan_1', customer_notify: 0, start_at: 1794096000 })
    expect(await client.refund({ paymentId: 'pay_1', amountPaise: 5000, notes: {} })).toEqual({ id: 'rfnd_1', status: 'processed', amountPaise: 5000 })
    expect(calls[2].url).toBe('https://api.razorpay.com/v1/payments/pay_1/refund')
  })

  it('surfaces Razorpay errors', async () => {
    const client = flowbitRazorpay(async () => ({ ok: false, status: 400, json: async () => ({ error: { description: 'Bad plan' } }) }), creds)
    await expect(client.createPlan({ period: 'yearly', amountPaise: 100, name: 'x', notes: {} })).rejects.toThrow('Bad plan')
  })
})

describe('public bill link', () => {
  it('opens only with a signature made for bills under the app secret', async () => {
    const { newBillKey, readBillToken, signBillToken } = await import('./bill-token')
    const key = newBillKey()
    const token = signBillToken(key, 'secret-a')
    expect(readBillToken(token, 'secret-a')).toBe(key)
    expect(readBillToken(token, 'secret-b')).toBeNull()
    expect(readBillToken(`${key}.xxxxxxxxxxxxxxxxxxxxxx`, 'secret-a')).toBeNull()
    expect(readBillToken('junk', 'secret-a')).toBeNull()
  })
})

describe('V2-REVIEW M-M2: no due bill while autopay renews', () => {
  it('detects a mandate or a live Razorpay subscription', () => {
    expect(renewsAutomatically({ autopay: { status: 'active' } })).toBe(true)
    expect(renewsAutomatically({ autopay: { status: 'authenticated' } })).toBe(true)
    expect(renewsAutomatically({ razorpaySubscriptionId: 'sub_1', status: 'active' })).toBe(true)
    expect(renewsAutomatically({ razorpaySubscriptionId: 'sub_1', status: 'active', cancelAtPeriodEnd: true })).toBe(false)
    expect(renewsAutomatically({ autopay: { status: 'pending' } })).toBe(false)
    expect(renewsAutomatically(null)).toBe(false)
  })
})

describe('V2-REVIEW M-M3: overpayment on a bill', () => {
  it('reports the excess over the total, never a negative', () => {
    expect(overpaidBy(118_000, 50_000, 118_000)).toBe(50_000)
    expect(overpaidBy(118_000, 0, 118_000)).toBe(0)
    expect(overpaidBy(118_000, 0, 115_640)).toBe(0)
  })
})

describe('V2-REVIEW M-L3: tax invoice date', () => {
  it('uses the verification day for offline payments and the payment time for Razorpay', () => {
    const now = new Date('2026-10-08T06:00:00Z')
    const typed = new Date('2025-03-01T06:30:00Z')
    expect(taxInvoiceInstant({ provider: 'offline', paidAt: typed }, now)).toBe(now)
    expect(taxInvoiceInstant({ provider: 'razorpay', paidAt: typed }, now)).toBe(typed)
  })
})
