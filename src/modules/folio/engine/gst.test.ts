import { describe, expect, test } from 'vitest'
import { clientStateCode, gstinMatchesState, isTaxable, isValidGstin, isValidPan, panOfGstin, resolveSupplyType, stateCodeOfGstin } from './gst'
import { gstCodeFromAny, gstCodeFromStateLetters, sgstLabel, stateLabelOf } from './states'

const MP_GSTIN = '23AAXFS1234A1Z5'
const MAHARASHTRA_GSTIN = '27AABCA1234B1Z9'

describe('isValidGstin', () => {
  test('accepts a well-formed GSTIN', () => {
    expect(isValidGstin(MP_GSTIN)).toBe(true)
  })

  test('accepts lower case and surrounding whitespace', () => {
    expect(isValidGstin('  23aaxfs1234a1z5 ')).toBe(true)
  })

  test('rejects the wrong length', () => {
    expect(isValidGstin('23AAXFS1234A1Z')).toBe(false)
    expect(isValidGstin('23AAXFS1234A1Z55')).toBe(false)
  })

  test('rejects a GSTIN without the Z in position 14', () => {
    expect(isValidGstin('23AAXFS1234A1Y5')).toBe(false)
  })

  test('rejects a PAN block that is not five letters and four digits', () => {
    expect(isValidGstin('23AAXF12345A1Z5')).toBe(false)
  })

  test('rejects an empty string', () => {
    expect(isValidGstin('')).toBe(false)
  })
})

describe('isValidPan', () => {
  test('accepts a well-formed PAN', () => {
    expect(isValidPan('AAXFS1234A')).toBe(true)
  })

  test('rejects a PAN with the wrong shape', () => {
    expect(isValidPan('AAXFS1234')).toBe(false)
    expect(isValidPan('AAXF51234A')).toBe(false)
  })
})

describe('stateCodeOfGstin and panOfGstin', () => {
  test('reads the state code from the first two characters', () => {
    expect(stateCodeOfGstin(MP_GSTIN)).toBe('23')
    expect(stateCodeOfGstin(MAHARASHTRA_GSTIN)).toBe('27')
  })

  test('reads the embedded PAN', () => {
    expect(panOfGstin(MP_GSTIN)).toBe('AAXFS1234A')
  })

  test('returns null rather than a wrong answer for an invalid GSTIN', () => {
    expect(stateCodeOfGstin('nonsense')).toBeNull()
    expect(panOfGstin('nonsense')).toBeNull()
  })
})

describe('gstinMatchesState', () => {
  test('catches a GSTIN filed against the wrong state', () => {
    expect(gstinMatchesState(MAHARASHTRA_GSTIN, '23')).toBe(false)
  })

  test('accepts a GSTIN that agrees with its state', () => {
    expect(gstinMatchesState(MAHARASHTRA_GSTIN, '27')).toBe(true)
  })
})

describe('resolveSupplyType', () => {
  const taxInvoice = { documentType: 'tax_invoice' as const, entityStateCode: '23' }

  test('same state means CGST and SGST', () => {
    expect(resolveSupplyType({ ...taxInvoice, placeOfSupplyStateCode: '23' })).toBe('intra_state')
  })

  test('a different state means IGST', () => {
    expect(resolveSupplyType({ ...taxInvoice, placeOfSupplyStateCode: '27' })).toBe('inter_state')
  })

  test('a sale invoice is never taxable, whatever the states say', () => {
    expect(resolveSupplyType({ documentType: 'sale_invoice', entityStateCode: '23', placeOfSupplyStateCode: '23' })).toBe('exempt')
  })

  test('exports and SEZ supplies are zero-rated', () => {
    expect(resolveSupplyType({ ...taxInvoice, placeOfSupplyStateCode: '23', isExport: true })).toBe('export')
    expect(resolveSupplyType({ ...taxInvoice, placeOfSupplyStateCode: '23', isSez: true })).toBe('sez')
  })

  test('falls back to inter-state when a state is unknown', () => {
    expect(resolveSupplyType({ ...taxInvoice, placeOfSupplyStateCode: null })).toBe('inter_state')
    expect(resolveSupplyType({ documentType: 'tax_invoice', entityStateCode: null, placeOfSupplyStateCode: '23' })).toBe('inter_state')
  })
})

describe('isTaxable', () => {
  test('only intra- and inter-state supplies carry tax', () => {
    expect(isTaxable('intra_state')).toBe(true)
    expect(isTaxable('inter_state')).toBe(true)
    expect(isTaxable('export')).toBe(false)
    expect(isTaxable('sez')).toBe(false)
    expect(isTaxable('exempt')).toBe(false)
  })
})

describe('clientStateCode', () => {
  const client = { gstin: MAHARASHTRA_GSTIN, state: 'MP', billingAddress: { state: 'Karnataka' } }

  test('the profile override wins', () => {
    expect(clientStateCode(client, { placeOfSupplyStateCode: '07' })).toBe('07')
  })

  test('then a valid GSTIN', () => {
    expect(clientStateCode(client, null)).toBe('27')
  })

  test('then the client state letters', () => {
    expect(clientStateCode({ ...client, gstin: null })).toBe('23')
  })

  test('then the billing address state, by letters or name', () => {
    expect(clientStateCode({ billingAddress: { state: 'Karnataka' } })).toBe('29')
    expect(clientStateCode({ billingAddress: { state: 'ka' } })).toBe('29')
  })

  test('otherwise null', () => {
    expect(clientStateCode({ gstin: 'bad', state: null })).toBeNull()
  })
})

describe('states', () => {
  test('converts letters, alternates and names to GST codes', () => {
    expect(gstCodeFromStateLetters('MP')).toBe('23')
    expect(gstCodeFromStateLetters('OR')).toBe('21')
    expect(gstCodeFromStateLetters('tg')).toBe('36')
    expect(gstCodeFromAny('Madhya Pradesh')).toBe('23')
    expect(gstCodeFromAny('ZZ')).toBeNull()
  })

  test('labels states for documents', () => {
    expect(stateLabelOf('23')).toBe('Madhya Pradesh (23)')
  })

  test('flags UTGST only for union territories without a legislature', () => {
    expect(sgstLabel('04')).toBe('UTGST')
    expect(sgstLabel('38')).toBe('UTGST')
    expect(sgstLabel('07')).toBe('SGST')
    expect(sgstLabel('23')).toBe('SGST')
  })
})
