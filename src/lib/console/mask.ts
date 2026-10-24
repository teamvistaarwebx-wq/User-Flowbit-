/**
 * Masking for support views (console spec 8): Flowbit staff never see salary,
 * bank or PAN values, whatever their role (owner decision D3). Pure.
 */

export const MASK = '••••'

/** "ABCDE1234F" -> "••••234F": enough to match a document on a call, not enough to use. */
export function maskTail(value: string | null | undefined, keep = 4): string {
  const text = (value ?? '').trim()
  if (!text) return '—'
  return text.length <= keep ? MASK : `${MASK}${text.slice(-keep)}`
}

export type SensitiveEmployee = {
  pan?: string | null
  bank?: { bankName?: string | null; accountName?: string | null; accountNumber?: string | null; ifsc?: string | null } | null
  /** Monthly gross in paise (from the salary structure), when known. */
  monthlyGrossPaise?: number | null
}

export type MaskedEmployee = {
  pan: string
  bankAccount: string
  ifsc: string
  salary: string
  masked: boolean
}

/**
 * The sensitive fields as a support view shows them: always masked, for every
 * staff role including Admin (owner decision D3, 11 Oct 2026). Enough of PAN
 * and the account number to match a document on a call, never the salary.
 */
export function maskEmployee(e: SensitiveEmployee): MaskedEmployee {
  return {
    pan: e.pan ? maskTail(e.pan) : '—',
    bankAccount: e.bank?.accountNumber ? maskTail(e.bank.accountNumber) : '—',
    ifsc: e.bank?.ifsc ? MASK : '—',
    salary: e.monthlyGrossPaise != null ? MASK : '—',
    masked: true,
  }
}

/** A client's PAN in a support view: masked for every staff role. GSTIN is public, so it stays. */
export const maskPan = (pan: string | null | undefined) => (pan ? maskTail(pan) : '—')

const RUPEE_AMOUNT = /₹\s?-?[\d,]+(?:\.\d+)?(?:\s?(?:lakh|crore|L|Cr))?/g
const PAN_PATTERN = /\b[A-Z]{5}\d{4}[A-Z]\b/g
/** Bank account numbers are 9 to 18 digits. */
const ACCOUNT_PATTERN = /\b\d{9,18}\b/g

/**
 * Free text from a workspace (audit summaries) as staff see it: rupee amounts,
 * PANs and account numbers masked, so a salary or bank detail in a summary
 * ("Salary structure saved for Asha: ₹65,000 a month") never reaches staff.
 */
export function maskSensitiveText(text: string | null | undefined): string {
  return (text ?? '')
    .replace(RUPEE_AMOUNT, `₹${MASK}`)
    .replace(PAN_PATTERN, (pan) => maskTail(pan))
    .replace(ACCOUNT_PATTERN, (n) => maskTail(n))
}

type TextRow = Readonly<{ label: string; errors: readonly string[]; warnings: readonly string[] }>

/** An import preview row as staff see it: its label and messages through maskSensitiveText (D3). */
export const maskPreviewRow = <R extends TextRow>(row: R): R => ({
  ...row,
  label: maskSensitiveText(row.label),
  errors: row.errors.map(maskSensitiveText),
  warnings: row.warnings.map(maskSensitiveText),
})
