import { describe, expect, test } from 'vitest'
import { invoiceCoherenceError, irnVoidRefusal, lockedMessage, touchesFrozen, updatedFields } from './rules'

const issued = { status: 'issued', number: 'VWX/2026-27/0001', issueDate: '2026-10-01', dueDate: '2026-10-16', documentType: 'tax_invoice', cgstPaise: 900, sgstPaise: 900, igstPaise: 0, entityGstin: '23AAXFS1234A1Z5', reverseCharge: false }

describe('invoiceCoherenceError', () => {
  test('a coherent issued invoice passes', () => {
    expect(invoiceCoherenceError(issued)).toBeNull()
  })

  test('a draft cannot hold a number', () => {
    expect(invoiceCoherenceError({ ...issued, status: 'draft' })).toBe('A draft invoice cannot hold a number.')
  })

  test('an issued invoice must have a number', () => {
    expect(invoiceCoherenceError({ ...issued, number: null })).toBe('An issued invoice must have a number.')
  })

  test('the due date cannot precede the issue date', () => {
    expect(invoiceCoherenceError({ ...issued, dueDate: '2026-09-30' })).toMatch(/due date/)
  })

  test('a sale invoice cannot carry tax', () => {
    expect(invoiceCoherenceError({ ...issued, documentType: 'sale_invoice', entityGstin: null })).toMatch(/sale invoice/)
    expect(invoiceCoherenceError({ ...issued, documentType: 'sale_invoice', entityGstin: null, cgstPaise: 0, sgstPaise: 0 })).toBeNull()
  })

  test('CGST and SGST cannot differ', () => {
    expect(invoiceCoherenceError({ ...issued, sgstPaise: 901 })).toBe('CGST and SGST must be exactly equal.')
  })

  test('IGST and CGST cannot coexist', () => {
    expect(invoiceCoherenceError({ ...issued, igstPaise: 100 })).toMatch(/IGST and CGST/)
  })
})

describe('frozen field guard', () => {
  test('re-pricing through $set touches a frozen field', () => {
    expect(touchesFrozen({ $set: { totalPaise: 1 } })).toBe(true)
  })

  test('changing a line through a dotted path touches lines', () => {
    expect(touchesFrozen({ $set: { 'lines.0.ratePaise': 1 } })).toBe(true)
    expect(updatedFields({ $push: { lines: {} } }).has('lines')).toBe(true)
  })

  test('a bare replacement key counts too', () => {
    expect(touchesFrozen({ issueDate: '2026-10-02' })).toBe(true)
  })

  test('an unrelated field stays writable', () => {
    expect(touchesFrozen({ $set: { internalNotes: 'Called them', balancePaise: 0, status: 'paid' } })).toBe(false)
  })

  test('the locked message names the invoice', () => {
    expect(lockedMessage('VWX/2026-27/0007')).toBe('Invoice VWX/2026-27/0007 is issued and its figures are locked. Raise a credit note instead.')
  })
})

describe('irnVoidRefusal', () => {
  test('an invoice without an active IRN can be voided', () => {
    expect(irnVoidRefusal(null)).toBeNull()
  })

  test('inside the cancel window, asks to cancel the IRN first', () => {
    expect(irnVoidRefusal(true)).toMatch(/Cancel the IRN first/)
  })

  test('after the cancel window, points to a credit note', () => {
    expect(irnVoidRefusal(false)).toMatch(/Raise a credit note instead/)
  })
})
