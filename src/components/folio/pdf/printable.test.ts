import { describe, expect, test } from 'vitest'
import { printable, printableModel } from './printable'

describe('printable', () => {
  test('keeps Latin-1 text as it is', () => {
    expect(printable('Café & Sons (Pvt.) Ltd – “Q4”')).toBe('Café & Sons (Pvt.) Ltd – “Q4”')
  })

  test('drops accents the font cannot draw to the base letter', () => {
    expect(printable('Ānand Ōberoi & Sons')).toBe('Anand Oberoi & Sons')
    expect(printable('Client Ācme')).toBe('Client Acme')
  })

  test('removes emoji, including joined and flagged ones', () => {
    expect(printable('Ācme & Sons 🚀')).toBe('Acme & Sons')
    expect(printable('Website design 🎨 for 👩‍💻 team 🇮🇳')).toBe('Website design for team')
  })

  test('prints the rupee sign as Rs. and other unknown letters as ?', () => {
    expect(printable('₹500')).toBe('Rs.500')
    expect(printable('राम')).toBe('???')
  })
})

describe('printableModel', () => {
  test('walks nested strings and leaves image sources alone', () => {
    const model = { billTo: { name: 'Ācme 🚀', addressLines: ['Ōld Road'] }, totalPaise: 100, signatory: { imageSrc: '/files/Ā.png' } }
    expect(printableModel(model)).toEqual({ billTo: { name: 'Acme', addressLines: ['Old Road'] }, totalPaise: 100, signatory: { imageSrc: '/files/Ā.png' } })
  })
})
