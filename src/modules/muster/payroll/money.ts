/**
 * Payroll arithmetic on integer paise (pure). Rupee values appear only at the
 * edges (statutory settings are stored in rupees because that is how the law
 * states them).
 */

export type Paise = number

export function toPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) throw new Error(`Expected a finite rupee amount, received ${rupees}`)
  return Math.round(rupees * 100)
}

export const toRupees = (paise: Paise): number => Math.round(paise) / 100

export function percentOf(base: Paise, percent: number): Paise {
  if (!Number.isFinite(percent)) throw new Error(`Expected a finite percentage, received ${percent}`)
  return Math.round((base * percent) / 100)
}

export const roundToRupee = (paise: Paise): Paise => Math.round(paise / 100) * 100
export const ceilToRupee = (paise: Paise): Paise => Math.ceil(paise / 100) * 100
export const sumPaise = (amounts: readonly Paise[]): Paise => amounts.reduce((total, amount) => total + amount, 0)

/**
 * Scales a full-month amount to the payable days. Guards a month with no
 * working days and payable days above working days.
 */
export function prorate(amount: Paise, payableDays: number, workingDays: number): Paise {
  if (workingDays <= 0) return 0
  if (payableDays >= workingDays) return amount
  if (payableDays <= 0) return 0
  return Math.round((amount * payableDays) / workingDays)
}

/** "XXXXXXXX1234": digits only; four or fewer shown as they are. */
export function maskAccount(accountNumber: string | null | undefined): string {
  const digits = (accountNumber ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length <= 4) return digits
  return `${'X'.repeat(Math.min(digits.length - 4, 8))}${digits.slice(-4)}`
}
