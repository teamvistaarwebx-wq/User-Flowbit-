import { describe, expect, test } from 'vitest'
import { isQuoteEditable, quoteEditRefusal, statusAfterRelease } from './rules'

describe('statusAfterRelease', () => {
  test('a quote converted while sent goes back to sent, not accepted', () => {
    expect(statusAfterRelease({ statusBeforeConvert: 'sent', sentAt: new Date() })).toBe('sent')
  })

  test('a quote converted while draft or accepted keeps that status', () => {
    expect(statusAfterRelease({ statusBeforeConvert: 'draft' })).toBe('draft')
    expect(statusAfterRelease({ statusBeforeConvert: 'accepted', acceptedAt: new Date() })).toBe('accepted')
  })

  test('without a recorded status, falls back on the timestamps', () => {
    expect(statusAfterRelease({ acceptedAt: new Date(), sentAt: new Date() })).toBe('accepted')
    expect(statusAfterRelease({ sentAt: new Date() })).toBe('sent')
    expect(statusAfterRelease({})).toBe('draft')
  })

  test('ignores a status a quote cannot convert from', () => {
    expect(statusAfterRelease({ statusBeforeConvert: 'declined', sentAt: new Date() })).toBe('sent')
  })
})

describe('quote editing', () => {
  test('draft and sent quotes can be edited', () => {
    expect(isQuoteEditable('draft')).toBe(true)
    expect(quoteEditRefusal('sent')).toBeNull()
  })

  test('accepted and declined quotes cannot be re-priced, and point to Duplicate', () => {
    expect(isQuoteEditable('accepted')).toBe(false)
    expect(quoteEditRefusal('accepted')).toMatch(/Duplicate it/)
    expect(quoteEditRefusal('declined')).toMatch(/Duplicate it/)
  })

  test('a converted quote cannot change', () => {
    expect(quoteEditRefusal('converted')).toMatch(/already converted/)
  })
})
