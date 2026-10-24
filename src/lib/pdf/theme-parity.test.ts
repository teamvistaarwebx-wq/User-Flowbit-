import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, MIN_TEXT_CONTRAST, MIN_UI_CONTRAST, resolveTheme, themeCss, workspaceTheme } from '@/lib/brand-theme'
import { FLOWBIT_PDF_BRAND, pdfBrandForOrg, readableOnPaper } from './brand'

const OCEAN = { primary: '#3ba7e0', secondary: '#1e3a8a', accent: '#a5e4ff' }
const SUNNY = { primary: '#ffd400', secondary: '#ffe066', accent: '#fff3b0' }

const ORGS = {
  suiteOcean: { subscription: { plan: 'suite', status: 'active' }, theme: OCEAN },
  suiteLight: { subscription: { plan: 'suite', status: 'active' }, theme: SUNNY },
  suiteDefault: { subscription: { plan: 'suite', status: 'active' }, theme: DEFAULT_THEME },
  suiteUnset: { subscription: { plan: 'suite', status: 'active' } },
  customPlan: { subscription: { plan: 'custom', status: 'active' }, theme: OCEAN },
  trial: { subscription: { plan: 'trial', status: 'trialing', trialEndsAt: new Date(Date.now() + 864e5) }, theme: OCEAN },
  free: { subscription: { plan: 'trial', status: 'trialing', accountType: 'free' }, theme: OCEAN },
} as const

describe('app shell and PDF colours come from one function', () => {
  for (const [label, org] of Object.entries(ORGS)) {
    it(`${label}: the PDF wears the brand exactly when the shell does, in the same colours`, () => {
      const shown = workspaceTheme(org as never)
      const shellBranded = themeCss(shown) !== ''
      const pdf = pdfBrandForOrg(org as never)
      expect(pdf.heading !== FLOWBIT_PDF_BRAND.heading || pdf.accent !== FLOWBIT_PDF_BRAND.accent).toBe(shellBranded)
      // Same source colours, darkened for paper only as far as reading needs.
      const theme = resolveTheme(shown)
      expect(pdf.heading).toBe(readableOnPaper(theme.secondary, MIN_TEXT_CONTRAST))
      expect(pdf.accent).toBe(readableOnPaper(theme.primary, MIN_UI_CONTRAST))
    })
  }

  it('a plan without brand colours shows Flowbit in both, even with a stored theme', () => {
    expect(workspaceTheme(ORGS.customPlan as never)).toBeNull()
    expect(themeCss(workspaceTheme(ORGS.customPlan as never))).toBe('')
    expect(pdfBrandForOrg(ORGS.customPlan as never)).toEqual(FLOWBIT_PDF_BRAND)
  })

  it('a light brand colour is darkened on paper, never swapped for another hue', () => {
    const pdf = pdfBrandForOrg(ORGS.suiteLight as never)
    expect(pdf.heading).not.toBe(SUNNY.secondary)
    expect(pdf.heading).toBe(readableOnPaper(SUNNY.secondary, MIN_TEXT_CONTRAST))
  })

  it('the shell and the PDF base both call workspaceTheme (so they cannot drift)', () => {
    const src = (file: string) => readFileSync(path.join(process.cwd(), 'src', file), 'utf8')
    expect(src('components/shell/data.ts')).toContain('themeCss(workspaceTheme(ctx.org))')
    expect(src('lib/pdf/brand.ts')).toContain('pdfBrandOf(workspaceTheme(org))')
    expect(src('lib/pdf/org-branding.ts')).toContain('pdfBrandForOrg(org)')
  })
})
