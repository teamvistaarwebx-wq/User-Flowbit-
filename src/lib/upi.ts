import { encode } from 'uqr'

/**
 * UPI intent links and their QR (NPCI linking spec): any UPI app scans the
 * code and opens a payment to `pa` for `am` rupees, with the invoice number
 * as the note. Pure and client-safe.
 */

/** name@handle: 2–256 characters of letters, digits, dot, hyphen and underscore before the handle. */
const VPA = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/i

export const isValidVpa = (value: string | null | undefined): value is string => VPA.test((value ?? '').trim())

export type UpiIntentInput = Readonly<{
  /** The payee's UPI ID (VPA). */
  vpa: string
  /** The payee's name as UPI apps show it. */
  payee: string
  /** Whole paise; left out of the link when 0 so the payer types the amount. */
  amountPaise?: number
  /** Transaction note, e.g. the invoice number. */
  note?: string
}>

/** Rupees with two decimals, as the `am` parameter expects ("1180.00"). */
export const upiAmount = (paise: number): string => (Math.round(paise) / 100).toFixed(2)

const clean = (value: string, max: number) => value.replace(/[^\p{L}\p{N} .,&()/_-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max)

/** `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`, or null when the UPI ID is not valid. */
export function upiIntent(input: UpiIntentInput): string | null {
  const vpa = input.vpa.trim().toLowerCase()
  if (!isValidVpa(vpa)) return null
  const params = [
    ['pa', vpa],
    ['pn', clean(input.payee, 50) || 'Payee'],
    ...(input.amountPaise && input.amountPaise > 0 ? [['am', upiAmount(input.amountPaise)]] : []),
    ['cu', 'INR'],
    ...(input.note ? [['tn', clean(input.note, 80)]] : []),
  ]
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`
}

/** The QR modules (true = dark), quiet zone excluded. Error correction M survives a crumpled print. */
export function qrMatrix(text: string): boolean[][] {
  return encode(text, { ecc: 'M', border: 0 }).data
}

/** One SVG path (unit squares) drawing every dark module: small enough to inline on a page. */
export function qrPath(matrix: readonly (readonly boolean[])[]): string {
  return matrix.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join('')
}
