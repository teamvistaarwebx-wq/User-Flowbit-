import { Types } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { DocEvent } from '@/models/folio/DocEvent'
import { paidDocEventWrite } from '@/modules/payments/doc-event'
import type { RazorpayLink } from '@/modules/payments/razorpay-links'
import { applyOrFlag } from './offline-core'
import { relinkBalance, relinkPlan, type RelinkBill, type RelinkDeps } from './relink'
import { billBalancePaise, isSecondDueBill } from './rules'
import { creditNoteSeedKey, creditNoteSeries, creditNotePrefix, formatSeriesNumber } from './series'

describe('V2-REVIEW P4: one "Paid online" entry per payment', () => {
  it('upserts on the payment id, so a retried webhook finds the entry instead of adding one', async () => {
    const org = new Types.ObjectId()
    const invoice = new Types.ObjectId()
    const rows: Record<string, unknown>[] = []
    // An upsert as MongoDB runs it: match every filter field, else insert filter + $setOnInsert.
    const upsert = (w: ReturnType<typeof paidDocEventWrite>) => {
      const hit = rows.find((r) => Object.entries(w.filter).every(([k, v]) => String(r[k]) === String(v)))
      if (!hit) rows.push({ ...w.filter, ...w.update.$setOnInsert })
    }
    const event = { paymentId: 'pay_1', paidAt: new Date('2026-10-08T06:00:00Z'), amountPaise: 118_000 }
    upsert(paidDocEventWrite(org, invoice, event))
    upsert(paidDocEventWrite(org, invoice, event))
    upsert(paidDocEventWrite(org, invoice, { ...event, paymentId: 'pay_2' }))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ type: 'paid', kind: 'invoice', paymentId: 'pay_1', amountPaise: 118_000 })
    expect(paidDocEventWrite(org, invoice, event).options).toEqual({ upsert: true })
  })

  it('has a unique index on the payment id within a workspace', () => {
    const idx = DocEvent.schema.indexes().find(([fields]) => 'paymentId' in fields)
    expect(idx?.[0]).toEqual({ orgId: 1, paymentId: 1 })
    expect(idx?.[1]).toMatchObject({ unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } })
  })
})

describe('V2-REVIEW M-L1: a verified offline payment that cannot be applied is flagged', () => {
  it('flags the row with the reason instead of ending with no outcome', async () => {
    const flag = vi.fn(async () => undefined)
    const result = await applyOrFlag(async () => Promise.reject(new Error('This bill is no longer due.')), flag)
    expect(result.outcome).toBe('flagged')
    expect(result.note).toMatch(/no longer due/)
    expect(flag).toHaveBeenCalledWith(expect.stringContaining('refund or credit'))
  })

  it('passes a normal outcome through without flagging', async () => {
    const flag = vi.fn(async () => undefined)
    expect(await applyOrFlag(async () => 'paid', flag)).toEqual({ outcome: 'paid' })
    expect(flag).not.toHaveBeenCalled()
  })
})

describe('V2-REVIEW M-L4: credit-note prefix keyed to the GSTIN series', () => {
  it('keeps FBC for the default prefix and gives another invoice prefix its own credit prefix', () => {
    expect(creditNotePrefix(null)).toBe('FBC')
    expect(creditNotePrefix('fp')).toBe('FPC')
    expect(creditNotePrefix('ABC')).toBe('CAB')
    const second = creditNoteSeries({ gstin: '27ZZZZZ9999Z1Z9', fy: '2027-28', prefix: 'FP' })
    expect(formatSeriesNumber(second, 1)).toBe('FPC/2027-28/0001')
    expect(formatSeriesNumber(second, 9999).length).toBeLessThanOrEqual(16)
  })

  it('continues the pre-GSTIN credit-note counter under the default prefix only', () => {
    const first = creditNoteSeries({ gstin: '23ABCDE1234F1Z5', fy: '2026-27' })
    expect(creditNoteSeedKey(first, '2026-27')).toBe('fb-credit:none:2026-27')
    expect(creditNoteSeedKey(creditNoteSeries({ gstin: null, fy: '2026-27' }), '2026-27')).toBeNull()
    expect(creditNoteSeedKey(creditNoteSeries({ gstin: '27ZZZZZ9999Z1Z9', fy: '2026-27', prefix: 'FP' }), '2026-27')).toBeNull()
  })
})

describe('V2-REVIEW M-L5: one due bill per workspace', () => {
  it('has a partial unique index on orgId for due bills', () => {
    const idx = SubscriptionInvoice.schema.indexes().find(([, opts]) => opts.name === 'one_due_bill_per_org')
    expect(idx?.[0]).toEqual({ orgId: 1 })
    expect(idx?.[1]).toMatchObject({ unique: true, partialFilterExpression: { status: 'due' } })
  })

  it('reads only that index’s duplicate error as "a second due bill"', () => {
    expect(isSecondDueBill({ code: 11000, keyPattern: { orgId: 1 } })).toBe(true)
    expect(isSecondDueBill({ code: 11000, keyPattern: { number: 1 } })).toBe(false)
    expect(isSecondDueBill({ code: 11000, message: 'E11000 duplicate key error index: one_due_bill_per_org' })).toBe(true)
    expect(isSecondDueBill(new Error('other'))).toBe(false)
  })
})

describe('V2-REVIEW M-M3: the payment link asks for the balance after a part payment', () => {
  const bill = (over: Partial<RelinkBill> = {}): RelinkBill => ({
    id: 'b1',
    orgId: 'o1',
    number: 'FBB/2026-27/0007',
    dueDate: '2026-10-20',
    totalPaise: 118_000,
    taxableValuePaise: 100_000,
    receivedPaise: 50_000,
    tds: { declared: false },
    link: { id: 'plink_1', status: 'created', amountPaise: 118_000 },
    linkCount: 1,
    customer: { name: 'Acme', email: 'a@acme.in' },
    ...over,
  })
  const deps = () => {
    const calls = { created: [] as unknown[], cancelled: [] as string[], saved: [] as unknown[] }
    const d: RelinkDeps = {
      createLink: async (input) => {
        calls.created.push(input)
        return { id: 'plink_2', shortUrl: 'https://rzp.io/x', status: 'created', referenceId: input.referenceId, amountPaise: input.amountPaise } satisfies RazorpayLink
      },
      cancelLink: async (id) => void calls.cancelled.push(id),
      save: async (billId, link, count) => void calls.saved.push({ billId, link: link.id, count }),
      expireBy: () => 1_800_000_000,
    }
    return { d, calls }
  }

  it('balances: total less received, and less 2% of the taxable value with TDS declared', () => {
    expect(billBalancePaise(bill())).toBe(68_000)
    expect(billBalancePaise(bill({ tds: { declared: true }, receivedPaise: 16_000 }))).toBe(100_000)
    expect(billBalancePaise(bill({ receivedPaise: 200_000 }))).toBe(0)
  })

  it('makes a new link for the balance with the next reference, then cancels the old one', async () => {
    const { d, calls } = deps()
    expect(await relinkBalance(d, bill())).toBe('relinked')
    expect(calls.created[0]).toMatchObject({ amountPaise: 68_000, referenceId: 'FBB/2026-27/0007-2', notes: { kind: 'flowbit_bill', billId: 'b1', orgId: 'o1' } })
    expect(calls.saved).toEqual([{ billId: 'b1', link: 'plink_2', count: 2 }])
    expect(calls.cancelled).toEqual(['plink_1'])
  })

  it('does nothing without a link, once settled, or when the link already asks for the balance', () => {
    expect(relinkPlan(bill({ link: null }))).toBeNull()
    expect(relinkPlan(bill({ receivedPaise: 118_000 }))).toBeNull()
    expect(relinkPlan(bill({ link: { id: 'plink_2', status: 'created', amountPaise: 68_000 } }))).toBeNull()
    expect(relinkPlan(bill({ linkCount: 2 }))?.referenceId).toBe('FBB/2026-27/0007-3')
  })

  it('keeps the old link when Razorpay refuses the new one', async () => {
    const { d, calls } = deps()
    const failing = { ...d, createLink: async () => Promise.reject(new Error('rzp down')) }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await relinkBalance(failing, bill())).toBe('failed')
    expect(calls.cancelled).toEqual([])
    expect(calls.saved).toEqual([])
  })
})
