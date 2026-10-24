import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { verifyWebhookSignature } from '@/modules/subscription/signatures'
import { receiptFromPayment, type PayableInvoice } from './allocation'
import { currentLink, invoicesWithCurrentLink, isDuplicateKey, staleLinks, unappliedAlert, unappliedPaise } from './link-rules'
import { processPaidLink, type Claim, type PaidDeps } from './process-paid'
import { cancelPaymentLink, createPaymentLink, paymentLinkBody, type FetchLike } from './razorpay-links'
import { parsePaymentLinkPaid, type PaidLinkEvent } from './webhook-event'

const SECRET = 'whsec_workspace_secret'

const paidBody = (overrides: { amount?: number; paymentId?: string; status?: string } = {}) => ({
  event: 'payment_link.paid',
  payload: {
    payment_link: { entity: { id: 'plink_123', reference_id: 'INV/2026-27/0042', status: 'paid', notes: { orgId: 'org1', invoiceId: 'inv1' } } },
    payment: { entity: { id: overrides.paymentId ?? 'pay_ABC', amount: overrides.amount ?? 50000, status: overrides.status ?? 'captured', method: 'upi', vpa: 'ravi@okhdfc', created_at: 1791436800 } },
  },
})

const sign = (raw: string) => createHmac('sha256', SECRET).update(raw).digest('hex')

describe('Razorpay webhook signature', () => {
  it('accepts the workspace secret and refuses anything else', () => {
    const raw = JSON.stringify(paidBody())
    expect(verifyWebhookSignature(raw, sign(raw), SECRET)).toBe(true)
    expect(verifyWebhookSignature(raw, sign(raw), 'other')).toBe(false)
    expect(verifyWebhookSignature(`${raw} `, sign(raw), SECRET)).toBe(false)
    expect(verifyWebhookSignature(raw, '', SECRET)).toBe(false)
    expect(verifyWebhookSignature(raw, sign(raw), '')).toBe(false)
  })
})

describe('payment_link.paid parsing', () => {
  it('reads the payment, link, amount and notes', () => {
    const event = parsePaymentLinkPaid(paidBody())
    expect(event).toMatchObject({ paymentId: 'pay_ABC', linkId: 'plink_123', referenceId: 'INV/2026-27/0042', amountPaise: 50000, method: 'upi', detail: 'ravi@okhdfc', notes: { orgId: 'org1', invoiceId: 'inv1' } })
    expect(event?.paidAt.toISOString()).toBe('2026-10-08T05:20:00.000Z')
  })

  it('ignores other events, uncaptured payments and junk', () => {
    expect(parsePaymentLinkPaid({ ...paidBody(), event: 'payment_link.cancelled' })).toBeNull()
    expect(parsePaymentLinkPaid(paidBody({ status: 'failed' }))).toBeNull()
    expect(parsePaymentLinkPaid(paidBody({ amount: 0 }))).toBeNull()
    expect(parsePaymentLinkPaid(null)).toBeNull()
    expect(parsePaymentLinkPaid('nope')).toBeNull()
  })
})

const invoice: PayableInvoice = { id: 'inv1', clientId: 'cl1', entityId: 'en1', status: 'issued', outstandingPaise: 118000 }
const event = parsePaymentLinkPaid(paidBody()) as PaidLinkEvent

describe('receipt from a gateway payment', () => {
  it('records the payment as one gateway receipt allocated to the invoice', () => {
    expect(receiptFromPayment(invoice, event)).toMatchObject({
      clientId: 'cl1',
      entityId: 'en1',
      receivedOn: '2026-10-08',
      amountPaise: 50000,
      mode: 'gateway',
      reference: 'pay_ABC',
      allocations: [{ invoiceId: 'inv1', amountPaise: 50000, tdsPaise: 0 }],
    })
  })

  it('applies no more than the balance; the rest stays as advance credit', () => {
    const plan = receiptFromPayment({ ...invoice, outstandingPaise: 20000 }, event)
    expect(plan.amountPaise).toBe(50000)
    expect(plan.allocations).toEqual([{ invoiceId: 'inv1', amountPaise: 20000, tdsPaise: 0 }])
  })

  it('allocates nothing to a paid or void invoice', () => {
    expect(receiptFromPayment({ ...invoice, status: 'paid', outstandingPaise: 0 }, event).allocations).toEqual([])
    expect(receiptFromPayment({ ...invoice, status: 'void' }, event).allocations).toEqual([])
  })
})

/** In-memory PaymentEvent store with the unique payment id, like the real collection. */
function fakeDeps(opts: { failRecord?: boolean; invoice?: PayableInvoice | null } = {}) {
  const rows = new Map<string, { status: string; receiptId?: string }>()
  const receipts: string[] = []
  const emitted: string[] = []
  const alerts: number[] = []
  const deps: PaidDeps = {
    claim: async (e): Promise<Claim> => {
      const row = rows.get(e.paymentId)
      if (!row) {
        rows.set(e.paymentId, { status: 'processing' })
        return 'new'
      }
      if (row.status === 'failed') {
        rows.set(e.paymentId, { status: 'processing' })
        return 'retry'
      }
      return row.status === 'processing' ? 'busy' : 'done'
    },
    invoiceFor: async () => (opts.invoice === undefined ? invoice : opts.invoice),
    recordReceipt: vi.fn(async (plan) => {
      if (opts.failRecord) throw new Error('db down')
      receipts.push(plan.reference)
      return { receiptId: `rct${receipts.length}` }
    }),
    markLinkPaid: vi.fn(async () => {}),
    finish: async (e, outcome) => {
      rows.set(e.paymentId, { status: outcome.status, receiptId: outcome.receiptId })
    },
    emitPaid: async (_inv, receiptId) => {
      emitted.push(receiptId)
    },
    alertUnapplied: vi.fn(async (_inv, _e, paise: number) => {
      alerts.push(paise)
    }),
  }
  return { deps, rows, receipts, emitted, alerts }
}

describe('payment_link.paid processing (idempotent on the payment id)', () => {
  it('records one receipt and fires payment.received once, however often Razorpay retries', async () => {
    const { deps, receipts, emitted } = fakeDeps()
    expect(await processPaidLink(deps, event)).toBe('recorded')
    expect(await processPaidLink(deps, event)).toBe('duplicate')
    expect(await processPaidLink(deps, event)).toBe('duplicate')
    expect(receipts).toEqual(['pay_ABC'])
    expect(emitted).toEqual(['rct1'])
  })

  it('a different payment on the same link is a new receipt', async () => {
    const { deps, receipts } = fakeDeps()
    await processPaidLink(deps, event)
    await processPaidLink(deps, { ...event, paymentId: 'pay_DEF' })
    expect(receipts).toEqual(['pay_ABC', 'pay_DEF'])
  })

  it('a failed attempt is retried by the next delivery', async () => {
    const failing = fakeDeps({ failRecord: true })
    expect(await processPaidLink(failing.deps, event)).toBe('failed')
    expect(failing.rows.get('pay_ABC')?.status).toBe('failed')
    expect(failing.emitted).toEqual([])
    const healthy: PaidDeps = { ...failing.deps, recordReceipt: async () => ({ receiptId: 'rct9' }) }
    expect(await processPaidLink(healthy, event)).toBe('recorded')
    expect(failing.emitted).toEqual(['rct9'])
  })

  it('alerts finance when a payment lands on a void invoice, and not when it is applied in full', async () => {
    const applied = fakeDeps()
    await processPaidLink(applied.deps, event)
    expect(applied.alerts).toEqual([])
    const voided = fakeDeps({ invoice: { ...invoice, status: 'void', outstandingPaise: 0 } })
    expect(await processPaidLink(voided.deps, event)).toBe('recorded')
    expect(voided.alerts).toEqual([50000])
  })

  it('a failing alert does not fail the recorded payment', async () => {
    const { deps } = fakeDeps({ invoice: { ...invoice, status: 'paid', outstandingPaise: 0 } })
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await processPaidLink({ ...deps, alertUnapplied: async () => { throw new Error('mail down') } }, event)).toBe('recorded')
    quiet.mockRestore()
  })

  it('ignores a payment whose invoice is not in this workspace', async () => {
    const { deps, receipts } = fakeDeps({ invoice: null })
    expect(await processPaidLink(deps, event)).toBe('ignored')
    expect(receipts).toEqual([])
  })
})

describe('Razorpay payment link API (mocked, no network)', () => {
  const creds = { keyId: 'rzp_test_abc', keySecret: 'sec' }

  it('posts the balance in paise with the invoice number as reference', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => ({ ok: true, status: 200, json: async () => ({ id: 'plink_1', short_url: 'https://rzp.io/i/x', status: 'created', reference_id: 'INV-1', amount: 118000 }) }))
    const link = await createPaymentLink(fetchFn, creds, { amountPaise: 118000, referenceId: 'INV-1', description: 'Invoice INV-1', notes: { orgId: 'o', invoiceId: 'i' } })
    expect(link).toEqual({ id: 'plink_1', shortUrl: 'https://rzp.io/i/x', status: 'created', referenceId: 'INV-1', amountPaise: 118000 })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.razorpay.com/v1/payment_links')
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from('rzp_test_abc:sec').toString('base64')}`)
    expect(JSON.parse(init.body ?? '{}')).toMatchObject({ amount: 118000, currency: 'INR', reference_id: 'INV-1', accept_partial: false, notes: { orgId: 'o', invoiceId: 'i' } })
  })

  it('surfaces Razorpay errors and refuses amounts under ₹1', async () => {
    const refusing: FetchLike = async () => ({ ok: false, status: 400, json: async () => ({ error: { description: 'reference_id already exists' } }) })
    await expect(createPaymentLink(refusing, creds, { amountPaise: 5000, referenceId: 'X', description: 'd', notes: {} })).rejects.toThrow('reference_id already exists')
    await expect(createPaymentLink(refusing, creds, { amountPaise: 50, referenceId: 'X', description: 'd', notes: {} })).rejects.toThrow('at least ₹1')
  })

  it('cancels a link by id', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    await cancelPaymentLink(fetchFn, creds, 'plink_1')
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/payment_links/plink_1/cancel')
  })

  it('leaves empty customer fields out of the body', () => {
    expect(paymentLinkBody({ amountPaise: 100, referenceId: 'R', description: 'd', notes: {}, customer: { name: 'A', email: '' } }).customer).toEqual({ name: 'A' })
    expect(paymentLinkBody({ amountPaise: 100, referenceId: 'R', description: 'd', notes: {} }).customer).toBeUndefined()
  })
})

describe('V2-REVIEW P3: PaymentEvent idempotency is per workspace', () => {
  it('keys the unique index on provider, orgId and paymentId', async () => {
    const { PaymentEvent } = await import('@/models/payments/PaymentEvent')
    const unique = PaymentEvent.schema.indexes().filter(([, opts]) => opts?.unique)
    expect(unique.map(([keys]) => keys)).toContainEqual({ provider: 1, orgId: 1, paymentId: 1 })
    expect(unique.map(([keys]) => keys)).not.toContainEqual({ provider: 1, paymentId: 1 })
  })
})

describe('payment links that no longer fit their invoice (6.5)', () => {
  const links = [{ id: 'new', amountPaise: 60000 }, { id: 'old', amountPaise: 118000 }]

  it('keeps only the link for the current balance of an open invoice', () => {
    expect(currentLink(links, { status: 'part_paid', balancePaise: 60000 })?.id).toBe('new')
    expect(staleLinks(links, { status: 'part_paid', balancePaise: 60000 }).map((l) => l.id)).toEqual(['old'])
  })

  it('cancels every link once the invoice is void, written off to zero or paid', () => {
    expect(staleLinks(links, { status: 'void', balancePaise: 0 })).toHaveLength(2)
    expect(staleLinks(links, { status: 'paid', balancePaise: 0 })).toHaveLength(2)
    expect(staleLinks(links, { status: 'issued', balancePaise: 0 })).toHaveLength(2)
    expect(staleLinks(links, null)).toHaveLength(2)
    expect(currentLink(links, { status: 'void', balancePaise: 60000 })).toBeNull()
  })

  it('measures and explains the money that did not go to the invoice', () => {
    expect(unappliedPaise(receiptFromPayment({ ...invoice, outstandingPaise: 20000 }, event))).toBe(30000)
    expect(unappliedPaise(receiptFromPayment(invoice, event))).toBe(0)
    expect(unappliedAlert({ invoiceNumber: 'INV-1', invoiceStatus: 'void', amountPaise: 50000, unappliedPaise: 50000 }).body).toMatch(/invoice INV-1 is void/)
    expect(unappliedAlert({ invoiceNumber: 'INV-1', invoiceStatus: 'part_paid', amountPaise: 50000, unappliedPaise: 30000 }).body).toMatch(/more than invoice INV-1 owed/)
  })
})

describe('one live payment link per invoice (6.12)', () => {
  it('a unique partial index keeps a second created link out', async () => {
    const { PaymentLink } = await import('@/models/payments/PaymentLink')
    const unique = PaymentLink.schema.indexes().filter(([, opts]) => opts?.unique)
    expect(unique).toContainEqual([{ orgId: 1, invoiceId: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { status: 'created' } })])
  })

  it('recognises the duplicate-key refusal the losing click gets', () => {
    expect(isDuplicateKey({ code: 11000 })).toBe(true)
    expect(isDuplicateKey(new Error('other'))).toBe(false)
    expect(isDuplicateKey(null)).toBe(false)
  })
})

describe('portal Pay now (8.2)', () => {
  it('shows only for an open invoice whose live link asks for the current balance', () => {
    const invoices = [
      { id: 'fresh', status: 'issued', balancePaise: 1000 },
      { id: 'stale', status: 'part_paid', balancePaise: 400 },
      { id: 'void', status: 'void', balancePaise: 0 },
    ]
    const links = [
      { invoiceId: 'fresh', amountPaise: 1000 },
      { invoiceId: 'stale', amountPaise: 1000 },
      { invoiceId: 'void', amountPaise: 1000 },
    ]
    expect([...invoicesWithCurrentLink(invoices, links)]).toEqual(['fresh'])
  })
})
