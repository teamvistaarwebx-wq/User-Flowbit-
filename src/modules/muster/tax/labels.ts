/** Proof status words (pure, client-safe). */
export const PROOF_STATUS_LABEL: Record<string, string> = { none: 'No proofs yet', submitted: 'Proofs with HR', verified: 'Proofs verified', rejected: 'Proofs sent back' }
export const PROOF_STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = { none: 'neutral', submitted: 'info', verified: 'success', rejected: 'warning' }

/**
 * Form 130, Form 138 and section 392 are the Income-tax Act 2025 names, in force from tax year 2026-27.
 * Earlier years fall under the 1961 Act (Form 16, 24Q, s.192), which Flowbit does not produce (R1 3.4).
 */
export const FIRST_NEW_ACT_FY = '2026-27'
export const isNewActYear = (fy: string): boolean => /^\d{4}-\d{2}$/.test(fy) && fy >= FIRST_NEW_ACT_FY
export const OLD_ACT_REFUSAL = `Tax years before ${FIRST_NEW_ACT_FY} fall under the Income-tax Act, 1961 (Form 16 and 24Q). Flowbit's Form 130 and Form 138 cover ${FIRST_NEW_ACT_FY} onwards.`

/** The tax year before `fy` ('2027-28' → '2026-27'). */
export function previousFy(fy: string): string {
  const start = Number(fy.slice(0, 4)) - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}
