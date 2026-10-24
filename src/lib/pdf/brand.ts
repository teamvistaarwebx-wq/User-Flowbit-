import { contrastRatio, isHexColor, MIN_TEXT_CONTRAST, MIN_UI_CONTRAST, resolveTheme, workspaceTheme, type StoredTheme } from '@/lib/brand-theme'
import type { OrgLike } from '@/lib/plans'

/**
 * PDF colours from a workspace's brand (pure). PDFs are printed on white, so a brand colour that is too light
 * to read on paper is darkened until it is: headings need 4.5:1 against white, accents (rules, small labels in
 * capitals) 3:1. Without a brand, PDFs keep Flowbit's colours (the defaults map onto them exactly).
 */

export type PdfBrand = {
  /** Headings, the big title and the letterhead rule. */
  heading: string
  /** Small capitals labels and accents. */
  accent: string
  /** Text drawn on a heading-coloured fill (white or ink, whichever reads better). */
  onHeading: string
}

const PAPER = '#ffffff'
const INK = '#1a1626'
const STEP = 0.06
const MAX_STEPS = 20

export const FLOWBIT_PDF_BRAND: PdfBrand = { heading: '#4b2a8c', accent: '#bb62a5', onHeading: PAPER }

const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')

/** Mixes a colour towards black by `amount` (0–1). */
export function darken(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const scale = 1 - amount
  return `#${toHex(((n >> 16) & 255) * scale)}${toHex(((n >> 8) & 255) * scale)}${toHex((n & 255) * scale)}`
}

/** The colour itself when it reaches `min` contrast on white, else the lightest darker shade that does. */
export function readableOnPaper(hex: string, min: number): string {
  for (let i = 0; i <= MAX_STEPS; i += 1) {
    const shade = i === 0 ? hex.toLowerCase() : darken(hex, i * STEP)
    if (contrastRatio(shade, PAPER) >= min) return shade
  }
  return INK
}

/** White or ink, whichever contrasts more with the fill. */
export const textOn = (fill: string) => (contrastRatio(fill, PAPER) >= contrastRatio(fill, INK) ? PAPER : INK)

/** PDF colours for a stored workspace theme; null or an invalid theme gives Flowbit's. */
export function pdfBrandOf(stored: StoredTheme): PdfBrand {
  const hasOwn = Boolean(stored && (isHexColor(stored.secondary) || isHexColor(stored.primary)))
  if (!hasOwn) return FLOWBIT_PDF_BRAND
  const theme = resolveTheme(stored)
  const heading = readableOnPaper(theme.secondary, MIN_TEXT_CONTRAST)
  return { heading, accent: readableOnPaper(theme.primary, MIN_UI_CONTRAST), onHeading: textOn(heading) }
}

/** The workspace's PDF colours: the theme the app shell shows (lib/brand-theme workspaceTheme), darkened for paper. */
export const pdfBrandForOrg = (org: OrgLike & { theme?: StoredTheme }): PdfBrand => pdfBrandOf(workspaceTheme(org))
