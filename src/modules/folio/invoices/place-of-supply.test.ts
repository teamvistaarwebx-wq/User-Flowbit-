import { describe, expect, test } from 'vitest'
import { placeOfSupplyIsStale, type PlaceOfSupplyCheck } from './place-of-supply'

const base: PlaceOfSupplyCheck = { isTax: true, supplyType: 'intra_state', placeOfSupplyStateCode: '23', clientStateCodeAtSave: '23', clientStateCodeNow: '23' }

describe('placeOfSupplyIsStale', () => {
  test('refuses when the client state the draft used has changed since', () => {
    expect(placeOfSupplyIsStale({ ...base, clientStateCodeNow: '27' })).toBe(true)
  })

  test('keeps a place of supply picked on the draft, whatever the client says now', () => {
    expect(placeOfSupplyIsStale({ ...base, placeOfSupplyStateCode: '27', clientStateCodeNow: '29' })).toBe(false)
  })

  test('passes when nothing changed', () => {
    expect(placeOfSupplyIsStale(base)).toBe(false)
  })

  test('skips drafts saved before the check, sale invoices and zero-rated supplies', () => {
    expect(placeOfSupplyIsStale({ ...base, clientStateCodeAtSave: null, clientStateCodeNow: '27' })).toBe(false)
    expect(placeOfSupplyIsStale({ ...base, isTax: false, clientStateCodeNow: '27' })).toBe(false)
    expect(placeOfSupplyIsStale({ ...base, supplyType: 'export', clientStateCodeNow: '27' })).toBe(false)
  })
})
