/**
 * Comp-off credits consumed oldest-expiry first (pure). A credit that was
 * used before it expired stays counted as earned, so the balance does not
 * drop below zero on the day a used credit's expiry passes; only the unused
 * part of an expired credit lapses.
 */

export type CompOffCredit = { days: number; expiresOn?: string | null }
export type CompOffUse = { startDate: string; paidDays: number }

const r2 = (n: number) => Math.round(n * 100) / 100

/** Days earned that still count on `asOf`: unexpired credits plus the used part of expired ones. */
export function compOffEarned(credits: readonly CompOffCredit[], uses: readonly CompOffUse[], asOf: string): number {
  const pool = [...credits]
    .sort((a, b) => (a.expiresOn ?? '9999-12-31').localeCompare(b.expiresOn ?? '9999-12-31'))
    .map((c) => ({ ...c, left: c.days }))
  for (const use of [...uses].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    let need = use.paidDays
    for (const credit of pool) {
      if (need <= 0) break
      if (credit.left <= 0 || (credit.expiresOn && credit.expiresOn < use.startDate)) continue
      const take = Math.min(credit.left, need)
      credit.left = r2(credit.left - take)
      need = r2(need - take)
    }
  }
  return r2(pool.reduce((sum, c) => sum + (c.expiresOn && c.expiresOn < asOf ? c.days - c.left : c.days), 0))
}
