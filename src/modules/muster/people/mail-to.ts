/**
 * Pure: where HR mail (payslips, letters) goes. People who have left, and candidates who have not joined, rarely
 * read the work mailbox (it is closed, or not made yet), so their personal email is used when there is one (R1 3.8).
 */
const NOT_YET_JOINED = ['candidate', 'offered', 'joining_pending']

export function staffMailTo(p: { workEmail?: string | null; personalEmail?: string | null; status?: string | null; exitDate?: string | null }, today: string): string | null {
  const personal = p.personalEmail?.trim() || null
  const away = Boolean(p.exitDate && p.exitDate <= today) || NOT_YET_JOINED.includes(p.status ?? '')
  return (away && personal) || p.workEmail?.trim() || personal
}

/** What a send did: really left, only reached the Outbox (no provider), or failed (R1 3.7). */
export const mailOutcome = (sent: { ok: boolean; provider?: string | null }): 'sent' | 'outbox' | 'failed' => (!sent.ok ? 'failed' : sent.provider === 'outbox' ? 'outbox' : 'sent')
