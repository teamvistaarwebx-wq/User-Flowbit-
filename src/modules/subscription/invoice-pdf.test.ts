import { describe, expect, it } from 'vitest'
import { isNoGstInvoice, titleOf, type InvoiceForPdf } from './invoice-pdf'

const base: InvoiceForPdf = {
  number: 'FB/2026-27/0001',
  issueDate: '2026-10-11',
  periodStart: '2026-10-11',
  periodEnd: '2026-11-10',
  status: 'paid',
  sac: '998314',
  supplyType: 'no_gst',
  supplier: { legalName: 'Sanskaar Webx Services LLP', gstin: null },
  lines: [{ description: 'Suite', quantity: 10, unitPaise: 14_900, amountPaise: 149_000 }],
  taxableValuePaise: 149_000,
  totalPaise: 149_000,
}

describe('Flowbit invoice title without a GSTIN (owner decision D8)', () => {
  it('says it is not a tax invoice', () => {
    expect(isNoGstInvoice(base)).toBe(true)
    expect(titleOf(base)).toBe('INVOICE (NOT A TAX INVOICE)')
    expect(titleOf({ ...base, isTest: true })).toBe('INVOICE (NOT A TAX INVOICE) — TEST')
  })

  it('treats an older invoice stored with a GST supply type but no GSTIN the same way', () => {
    expect(isNoGstInvoice({ ...base, supplyType: 'inter_state' })).toBe(true)
  })

  it('is a tax invoice once Flowbit has a GSTIN', () => {
    const registered = { ...base, supplyType: 'intra_state', supplier: { gstin: '23ABCDE1234F1Z5' } }
    expect(isNoGstInvoice(registered)).toBe(false)
    expect(titleOf(registered)).toBe('TAX INVOICE')
    expect(titleOf({ ...registered, status: 'due', billType: 'proforma' })).toBe('PROFORMA INVOICE')
  })
})
