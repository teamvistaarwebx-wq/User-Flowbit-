import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { quoteSelection, type Usage } from '@/lib/billing'
import { addedProducts, clampQuantity, invoiceLines, printableLine, readTypedQuantity, sameSelection, selectionLabel, selectionOf, selectionSchema, shapeOf, usageProblems } from './selection'
import { verifyCheckoutSignature, verifyOrderSignature, verifyWebhookSignature } from './signatures'
import { pickerStart } from './page-data'

const usage = (patch: Partial<Usage> = {}): Usage => ({ members: 8, pendingInvites: 0, employees: 0, orbitUsers: 0, folioUsers: 0, persons: 8, ...patch })

describe('selection shape', () => {
  it('maps Suite to every product with seats', () => {
    expect(shapeOf({ plan: 'suite', seats: 12 })).toEqual({
      plan: 'suite',
      products: { work: true, muster: 'business', orbit: true, folio: true },
      quantities: { work: 0, muster: 0, orbit: 0, folioFirms: 0 },
      seats: 12,
    })
  })

  it('stores Folio firms beyond the included 2 and reads them back as a total', () => {
    const selection = { plan: 'custom' as const, work: 5, folio: true, folioFirms: 5 }
    const shape = shapeOf(selection)
    expect(shape.quantities.folioFirms).toBe(3)
    expect(selectionOf(shape)).toEqual(selection)
    expect(selectionLabel(selection)).toBe('Work 5 · Folio (5 firms)')
    expect(shapeOf({ plan: 'custom', work: 5, folioFirms: 6 }).quantities.folioFirms).toBe(0)
  })

  it('refuses fewer than the included firms', () => {
    expect(selectionSchema.safeParse({ plan: 'suite', seats: 10, folioFirms: 1 }).success).toBe(false)
    expect(selectionSchema.safeParse({ plan: 'suite', seats: 10, folioFirms: 4 }).success).toBe(true)
  })

  it('round-trips a custom plan through the stored fields', () => {
    const selection = { plan: 'custom' as const, work: 7, muster: { tier: 'business' as const, employees: 12 }, folio: true }
    const shape = shapeOf(selection)
    expect(shape.seats).toBe(7)
    expect(selectionOf(shape)).toEqual(selection)
    expect(sameSelection(selectionOf(shape), selection)).toBe(true)
  })

  it('treats a trial as no selection', () => {
    expect(selectionOf({ plan: 'trial' })).toBeNull()
  })

  it('labels plans the way the subscription page shows them', () => {
    expect(selectionLabel({ plan: 'suite', seats: 25 })).toBe('Suite, 25 people')
    expect(selectionLabel({ plan: 'custom', work: 7, muster: { tier: 'business', employees: 12 }, folio: true })).toBe('Work 7 · Muster Business 12 · Folio')
  })

  it('lists products a change adds', () => {
    expect(addedProducts({ work: true, muster: null, orbit: false, folio: false }, { work: true, muster: 'starter', orbit: true, folio: false })).toEqual(['muster', 'orbit'])
    expect(addedProducts(null, { work: true, muster: null, orbit: false, folio: true })).toEqual(['work', 'folio'])
  })
})

describe('selectionSchema', () => {
  it('refuses Suite below the 10-person minimum', () => {
    expect(selectionSchema.safeParse({ plan: 'suite', seats: 8 }).success).toBe(false)
  })
  it('accepts a custom plan with numbers as strings', () => {
    const parsed = selectionSchema.parse({ plan: 'custom', work: '6', orbit: 2 })
    expect(parsed).toEqual({ plan: 'custom', work: 6, orbit: 2 })
  })
})

describe('usageProblems', () => {
  it('needs Suite seats for everyone in use', () => {
    expect(usageProblems({ plan: 'suite', seats: 10 }, usage({ members: 12, persons: 14 }))['selection.seats']).toContain('14 people')
  })
  it('asks for at least one product', () => {
    expect(usageProblems({ plan: 'custom' }, usage()).selection).toBe('Choose at least one product.')
  })
  it('counts pending invites as Work users', () => {
    expect(usageProblems({ plan: 'custom', work: 9 }, usage({ members: 8, pendingInvites: 2 }))['selection.work']).toContain('at least 10')
  })
  it('caps Folio at 3 users', () => {
    expect(usageProblems({ plan: 'custom', work: 10, folio: true }, usage({ folioUsers: 4 }))['selection.folio']).toContain('Move to Suite')
  })
  it('refuses fewer firms than are active', () => {
    expect(usageProblems({ plan: 'custom', work: 10, folio: true }, usage({ folioFirms: 3 }))['selection.folioFirms']).toContain('3 active firms')
    expect(usageProblems({ plan: 'custom', work: 10, folio: true, folioFirms: 3 }, usage({ folioFirms: 3 }))).toEqual({})
    expect(usageProblems({ plan: 'suite', seats: 10 }, usage({ folioFirms: 4 }))['selection.folioFirms']).toBeDefined()
  })
  it('passes a plan that covers usage', () => {
    expect(usageProblems({ plan: 'custom', work: 10, muster: { tier: 'starter', employees: 20 } }, usage({ employees: 18 }))).toEqual({})
  })
})

describe('invoiceLines', () => {
  it('describes Suite per month with the period', () => {
    const quote = quoteSelection({ plan: 'suite', seats: 12 }, 'monthly')
    const [line] = invoiceLines(quote, { start: '2026-10-01', end: '2026-10-31' })
    expect(line.description).toBe('Flowbit Suite — 12 people × ₹149.00 per month · 1 Oct 2026 to 31 Oct 2026')
    expect(line.amountPaise).toBe(178_800)
  })
  it('describes Folio as a flat line', () => {
    const quote = quoteSelection({ plan: 'custom', folio: true }, 'yearly')
    expect(invoiceLines(quote, { start: '2026-10-01', end: '2027-09-30' })[0].description).toContain('Folio — workspace, includes 2 firms and 3 users')
  })
  it('adds a line for extra firms', () => {
    const quote = quoteSelection({ plan: 'custom', folio: true, folioFirms: 4 }, 'monthly')
    const lines = invoiceLines(quote, { start: '2026-10-01', end: '2026-10-31' })
    expect(lines[1]).toMatchObject({ productKey: 'folio_firm', quantity: 2, unitPaise: 19_900, amountPaise: 39_800 })
    expect(lines[1].description).toBe('Extra Folio firms — 2 firms × ₹199.00 per month · 1 Oct 2026 to 31 Oct 2026')
  })
})

describe('Razorpay signatures', () => {
  const secret = 'test_secret'
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('hex')

  it('verifies a subscription checkout (payment id first)', () => {
    const signature = sign('pay_1|sub_1')
    expect(verifyCheckoutSignature({ paymentId: 'pay_1', subscriptionId: 'sub_1', signature }, secret)).toBe(true)
    expect(verifyCheckoutSignature({ paymentId: 'sub_1', subscriptionId: 'pay_1', signature }, secret)).toBe(false)
  })
  it('verifies an order payment (order id first)', () => {
    expect(verifyOrderSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: sign('order_1|pay_1') }, secret)).toBe(true)
  })
  it('verifies a webhook body and refuses junk', () => {
    const body = '{"event":"subscription.charged"}'
    expect(verifyWebhookSignature(body, sign(body), secret)).toBe(true)
    expect(verifyWebhookSignature(body, 'not-hex', secret)).toBe(false)
    expect(verifyWebhookSignature(body, sign(body), '')).toBe(false)
  })
})

describe('pickerStart', () => {
  const u = usage({ members: 12, persons: 12, employees: 14, orbitUsers: 1 })
  it('starts a trial on Suite sized to usage', () => {
    expect(pickerStart({ plan: 'trial' }, u, {})).toMatchObject({ plan: 'suite', seats: 12, cycle: 'monthly' })
  })
  it('preselects a product from ?add', () => {
    expect(pickerStart({ plan: 'trial' }, u, { add: 'orbit' })).toMatchObject({ plan: 'custom', orbit: 2, work: null })
  })
  it('adds to the current custom plan and honours ?muster=business', () => {
    const sub = { plan: 'custom', cycle: 'yearly', products: { work: true, muster: 'starter', orbit: false, folio: false }, quantities: { work: 7, muster: 20, orbit: 0 } }
    expect(pickerStart(sub, u, { muster: 'business' })).toMatchObject({ plan: 'custom', cycle: 'yearly', work: 7, muster: { tier: 'business', employees: 20 } })
  })
  it('starts firms at what is active, never below the included 2', () => {
    expect(pickerStart({ plan: 'trial' }, u, {}).folioFirms).toBe(2)
    expect(pickerStart({ plan: 'trial' }, usage({ folioFirms: 4 }), {}).folioFirms).toBe(4)
    expect(pickerStart({ plan: 'suite', seats: 12, quantities: { folioFirms: 3 } }, u, {}).folioFirms).toBe(5)
  })
  it('keeps Suite when the product is already included', () => {
    expect(pickerStart({ plan: 'suite', seats: 25 }, u, { add: 'folio' })).toMatchObject({ plan: 'suite', seats: 25 })
  })
})

describe('quantity stepper typing', () => {
  it('lets a field pass through values below the minimum while typing 15', () => {
    expect(readTypedQuantity('1', 10)).toEqual({ draft: '1', value: null })
    expect(readTypedQuantity('15', 10)).toEqual({ draft: '15', value: 15 })
  })

  it('keeps digits only, allows clearing, and refuses values above the maximum', () => {
    expect(readTypedQuantity('', 10)).toEqual({ draft: '', value: null })
    expect(readTypedQuantity('2a5', 10)).toEqual({ draft: '25', value: 25 })
    expect(readTypedQuantity('25', 2, 20)).toEqual({ draft: '25', value: null })
    expect(readTypedQuantity('123456', 10)).toEqual({ draft: '12345', value: null })
  })

  it('applies the minimum and maximum only when committed', () => {
    expect(clampQuantity(1, 10)).toBe(10)
    expect(clampQuantity(Number(''), 10)).toBe(10)
    expect(clampQuantity(15, 10)).toBe(15)
    expect(clampQuantity(99, 2, 20)).toBe(20)
  })
})

describe('invoice PDF text', () => {
  it('prints rupee rates as Rs. and arrows as words, keeping dates together', () => {
    const nb = '\u00A0'
    expect(printableLine('Flowbit Suite — 25 people × ₹149.00 per month · 1 Oct 2026 to 31 Oct 2026')).toBe(
      `Flowbit Suite — 25 people × Rs. 149.00 per month · 1${nb}Oct${nb}2026 to 31${nb}Oct${nb}2026`,
    )
    expect(printableLine('Upgrade: Suite, 10 people → Suite, 15 people')).toBe('Upgrade: Suite, 10 people to Suite, 15 people')
  })
})
