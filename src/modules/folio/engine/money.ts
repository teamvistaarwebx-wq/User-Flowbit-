/**
 * Folio money helpers (port of BillingOS `lib/money.ts`), for what core
 * `lib/money.ts` lacks. Every amount is integer paise; rupees exist only at
 * form input and at render.
 */

const PAISE_PER_RUPEE = 100

/** A whole number of paise. */
export type Paise = number

export function toPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) throw new Error(`Expected a finite rupee amount, received ${rupees}`)
  return Math.round(rupees * PAISE_PER_RUPEE)
}

export function toRupees(paise: Paise): number {
  return Math.round(paise) / PAISE_PER_RUPEE
}

export function percentOf(base: Paise, percent: number): Paise {
  if (!Number.isFinite(percent)) throw new Error(`Expected a finite percentage, received ${percent}`)
  return Math.round((base * percent) / 100)
}

/** Nearest rupee. JavaScript rounds .5 up, so the round-off runs from -₹0.49 to +₹0.50. */
export function roundToRupee(paise: Paise): Paise {
  return Math.round(paise / PAISE_PER_RUPEE) * PAISE_PER_RUPEE
}

export function sumPaise(amounts: readonly Paise[]): Paise {
  return amounts.reduce((total, amount) => total + amount, 0)
}

/** Money for PDFs: "Rs. 1,23,456.00" (core helper; the PDF font has no rupee glyph). */
export { formatINRForPrint } from '@/lib/money'

/** Rupees with two decimals as a plain string for inputs: 125000 -> "1250.00"; 0 -> "". */
export function rupeesInput(paise: Paise | null | undefined): string {
  return paise ? (paise / PAISE_PER_RUPEE).toFixed(2) : ''
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigitsToWords(value: number): string[] {
  if (value === 0) return []
  if (value < 20) return [ONES[value]]
  const tens = TENS[Math.floor(value / 10)]
  const ones = ONES[value % 10]
  return ones ? [tens, ones] : [tens]
}

/** Spells a whole number on the Indian crore / lakh scale. */
export function integerToWords(value: number): string[] {
  if (value === 0) return ['Zero']
  const words: string[] = []
  const crore = Math.floor(value / 1_00_00_000)
  let rest = value % 1_00_00_000
  if (crore > 0) words.push(...integerToWords(crore), 'Crore')
  const lakh = Math.floor(rest / 1_00_000)
  rest %= 1_00_000
  if (lakh > 0) words.push(...twoDigitsToWords(lakh), 'Lakh')
  const thousand = Math.floor(rest / 1_000)
  rest %= 1_000
  if (thousand > 0) words.push(...twoDigitsToWords(thousand), 'Thousand')
  const hundred = Math.floor(rest / 100)
  rest %= 100
  if (hundred > 0) words.push(ONES[hundred], 'Hundred')
  words.push(...twoDigitsToWords(rest))
  return words
}

/** "Fifty Thousand Seven Hundred Sixty Nine Rupees Only"; "Minus …" for negatives. */
export function amountInWords(paise: Paise): string {
  const rounded = Math.round(Math.abs(paise))
  const rupees = Math.floor(rounded / PAISE_PER_RUPEE)
  const remainder = rounded % PAISE_PER_RUPEE
  const parts = [...integerToWords(rupees), 'Rupees']
  if (remainder > 0) parts.push('and', ...integerToWords(remainder), 'Paise')
  parts.push('Only')
  return (paise < 0 ? 'Minus ' : '') + parts.join(' ')
}
