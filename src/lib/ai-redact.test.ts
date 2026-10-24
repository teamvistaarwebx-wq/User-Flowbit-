import { describe, expect, it } from 'vitest'
import { redactSensitive } from './ai-redact'

describe('redactSensitive', () => {
  it('removes PAN, IFSC and bank account numbers', () => {
    const out = redactSensitive('PAN ABCDE1234F, IFSC HDFC0001234, account 50100123456789')
    expect(out).not.toMatch(/ABCDE1234F|HDFC0001234|50100123456789/)
    expect(out).toContain('[IFSC removed]')
    expect(out).toContain('[number removed]')
  })

  it('removes salary and CTC amounts but keeps the words around them', () => {
    const out = redactSensitive('Offer Vikram a CTC of ₹12,00,000 and salary 45k from Nov')
    expect(out).toBe('Offer Vikram a CTC of [amount removed] and salary [amount removed] from Nov')
  })

  it('leaves ordinary work text alone', () => {
    const text = 'Ship the landing page by 12 Oct; 3 tasks left, 40% done, ticket WEB-142'
    expect(redactSensitive(text)).toBe(text)
  })
})
