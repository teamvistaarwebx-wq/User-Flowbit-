/**
 * Money is integer paise everywhere. Convert at the edges (forms, display).
 */

/** A plain rupee amount once ₹, commas and spaces are removed: "1250", "1250.5", ".5", "-20". */
const RUPEE_AMOUNT = /^-?(\d+\.?\d*|\.\d+)$/

/**
 * Strict rupees -> integer paise. Returns null for anything that is not a
 * plain amount ("1.5L", "lots", "12abc", blank), so forms can refuse it
 * instead of saving a truncated or zero value.
 */
export const parseRupees = (rupees: number | string): number | null => {
  if (typeof rupees === 'number') return Number.isFinite(rupees) ? Math.round(rupees * 100) : null
  const cleaned = rupees.replace(/[₹,\s]/g, '')
  return RUPEE_AMOUNT.test(cleaned) ? Math.round(Number(cleaned) * 100) : null
}

/** Lenient rupees -> paise for live previews: anything that is not a plain amount counts as 0. */
export const rupeesToPaise = (rupees: number | string): number => parseRupees(rupees) ?? 0

export const paiseToRupees = (paise: number): number => Math.round(paise) / 100

const inr = (decimals: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: decimals, maximumFractionDigits: decimals })

/** ₹1,23,456.00 (en-IN grouping). `decimals: 0` drops paise. */
export function formatINR(paise: number, opts: { decimals?: 0 | 2 } = {}): string {
  const decimals = opts.decimals ?? 2
  // `|| 0` turns -0 (a negated zero, e.g. a credit note's absent CGST) into 0, which Intl would print as "-₹0.00".
  return inr(decimals).format(paiseToRupees(paise) || 0)
}

const plain = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Money for PDFs: "Rs. 1,23,456.00". The PDF font (Work Sans) has no rupee glyph, so ₹ prints as a broken character. */
export function formatINRForPrint(paise: number): string {
  return `Rs. ${plain.format(paiseToRupees(paise) || 0)}`
}

/** Compact Indian units: ₹950, ₹12.5K, ₹3.4L, ₹2.1Cr. */
export function formatINRCompact(paise: number): string {
  const rupees = paiseToRupees(paise)
  const sign = rupees < 0 ? '-' : ''
  const abs = Math.abs(rupees)
  const fmt = (n: number, unit: string) => `${sign}₹${Number(n.toFixed(n >= 100 ? 0 : 1))}${unit}`
  if (abs >= 1e7) return fmt(abs / 1e7, 'Cr')
  if (abs >= 1e5) return fmt(abs / 1e5, 'L')
  if (abs >= 1e3) return fmt(abs / 1e3, 'K')
  return `${sign}₹${Math.round(abs)}`
}

/** Plain number with en-IN grouping, no symbol: 1,23,456. */
export const formatNumber = (value: number, decimals = 0) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)

/** Percentage of a whole, rounded: pct(3, 4) -> 75. Zero-safe. */
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

/** Splits a paise amount by percentages that sum to 100, keeping the total exact. */
export function splitPaise(total: number, percents: number[]): number[] {
  const raw = percents.map((p) => Math.floor((total * p) / 100))
  const remainder = total - raw.reduce((a, b) => a + b, 0)
  return raw.map((v, i) => (i === 0 ? v + remainder : v))
}

/** Amount in words, Indian system: "Rupees One Lakh Twenty Thousand and Fifty Paise Only". */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100)
  const p = Math.abs(paise) % 100
  const words = rupees === 0 ? 'Zero' : indianWords(rupees)
  return `Rupees ${words}${p ? ` and ${indianWords(p)} Paise` : ''} Only`
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ')
}

function indianWords(n: number): string {
  const parts: string[] = []
  const crore = Math.floor(n / 1e7)
  const lakh = Math.floor((n % 1e7) / 1e5)
  const thousand = Math.floor((n % 1e5) / 1e3)
  const rest = n % 1e3
  if (crore) parts.push(`${crore >= 100 ? indianWords(crore) : twoDigits(crore)} Crore`)
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`)
  if (rest) parts.push(threeDigits(rest))
  return parts.join(' ')
}
