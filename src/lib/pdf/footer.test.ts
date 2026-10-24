import { describe, expect, it } from 'vitest'
import { footerText, saysNoSignatureNeeded, signatureStateOf, UNSIGNED_FOOTER } from './footer'

const SIGNED = { imageSrc: 'data:image/png;base64,AAAA' }
const BLANK = { imageSrc: null }

describe('signatureStateOf', () => {
  it('tells no block, a blank rule and a signed block apart', () => {
    expect(signatureStateOf(null)).toBe('none')
    expect(signatureStateOf(undefined)).toBe('none')
    expect(signatureStateOf(BLANK)).toBe('blank')
    expect(signatureStateOf({})).toBe('blank')
    expect(signatureStateOf(SIGNED)).toBe('signed')
  })
  it('allows the "no signature needed" line only without a signature block', () => {
    expect(saysNoSignatureNeeded(null)).toBe(true)
    expect(saysNoSignatureNeeded(BLANK)).toBe(false)
    expect(saysNoSignatureNeeded(SIGNED)).toBe(false)
  })
})

describe('footerText', () => {
  const parts = ['Vistaar WebX — a brand of Sanskaar Webx Services LLP', 'VWX/0007']
  it('appends the computer-generated line when there is no signature block', () => {
    expect(footerText(parts, null)).toBe(`${parts.join(' · ')} · ${UNSIGNED_FOOTER}`)
  })
  it('keeps a neutral footer (brand line and number) for a blank signature block', () => {
    expect(footerText(parts, BLANK)).toBe(parts.join(' · '))
  })
  it('never says a signed document needs no signature', () => {
    const text = footerText(parts, SIGNED)
    expect(text).toBe(parts.join(' · '))
    expect(text).not.toMatch(/signature|computer-generated/i)
  })
  it('drops empty and falsy parts', () => {
    expect(footerText(['A', null, '', '  ', false, undefined, 'B'], SIGNED)).toBe('A · B')
    expect(footerText([], null)).toBe(UNSIGNED_FOOTER)
  })
})
