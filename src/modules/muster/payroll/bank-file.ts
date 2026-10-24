/**
 * Salary bulk-payment file for Indian net banking (pure). Three layouts: a
 * generic one most banks accept, and HDFC- and ICICI-style column sets.
 * Banks change their templates, so HR should check the bank's current one
 * before the first upload. Money in paise; amounts print as rupees.
 */

export const BANK_LAYOUTS = ['generic', 'hdfc', 'icici'] as const
export type BankLayout = (typeof BANK_LAYOUTS)[number]
export const BANK_LAYOUT_LABEL: Record<BankLayout, string> = { generic: 'Generic (most banks)', hdfc: 'HDFC-style', icici: 'ICICI-style' }

export const PAYMENT_MODES = ['NEFT', 'IMPS'] as const
export type PaymentMode = (typeof PAYMENT_MODES)[number]
/** IMPS carries at most ₹5,00,000 per transfer; larger salaries go by NEFT. */
export const IMPS_LIMIT_PAISE = 5_00_000_00
const NARRATION_MAX = 30
export const DEBIT_ACCOUNT = /^\d{9,18}$/
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/
const ACCOUNT = /^\d{6,20}$/

export type BankPayee = { code: string; name: string; accountName?: string | null; accountNumber?: string | null; ifsc?: string | null; email?: string | null; amountPaise: number; unverifiedChange?: boolean }
export type BankFileInput = { layout: BankLayout; payees: readonly BankPayee[]; debitAccount: string; mode: PaymentMode; valueDate: string; narration: string }
export type BankFile = { header: string[]; rows: string[][]; totalPaise: number }

/** Why a person cannot be paid by bank transfer, or null. */
export function payeeProblem(p: BankPayee): string | null {
  if (p.amountPaise <= 0) return 'nothing to pay'
  if (p.unverifiedChange) return 'bank account change not verified yet (verify it, then download again)'
  if (!p.accountNumber || !ACCOUNT.test(p.accountNumber)) return 'no bank account on record'
  if (!p.ifsc || !IFSC.test(p.ifsc.toUpperCase())) return 'no valid IFSC on record'
  return null
}

/** Letters, digits and spaces only, at most 30 characters (what bank narration fields take). */
export const cleanNarration = (text: string): string => text.replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NARRATION_MAX)

const rupees = (paise: number) => (Math.round(paise) / 100).toFixed(2)
const dmy = (iso: string, sep: string) => iso.split('-').reverse().join(sep)
const modeFor = (mode: PaymentMode, paise: number): PaymentMode => (mode === 'IMPS' && paise > IMPS_LIMIT_PAISE ? 'NEFT' : mode)

type Line = { p: BankPayee; mode: PaymentMode; amount: string; name: string; narration: string }
type LayoutDef = { header: string[]; row: (l: Line, i: BankFileInput) => string[] }

const LAYOUTS: Record<BankLayout, LayoutDef> = {
  generic: {
    header: ['Beneficiary Name', 'Beneficiary Account Number', 'IFSC', 'Amount', 'Payment Mode', 'Narration', 'Beneficiary Email', 'Debit Account Number', 'Value Date', 'Reference'],
    row: (l, i) => [l.name, l.p.accountNumber!, l.p.ifsc!.toUpperCase(), l.amount, l.mode, l.narration, l.p.email ?? '', i.debitAccount, dmy(i.valueDate, '/'), l.p.code],
  },
  hdfc: {
    header: ['Transaction Type', 'Beneficiary Code', 'Beneficiary Account Number', 'Instrument Amount', 'Beneficiary Name', 'Customer Reference Number', 'Payment Details', 'Value Date', 'IFSC Code', 'Beneficiary Email ID', 'Debit Account Number'],
    row: (l, i) => [l.mode === 'NEFT' ? 'N' : 'M', l.p.code, l.p.accountNumber!, l.amount, l.name, l.p.code, l.narration, dmy(i.valueDate, '/'), l.p.ifsc!.toUpperCase(), l.p.email ?? '', i.debitAccount],
  },
  icici: {
    header: ['Debit Ac No', 'Beneficiary Ac No', 'Beneficiary Name', 'Amt', 'Pay Mod', 'Date', 'IFSC', 'Bene Email ID', 'Remarks'],
    row: (l, i) => [i.debitAccount, l.p.accountNumber!, l.name, l.amount, l.mode === 'NEFT' ? 'N' : 'M', dmy(i.valueDate, '-'), l.p.ifsc!.toUpperCase(), l.p.email ?? '', l.narration],
  },
}

/** The file's header and rows for everyone who can be paid (others are left out; check `payeeProblem`). */
export function buildBankFile(input: BankFileInput): BankFile {
  const layout = LAYOUTS[input.layout]
  const narration = cleanNarration(input.narration)
  const payable = input.payees.filter((p) => !payeeProblem(p))
  const rows = payable.map((p) => layout.row({ p, mode: modeFor(input.mode, p.amountPaise), amount: rupees(p.amountPaise), name: (p.accountName || p.name).trim(), narration }, input))
  return { header: layout.header, rows, totalPaise: payable.reduce((s, p) => s + p.amountPaise, 0) }
}
