import { describe, expect, test } from 'vitest'
import { priceDocument, type PriceContext } from './pricing'

const line = { description: 'Growth retainer', quantity: 1, unit: 'month', ratePaise: 12_500_000, discountPercent: 0, gstRatePercent: 18 }
const base: PriceContext = { entityKind: 'gst', entityStateCode: '23', clientStateCode: '27', supplyMode: 'auto', lines: [line], discountType: null, discountValue: 0, tdsPercent: 0, roundOffTotal: true }

describe('priceDocument', () => {
  test('a reverse charge invoice shows the GST but bills only the taxable value', () => {
    const p = priceDocument({ ...base, reverseCharge: true })
    expect(p.igstPaise).toBe(2_250_000)
    expect(p.totalPaise).toBe(p.taxablePaise)
    expect(p.expectedReceiptPaise).toBe(12_500_000)
  })

  test('a tax invoice across states charges IGST', () => {
    const p = priceDocument(base)
    expect(p.documentType).toBe('tax_invoice')
    expect(p.supplyType).toBe('inter_state')
    expect(p.igstPaise).toBe(2_250_000)
    expect(p.totalPaise).toBe(14_750_000)
    expect(p.lines[0].position).toBe(1)
  })

  test('the place-of-supply override wins over the client state', () => {
    const p = priceDocument({ ...base, placeOfSupplyStateCode: '23' })
    expect(p.supplyType).toBe('intra_state')
    expect(p.cgstPaise).toBe(1_125_000)
    expect(p.sgstPaise).toBe(1_125_000)
  })

  test('a non-GST entity issues a sale invoice with no tax and no place of supply', () => {
    const p = priceDocument({ ...base, entityKind: 'non_gst' })
    expect(p.documentType).toBe('sale_invoice')
    expect(p.supplyType).toBe('exempt')
    expect(p.totalPaise).toBe(12_500_000)
    expect(p.lines[0].gstRatePercent).toBe(0)
    expect(p.placeOfSupplyStateCode).toBeNull()
  })

  test('export mode zero-rates the supply', () => {
    const p = priceDocument({ ...base, supplyMode: 'export' })
    expect(p.supplyType).toBe('export')
    expect(p.taxablePaise).toBe(12_500_000)
    expect(p.igstPaise).toBe(0)
  })

  test('expected TDS is on the taxable value', () => {
    const p = priceDocument({ ...base, tdsPercent: 10 })
    expect(p.tdsPaise).toBe(1_250_000)
    expect(p.expectedReceiptPaise).toBe(13_500_000)
  })

  test('no discount type stores a zero discount value', () => {
    expect(priceDocument({ ...base, discountValue: 50 }).discountValue).toBe(0)
  })
})
