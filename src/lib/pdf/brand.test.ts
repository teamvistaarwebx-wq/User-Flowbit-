import { describe, expect, it } from 'vitest'
import { contrastRatio, DEFAULT_THEME, MIN_TEXT_CONTRAST, MIN_UI_CONTRAST } from '@/lib/brand-theme'
import { darken, FLOWBIT_PDF_BRAND, pdfBrandForOrg, pdfBrandOf, readableOnPaper, textOn } from './brand'

const WHITE = '#ffffff'
const SUITE = { subscription: { plan: 'suite', status: 'active' } } as const

describe('PDF brand colours', () => {
  it("falls back to Flowbit's colours without a theme, and the defaults map onto them", () => {
    expect(pdfBrandOf(null)).toEqual(FLOWBIT_PDF_BRAND)
    expect(pdfBrandOf({ primary: 'blue' })).toEqual(FLOWBIT_PDF_BRAND)
    expect(pdfBrandOf(DEFAULT_THEME)).toEqual(FLOWBIT_PDF_BRAND)
  })
  it('keeps a dark brand colour as it is', () => {
    const b = pdfBrandOf({ primary: '#0057b8', secondary: '#003a70' })
    expect(b.heading).toBe('#003a70')
    expect(b.accent).toBe('#0057b8')
    expect(b.onHeading).toBe(WHITE)
  })
  it('darkens a light brand colour until headings read on paper (4.5:1) and accents reach 3:1', () => {
    for (const light of ['#ffd400', '#7fe0c8', '#f2a7c3', '#ffffff']) {
      const b = pdfBrandOf({ primary: light, secondary: light })
      expect(contrastRatio(b.heading, WHITE)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
      expect(contrastRatio(b.accent, WHITE)).toBeGreaterThanOrEqual(MIN_UI_CONTRAST)
      expect(contrastRatio(b.onHeading, b.heading)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
    }
  })
  it('stays close to the brand: the lightest shade that passes', () => {
    const shade = readableOnPaper('#ffd400', MIN_TEXT_CONTRAST)
    expect(contrastRatio(shade, WHITE)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
    expect(shade).not.toBe('#ffd400')
    expect(darken('#808080', 0.5)).toBe('#404040')
  })
  it('picks white or ink text for a filled heading', () => {
    expect(textOn('#111111')).toBe(WHITE)
    expect(textOn('#f5f5f5')).not.toBe(WHITE)
  })
  it('uses the workspace theme only when its plan allows brand colours', () => {
    expect(pdfBrandForOrg({ ...SUITE, theme: { secondary: '#003a70', primary: '#0057b8' } }).heading).toBe('#003a70')
    expect(pdfBrandForOrg({ subscription: { plan: 'custom', status: 'active' }, theme: { secondary: '#003a70' } } as never)).toEqual(FLOWBIT_PDF_BRAND)
  })
})
