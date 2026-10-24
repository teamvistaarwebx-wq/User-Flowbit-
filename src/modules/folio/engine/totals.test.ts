import { describe, expect, test } from 'vitest'
import { computeInvoice, balanceDue } from './totals'
import { toPaise } from './money'

const line = (rate: number, gstRatePercent = 18, quantity = 1, discountPercent = 0) => ({
  description: 'Service',
  quantity,
  rate: toPaise(rate),
  gstRatePercent,
  discountPercent,
})

describe('computeInvoice', () => {
  test('charges CGST and SGST as equal halves on an intra-state supply', () => {
    const result = computeInvoice({ lines: [line(100_000)], supplyType: 'intra_state' })

    expect(result.taxableValue).toBe(toPaise(100_000))
    expect(result.cgstAmount).toBe(toPaise(9_000))
    expect(result.sgstAmount).toBe(toPaise(9_000))
    expect(result.igstAmount).toBe(0)
    expect(result.total).toBe(toPaise(118_000))
  })

  test('charges IGST at the full rate on an inter-state supply', () => {
    const result = computeInvoice({ lines: [line(100_000)], supplyType: 'inter_state' })

    expect(result.igstAmount).toBe(toPaise(18_000))
    expect(result.cgstAmount).toBe(0)
    expect(result.sgstAmount).toBe(0)
    expect(result.total).toBe(toPaise(118_000))
  })

  test('charges no tax on a sale invoice, whatever rate the line carries', () => {
    const result = computeInvoice({ lines: [line(100_000, 18)], supplyType: 'exempt' })

    expect(result.taxAmount).toBe(0)
    expect(result.total).toBe(toPaise(100_000))
    expect(result.lines[0].gstRatePercent).toBe(0)
  })

  test('zero-rates an export without discarding the taxable value', () => {
    const result = computeInvoice({ lines: [line(50_000)], supplyType: 'export' })

    expect(result.taxableValue).toBe(toPaise(50_000))
    expect(result.taxAmount).toBe(0)
  })

  test('multiplies quantity by rate, to three decimals of quantity', () => {
    const result = computeInvoice({
      lines: [line(2_000, 18, 7.5)],
      supplyType: 'intra_state',
    })

    expect(result.subtotal).toBe(toPaise(15_000))
  })

  test('takes a line discount off the gross before tax', () => {
    const result = computeInvoice({
      lines: [line(100_000, 18, 1, 10)],
      supplyType: 'inter_state',
    })

    expect(result.taxableValue).toBe(toPaise(90_000))
    expect(result.igstAmount).toBe(toPaise(16_200))
    expect(result.total).toBe(toPaise(106_200))
  })

  test('apportions an invoice-level discount across lines before taxing them', () => {
    // Two lines at different rates: the split changes the tax, so charging
    // the discount against the total instead of the lines would be wrong.
    const result = computeInvoice({
      lines: [line(60_000, 18), line(40_000, 5)],
      supplyType: 'inter_state',
      discountType: 'amount',
      discountValue: toPaise(10_000),
    })

    expect(result.taxableValue).toBe(toPaise(90_000))
    expect(result.lines[0].taxableValue).toBe(toPaise(54_000))
    expect(result.lines[1].taxableValue).toBe(toPaise(36_000))
    expect(result.lines[0].igstAmount).toBe(toPaise(9_720))
    expect(result.lines[1].igstAmount).toBe(toPaise(1_800))
    expect(result.igstAmount).toBe(toPaise(11_520))
  })

  test('applies a percentage discount to the whole invoice', () => {
    const result = computeInvoice({
      lines: [line(100_000)],
      supplyType: 'inter_state',
      discountType: 'percent',
      discountValue: 25,
    })

    expect(result.discountAmount).toBe(toPaise(25_000))
    expect(result.taxableValue).toBe(toPaise(75_000))
  })

  test('never lets a flat discount drive the invoice negative', () => {
    const result = computeInvoice({
      lines: [line(1_000)],
      supplyType: 'inter_state',
      discountType: 'amount',
      discountValue: toPaise(9_999),
    })

    expect(result.taxableValue).toBe(0)
    expect(result.total).toBe(0)
  })

  test('apportioned discount shares add back up to the discount', () => {
    // 3 lines, an amount that does not divide evenly: the remainder has to
    // land somewhere or the invoice is out by a paisa.
    const result = computeInvoice({
      lines: [line(1_000), line(1_000), line(1_000)],
      supplyType: 'inter_state',
      discountType: 'amount',
      discountValue: 1_00, // ₹1.00 across three lines
    })

    const shared = result.lines.reduce((sum, l) => sum + l.discountAmount, 0)
    expect(shared).toBe(100)
    expect(result.taxableValue).toBe(toPaise(3_000) - 100)
  })

  test('keeps CGST and SGST exactly equal even when the tax is an odd number of paise', () => {
    // 18% of ₹1,000.05 is ₹180.009 -> 18001 paise, which does not halve evenly.
    const result = computeInvoice({
      lines: [{ description: 'Odd', quantity: 1, rate: 100_005, gstRatePercent: 18 }],
      supplyType: 'intra_state',
    })

    expect(result.cgstAmount).toBe(result.sgstAmount)
  })

  test('rounds the total to the nearest rupee and records the adjustment', () => {
    const result = computeInvoice({
      lines: [{ description: 'Odd', quantity: 1, rate: 100_040, gstRatePercent: 18 }],
      supplyType: 'inter_state',
    })

    expect(result.total % 100).toBe(0)
    expect(result.total).toBe(result.taxableValue + result.taxAmount + result.roundOff)
  })

  test('leaves the total unrounded when rounding is switched off', () => {
    const result = computeInvoice({
      lines: [{ description: 'Odd', quantity: 1, rate: 100_040, gstRatePercent: 18 }],
      supplyType: 'inter_state',
      roundOffTotal: false,
    })

    expect(result.roundOff).toBe(0)
    expect(result.total).toBe(result.taxableValue + result.taxAmount)
  })

  test('computes TDS on the taxable value, not on the tax', () => {
    const result = computeInvoice({
      lines: [line(100_000)],
      supplyType: 'inter_state',
      tdsPercent: 10,
    })

    expect(result.tdsAmount).toBe(toPaise(10_000))
    expect(result.expectedReceipt).toBe(toPaise(108_000))
  })

  test('an empty invoice totals zero rather than throwing', () => {
    const result = computeInvoice({ lines: [], supplyType: 'intra_state' })

    expect(result.total).toBe(0)
    expect(result.lines).toHaveLength(0)
  })

  test('line totals always add up to the invoice total before rounding', () => {
    const result = computeInvoice({
      lines: [line(12_345, 18), line(6_789, 12), line(999, 5)],
      supplyType: 'intra_state',
      discountType: 'percent',
      discountValue: 7.5,
    })

    const summed = result.lines.reduce((total, l) => total + l.lineTotal, 0)
    expect(summed + result.roundOff).toBe(result.total)
  })
})

describe('balanceDue', () => {
  test('subtracts payments and credit notes', () => {
    expect(balanceDue(toPaise(1_000), toPaise(400), toPaise(100))).toBe(toPaise(500))
  })

  test('never reports a negative balance', () => {
    expect(balanceDue(toPaise(1_000), toPaise(1_200), 0)).toBe(0)
  })
})
