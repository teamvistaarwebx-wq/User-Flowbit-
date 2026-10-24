import { describe, expect, test } from 'vitest'
import { changedDetails, detailsRefusedMessage, detailsSavedMessage } from './details'

describe('self-service details', () => {
  test('lists only fields that changed', () => {
    expect(changedDetails({ phone: '9826012345', pan: 'ABCDE1234F' }, { phone: '9826099999', pan: 'ABCDE1234F' })).toEqual(['phone'])
  })

  test('says what was saved, and that a new account is verified by HR', () => {
    expect(detailsSavedMessage(['phone', 'accountNumber'])).toBe('Saved your phone and account number. Someone in HR or Finance will verify the new account before the next payroll run.')
    expect(detailsSavedMessage([])).toBe('Nothing had changed, so your details are as they were.')
  })

  test('names a single bad field, or asks to fix several', () => {
    expect(detailsRefusedMessage({ pan: 'Enter a valid PAN like ABCDE1234F' })).toBe('PAN: Enter a valid PAN like ABCDE1234F')
    expect(detailsRefusedMessage({ uan: 'UAN: use the format 12 digits' })).toBe('UAN: use the format 12 digits')
    expect(detailsRefusedMessage({ pan: 'x', uan: 'y' })).toBe('Please correct the highlighted fields.')
  })
})
