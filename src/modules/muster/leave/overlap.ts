/** Pure: whether a new leave request clashes with an existing pending or approved one (R1 2.11). */

export type HalfDaySession = 'first' | 'second'
export const HALF_DAY_SESSIONS: readonly HalfDaySession[] = ['first', 'second']

type Span = Readonly<{ startDate: string; endDate: string; isHalfDay?: boolean | null; halfDaySession?: string | null }>

/** Date ranges that touch clash, except two half days on the same date in different halves (morning and afternoon). */
export function leaveOverlaps(existing: Span, incoming: Span): boolean {
  if (existing.startDate > incoming.endDate || existing.endDate < incoming.startDate) return false
  const bothHalves = existing.isHalfDay && incoming.isHalfDay && existing.startDate === incoming.startDate
  if (bothHalves && existing.halfDaySession && incoming.halfDaySession && existing.halfDaySession !== incoming.halfDaySession) return false
  return true
}

/** "₹ 2 paid, 1 loss of pay" style preview words for the leave form. */
export function leavePreviewText(p: { dayCount: number; paidDays: number; unpaidDays: number }): string {
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`
  if (!p.unpaidDays) return `${days(p.dayCount)}, all paid from the balance.`
  if (!p.paidDays) return `${days(p.dayCount)}, all as loss of pay.`
  return `${days(p.dayCount)}: ${days(p.paidDays)} paid from the balance, ${days(p.unpaidDays)} as loss of pay.`
}
