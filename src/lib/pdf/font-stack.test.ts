import { createRequire } from 'node:module'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { DEVANAGARI_FAMILY, PDF_FALLBACK_FAMILY, WORK_SANS_EXT_FAMILY, WORK_SANS_FAMILY, pdfFontStack } from './font-stack'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/pdf/org-branding', () => ({ companyPdfOf: vi.fn(), pdfSignature: vi.fn() }))

const { DEVANAGARI_DIR, PDF_DEVANAGARI_FONT, PDF_EXT_FONT, PDF_FONT, PDF_FONT_STACK, workSansFile } = await import('./base')
const { BODIES } = await import('@/modules/muster/letters/bodies')
const { LetterDocument } = await import('@/modules/muster/letters/pdf')
const { renderPdf } = await import('./base')
const { renderTemplate } = await import('@/modules/muster/letters/render')

type Glyphs = { hasGlyphForCodePoint: (codePoint: number) => boolean }
// fontkit is react-pdf's own font reader (no types shipped), so it is required, not imported.
const fontkit = createRequire(import.meta.url)('fontkit') as { openSync: (file: string) => Glyphs }
const open = (file: string): Glyphs => fontkit.openSync(file)

/** The regular-weight file behind each family in the page stack, as base.tsx registers them. */
const FILE_OF: Record<string, string> = {
  [WORK_SANS_FAMILY]: workSansFile('latin', 400),
  [WORK_SANS_EXT_FAMILY]: workSansFile('latin-ext', 400),
  [DEVANAGARI_FAMILY]: path.join(DEVANAGARI_DIR, 'NotoSansDevanagari-Regular.ttf'),
}
const stackFonts = (): Glyphs[] => PDF_FONT_STACK.map((family) => open(FILE_OF[family]))
const covered = (fonts: Glyphs[], codePoint: number) => fonts.some((font) => font.hasGlyphForCodePoint(codePoint))

/** Every ToUnicode map in the PDF, inflated: lists the code points each embedded font subset prints. */
function toUnicodeMaps(pdf: Buffer): string {
  const text = pdf.toString('latin1')
  const maps: string[] = []
  for (const match of text.matchAll(/stream\r?\n/g)) {
    const start = (match.index ?? 0) + match[0].length
    const end = text.indexOf('endstream', start)
    try {
      const body = inflateSync(pdf.subarray(start, end)).toString('latin1')
      if (body.includes('beginbfchar') || body.includes('beginbfrange')) maps.push(body.toLowerCase())
    } catch {
      // Not a deflated stream (an image, say): nothing to read.
    }
  }
  return maps.join('\n')
}

describe('pdfFontStack', () => {
  it('orders Work Sans, then latin-ext for the rupee sign, then Devanagari', () => {
    // Arrange
    const families = { base: WORK_SANS_FAMILY, ext: WORK_SANS_EXT_FAMILY, devanagari: DEVANAGARI_FAMILY }

    // Act
    const stack = pdfFontStack(families)

    // Assert
    expect(stack).toEqual([WORK_SANS_FAMILY, WORK_SANS_EXT_FAMILY, DEVANAGARI_FAMILY])
  })

  it('falls back to Helvetica and keeps the extra families when Work Sans is missing', () => {
    // Arrange
    const families = { base: null, ext: null, devanagari: DEVANAGARI_FAMILY }

    // Act
    const stack = pdfFontStack(families)

    // Assert
    expect(stack).toEqual([PDF_FALLBACK_FAMILY, DEVANAGARI_FAMILY])
  })
})

describe('PDF font coverage', () => {
  it('registers Work Sans, its latin-ext subset and Noto Sans Devanagari in the page stack', () => {
    // Arrange, Act
    const registered = [PDF_FONT, PDF_EXT_FONT, PDF_DEVANAGARI_FONT]

    // Assert
    expect(registered).toEqual([WORK_SANS_FAMILY, WORK_SANS_EXT_FAMILY, DEVANAGARI_FAMILY])
    expect(PDF_FONT_STACK).toEqual([WORK_SANS_FAMILY, WORK_SANS_EXT_FAMILY, DEVANAGARI_FAMILY])
  })

  it('has a glyph for the rupee sign and for Devanagari', () => {
    // Arrange
    const fonts = stackFonts()

    // Act, Assert
    expect(covered(fonts, 0x20b9)).toBe(true)
    expect(covered(fonts, 0x0939)).toBe(true)
  })

  it('has a glyph for every character of the built-in letter wording', () => {
    // Arrange
    const fonts = stackFonts()
    const text = Object.values(BODIES).map((b) => `${b.subject}\n${b.body}`).join('\n')

    // Act
    const missing = [...new Set(text)].filter((ch) => !/\s/.test(ch) && !covered(fonts, ch.codePointAt(0) ?? 0))

    // Assert
    expect(missing).toEqual([])
  })

  it('prints ₹ and Hindi in a rendered letter, not a missing glyph', async () => {
    // Arrange
    const body = renderTemplate(BODIES.employee_offer.body, { 'employee.name': 'अनुज शर्मा', 'salary.ctcAnnual': '6,00,000' })
    const letter = { referenceNumber: 'OL/001', issueDate: '2026-10-11', employeeName: 'अनुज शर्मा', subject: 'Offer letter', body, signatoryName: 'Asha Rao', signatoryDesignation: 'Director', templateName: 'Offer letter' }
    const signature = { forName: 'Vistaar', name: 'Asha Rao', designation: 'Director', imageSrc: null, sealSrc: null }

    // Act
    const pdf = await renderPdf(LetterDocument({ org: { name: 'Vistaar' }, letter, signature: signature as never }))
    const maps = toUnicodeMaps(pdf)

    // Assert
    expect(body).toContain('₹')
    expect(maps).toContain('<20b9>')
    expect(maps).toContain('<0905>')
  }, 30_000)
})
