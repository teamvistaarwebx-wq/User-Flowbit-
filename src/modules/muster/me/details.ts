/** Self-service details: what changed and how to say so (pure). */

export const DETAIL_LABELS: Record<string, string> = {
  personalEmail: 'personal email',
  phone: 'phone',
  dob: 'date of birth',
  address: 'address',
  emergencyName: 'emergency contact name',
  emergencyPhone: 'emergency contact phone',
  emergencyRelation: 'emergency contact relation',
  pan: 'PAN',
  uan: 'UAN',
  bankName: 'bank name',
  accountName: 'account holder',
  accountNumber: 'account number',
  ifsc: 'IFSC',
}

export type DetailValues = Partial<Record<keyof typeof DETAIL_LABELS, string>>

/** Keys whose value differs (missing on either side counts as blank). */
export const changedDetails = (before: DetailValues, after: DetailValues): string[] =>
  Object.keys(after).filter((k) => after[k] !== undefined && (after[k] ?? '') !== (before[k] ?? ''))

const joinWords = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

export function detailsSavedMessage(changed: string[]): string {
  if (!changed.length) return 'Nothing had changed, so your details are as they were.'
  const bank = changed.some((k) => k === 'accountNumber' || k === 'ifsc')
  const base = `Saved your ${joinWords(changed.map((k) => DETAIL_LABELS[k] ?? k))}.`
  return bank ? `${base} Someone in HR or Finance will verify the new account before the next payroll run.` : base
}

/** "PAN: use the format ABCDE1234F" for one bad field; a general line for several. */
export function detailsRefusedMessage(fieldErrors: Record<string, string>): string {
  const entries = Object.entries(fieldErrors)
  if (entries.length === 1) return entries[0][1].includes(':') ? entries[0][1] : `${DETAIL_LABELS[entries[0][0]] ?? entries[0][0]}: ${entries[0][1]}`
  return 'Please correct the highlighted fields.'
}

/** HR-held facts an employee may ask HR to correct. */
export const CORRECTABLE_FIELDS = ['Name', 'Designation', 'Department', 'Reporting manager', 'Date of joining', 'Work email', 'Work location', 'Something else'] as const

/** Who a routed request is waiting on, in the employee's words. */
export const WAITING_ON: Record<string, string> = { manager: 'your manager', hr: 'HR', management: 'management' }
