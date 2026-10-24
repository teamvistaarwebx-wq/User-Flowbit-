/** Pure: the refusal when a month is locked with requests still waiting in it (R1 3.2). */

export type PendingInMonth = Readonly<{ leave: number; corrections: number; compOffs: number }>

export const pendingTotal = (p: PendingInMonth): number => p.leave + p.corrections + p.compOffs

/** "2 leave requests and 1 attendance correction", or null when nothing waits. */
export function pendingSummary(p: PendingInMonth): string | null {
  const parts = [
    p.leave ? `${p.leave} leave request${p.leave === 1 ? '' : 's'}` : null,
    p.corrections ? `${p.corrections} attendance correction${p.corrections === 1 ? '' : 's'}` : null,
    p.compOffs ? `${p.compOffs} comp-off request${p.compOffs === 1 ? '' : 's'}` : null,
  ].filter((x): x is string => Boolean(x))
  if (!parts.length) return null
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/** Why the lock is refused, or null: pending requests are stranded once locked, so locking over them must be explicit. */
export function pendingLockRefusal(p: PendingInMonth, monthLabel: string, lockAnyway: boolean): string | null {
  const summary = pendingSummary(p)
  if (!summary || lockAnyway) return null
  return `${summary} in ${monthLabel} ${pendingTotal(p) === 1 ? 'is' : 'are'} still waiting for a decision. Once the month is locked they can no longer be approved. Decide them first, or choose Lock anyway.`
}
