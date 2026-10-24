/**
 * PDF font families and the fallback stack react-pdf walks per character.
 * Work Sans "latin" covers ASCII and Western punctuation; its "latin-ext"
 * subset adds the rupee sign (U+20B9) and accented letters; Noto Sans
 * Devanagari covers Hindi. react-pdf picks the first family in the stack that
 * has a glyph for each code point, so English text stays in Work Sans and only
 * ₹ or Devanagari runs switch fonts.
 */

export const WORK_SANS_FAMILY = 'Work Sans'
export const WORK_SANS_EXT_FAMILY = 'Work Sans Ext'
export const DEVANAGARI_FAMILY = 'Noto Sans Devanagari'
export const PDF_FALLBACK_FAMILY = 'Helvetica'

/**
 * The page font stack from whichever families registered (null = missing).
 * With no Work Sans the PDF uses Helvetica, still followed by any extra
 * families so ₹ and Hindi keep their glyphs.
 */
export function pdfFontStack(families: { base: string | null; ext: string | null; devanagari: string | null }): string[] {
  const stack = [families.base ?? PDF_FALLBACK_FAMILY, families.ext, families.devanagari]
  return stack.filter((family): family is string => Boolean(family))
}
